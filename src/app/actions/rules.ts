"use server";

import { and, asc, eq, max, sql } from "drizzle-orm";
import type {
  Rule,
  RuleInput,
  RulePreview,
  RulePreviewRow,
} from "@/app/actions/rules-types";
import { buildFilterWhere } from "@/app/actions/transaction-filter";
import type {
  TransactionFilter,
  TransactionRow,
} from "@/app/actions/transactions-types";
import { db } from "@/db";
import { accounts, categories, rules, transactions } from "@/db/schema";
import { compileRegex, isValidRegex, matchesRule } from "@/utils/rules";

/** Validate a rule input, throwing on the first problem found. */
function validateRuleInput(input: RuleInput): void {
  if (input.name.trim().length === 0) {
    throw new Error("Rule name cannot be empty.");
  }
  if (input.descriptionRegex && !isValidRegex(input.descriptionRegex)) {
    throw new Error("Description regex is not a valid regular expression.");
  }
  if (
    input.minAmount !== null &&
    input.maxAmount !== null &&
    input.minAmount > input.maxAmount
  ) {
    throw new Error("Minimum amount cannot be greater than maximum amount.");
  }
  // At least one matching criterion is required (accounts, amount, or regex).
  const hasAccounts = input.accountIds.length > 0;
  const hasAmount = input.minAmount !== null || input.maxAmount !== null;
  const hasRegex = Boolean(input.descriptionRegex);
  if (!hasAccounts && !hasAmount && !hasRegex) {
    throw new Error(
      "A rule needs at least one criterion: accounts, an amount range, or a description regex.",
    );
  }
}

/** List rules ordered by `position`, with the assigned category name resolved. */
export async function getRules(): Promise<Rule[]> {
  const rows = await db
    .select({
      id: rules.id,
      name: rules.name,
      position: rules.position,
      accountIds: rules.accountIds,
      minAmount: rules.minAmount,
      maxAmount: rules.maxAmount,
      descriptionRegex: rules.descriptionRegex,
      categoryId: rules.categoryId,
      categoryName: categories.name,
    })
    .from(rules)
    .leftJoin(categories, eq(rules.categoryId, categories.id))
    .orderBy(asc(rules.position));

  return rows.map((row) => ({ ...row, accountIds: row.accountIds ?? [] }));
}

/**
 * Create a rule at the end of the order.
 *
 * @throws when the input is invalid (empty name/regex, bad regex, min > max).
 */
export async function addRule(input: RuleInput): Promise<Rule> {
  validateRuleInput(input);

  const [{ value: maxPosition } = { value: null }] = await db
    .select({ value: max(rules.position) })
    .from(rules);

  const inserted = await db
    .insert(rules)
    .values({
      name: input.name.trim(),
      position: (maxPosition ?? -1) + 1,
      accountIds: input.accountIds,
      minAmount: input.minAmount,
      maxAmount: input.maxAmount,
      descriptionRegex: input.descriptionRegex,
      categoryId: input.categoryId,
      createdAt: Date.now(),
    })
    .returning({ id: rules.id });

  const [created] = await getRulesByIds([inserted[0].id]);
  return created;
}

/**
 * Update an existing rule.
 *
 * @throws when the input is invalid.
 */
export async function updateRule(id: number, input: RuleInput): Promise<Rule> {
  validateRuleInput(input);

  await db
    .update(rules)
    .set({
      name: input.name.trim(),
      accountIds: input.accountIds,
      minAmount: input.minAmount,
      maxAmount: input.maxAmount,
      descriptionRegex: input.descriptionRegex,
      categoryId: input.categoryId,
    })
    .where(eq(rules.id, id));

  const [updated] = await getRulesByIds([id]);
  return updated;
}

/** Delete a rule. */
export async function deleteRule(id: number): Promise<void> {
  await db.delete(rules).where(eq(rules.id, id));
}

/**
 * Persist a new rule ordering. Each id's new `position` is its index.
 */
export async function reorderRules(orderedIds: number[]): Promise<void> {
  db.transaction((tx) => {
    orderedIds.forEach((id, index) => {
      tx.update(rules).set({ position: index }).where(eq(rules.id, id)).run();
    });
  });
}

/** Internal: fetch specific rules with resolved category name. */
async function getRulesByIds(ids: number[]): Promise<Rule[]> {
  const all = await getRules();
  const set = new Set(ids);
  return all.filter((r) => set.has(r.id));
}

/**
 * Load the transactions matching a filter, joined for table display. Mirrors
 * `getTransactionsPage`'s select but returns every matching row (no paging).
 */
async function getMatchingTransactions(
  filter: TransactionFilter,
): Promise<TransactionRow[]> {
  const rows = await db
    .select({
      id: transactions.id,
      accountId: transactions.accountId,
      accountName: sql<string>`COALESCE(${accounts.nickname}, ${accounts.name})`,
      currency: accounts.currency,
      amount: transactions.amount,
      posted: transactions.posted,
      pending: transactions.pending,
      description: transactions.description,
      categoryId: transactions.categoryId,
      categoryName: categories.name,
      shared: transactions.shared,
      inspected: transactions.inspected,
    })
    .from(transactions)
    .innerJoin(accounts, eq(transactions.accountId, accounts.id))
    .leftJoin(categories, eq(transactions.categoryId, categories.id))
    .where(buildFilterWhere(filter));

  return rows.map((row) => ({
    ...row,
    shared: row.shared ? row.shared.getTime() : null,
    inspected: row.inspected ? row.inspected.getTime() : null,
  }));
}

/**
 * Compute, for the first matching rule per transaction, the category change
 * each transaction in `filter` would receive. Only rows whose category would
 * actually change are returned.
 */
async function computeRuleChanges(filter: TransactionFilter): Promise<{
  changes: RulePreviewRow[];
  invalidRuleNames: string[];
}> {
  const [txns, ruleList] = await Promise.all([
    getMatchingTransactions(filter),
    getRules(),
  ]);

  // Precompile each rule's regex once. A null pattern means "no description
  // check"; a non-null pattern that fails to compile makes the rule invalid
  // (skipped + warned about).
  const invalidRuleNames: string[] = [];
  const compiled = ruleList.map((rule) => {
    const regex = rule.descriptionRegex
      ? compileRegex(rule.descriptionRegex)
      : null;
    const invalid = Boolean(rule.descriptionRegex) && regex === null;
    if (invalid) invalidRuleNames.push(rule.name);
    return { rule, regex, invalid };
  });

  const changes: RulePreviewRow[] = [];
  for (const txn of txns) {
    for (const { rule, regex, invalid } of compiled) {
      if (invalid) continue;
      const matched = matchesRule(
        {
          accountIds: rule.accountIds.length > 0 ? rule.accountIds : null,
          minAmount: rule.minAmount,
          maxAmount: rule.maxAmount,
          descriptionRegex: rule.descriptionRegex,
        },
        txn,
        regex,
      );
      if (!matched) continue;

      // First matching rule wins; only record actual category changes.
      if (txn.categoryId !== rule.categoryId) {
        changes.push({
          txn,
          oldCategoryName: txn.categoryName,
          newCategoryId: rule.categoryId,
          newCategoryName: rule.categoryName ?? "(unknown)",
          ruleName: rule.name,
        });
      }
      break;
    }
  }

  return { changes, invalidRuleNames };
}

/**
 * Preview applying all rules to the transactions matched by `filter`.
 *
 * @returns the planned category changes and any rules skipped for bad regex.
 */
export async function previewRulesForFilter(
  filter: TransactionFilter,
): Promise<RulePreview> {
  return computeRuleChanges(filter);
}

/** Composite key (`accountId:id`) identifying a transaction. */
function txnKey(accountId: string, id: string): string {
  return `${accountId}:${id}`;
}

/**
 * Apply all rules to the transactions matched by `filter`, setting each
 * affected transaction's category. The plan is recomputed server-side (the
 * preview is advisory), then persisted in a single transaction.
 *
 * @param filter the active filter set.
 * @param skipKeys composite `accountId:id` keys to exclude from the apply
 *   (rows the user unchecked in the preview).
 * @returns the number of transactions updated.
 */
export async function applyRulesForFilter(
  filter: TransactionFilter,
  skipKeys: string[] = [],
): Promise<number> {
  const { changes } = await computeRuleChanges(filter);
  const skip = new Set(skipKeys);
  const applied = changes.filter(
    (c) => !skip.has(txnKey(c.txn.accountId, c.txn.id)),
  );
  const now = Date.now();

  db.transaction((tx) => {
    for (const change of applied) {
      tx.update(transactions)
        .set({ categoryId: change.newCategoryId, updatedAt: now })
        .where(
          and(
            eq(transactions.accountId, change.txn.accountId),
            eq(transactions.id, change.txn.id),
          ),
        )
        .run();
    }
  });

  return applied.length;
}
