"use server";

import { and, asc, count, desc, eq, sql } from "drizzle-orm";
import { buildFilterWhere } from "@/app/actions/transaction-filter";
import type {
  AccountOption,
  TransactionFilter,
  TransactionFlag,
  TransactionsPage,
  TransactionsQuery,
} from "@/app/actions/transactions-types";
import { db } from "@/db";
import { accounts, categories, transactions } from "@/db/schema";

/** Map a sort key to its column for ORDER BY. */
const SORT_COLUMNS = {
  posted: transactions.posted,
  amount: transactions.amount,
  description: transactions.description,
} as const;

/**
 * Read a page of transactions (joined with their account) for the table.
 *
 * Results are ordered by the requested column and direction, with a stable
 * `posted DESC, id ASC` tiebreaker so pagination is deterministic.
 *
 * @param query pagination, sort, and optional account/category/inspected/
 *   shared filters.
 * @returns the page rows plus the total matching row count.
 */
export async function getTransactionsPage(
  query: TransactionsQuery,
): Promise<TransactionsPage> {
  const { page, pageSize, sort, dir } = query;

  const sortColumn = SORT_COLUMNS[sort];
  const direction = dir === "asc" ? asc : desc;

  const where = buildFilterWhere(query);

  const [rows, totalRows] = await Promise.all([
    db
      .select({
        id: transactions.id,
        accountId: transactions.accountId,
        // Display name: nickname when set, otherwise the real account name.
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
      .where(where)
      .orderBy(
        direction(sortColumn),
        desc(transactions.posted),
        asc(transactions.id),
      )
      .limit(pageSize)
      .offset(page * pageSize),
    db.select({ value: count() }).from(transactions).where(where),
  ]);

  return {
    rows: rows.map((row) => ({
      ...row,
      // Drizzle returns timestamp_ms columns as Date | null; expose epoch ms.
      shared: row.shared ? row.shared.getTime() : null,
      inspected: row.inspected ? row.inspected.getTime() : null,
    })),
    total: totalRows[0]?.value ?? 0,
  };
}

/**
 * Assign (or clear) a transaction's category.
 *
 * @param accountId owning account id (part of the composite key).
 * @param id transaction id.
 * @param categoryId the category to assign, or `null` to clear.
 */
export async function setTransactionCategory(
  accountId: string,
  id: string,
  categoryId: number | null,
): Promise<void> {
  await db
    .update(transactions)
    .set({ categoryId, updatedAt: Date.now() })
    .where(and(eq(transactions.accountId, accountId), eq(transactions.id, id)));
}

/**
 * Toggle a transaction's `shared`/`inspected` flag.
 *
 * @param accountId owning account id (part of the composite key).
 * @param id transaction id.
 * @param flag which timestamp column to set.
 * @param value `true` sets the column to now; `false` clears it to null.
 */
export async function setTransactionFlag(
  accountId: string,
  id: string,
  flag: TransactionFlag,
  value: boolean,
): Promise<void> {
  const timestamp = value ? new Date() : null;
  await db
    .update(transactions)
    .set({ [flag]: timestamp, updatedAt: Date.now() })
    .where(and(eq(transactions.accountId, accountId), eq(transactions.id, id)));
}

/**
 * Bulk-set a timestamp flag for every transaction matching `filter`.
 *
 * Used by the bulk action buttons to mark all transactions in the current
 * filter set as inspected/shared (timestamp = now).
 *
 * @param filter the active filter set (same shape used by the table).
 * @param flag which timestamp column to set.
 * @param value `true` sets each matching row to now; `false` clears them.
 * @returns the number of rows updated.
 */
export async function setFlagForFilter(
  filter: TransactionFilter,
  flag: TransactionFlag,
  value: boolean,
): Promise<number> {
  const timestamp = value ? new Date() : null;
  const result = await db
    .update(transactions)
    .set({ [flag]: timestamp, updatedAt: Date.now() })
    .where(buildFilterWhere(filter));
  return result.changes;
}

/**
 * Fetch all transactions matching `filter` for export, ordered newest-first.
 *
 * Returns only the fields needed for the export format: posted date, amount,
 * category name, and description.
 *
 * @param filter the active filter set (same shape used by the table).
 */
export async function getTransactionsForExport(
  filter: TransactionFilter,
): Promise<
  {
    posted: number;
    amount: number;
    categoryName: string | null;
    description: string;
  }[]
> {
  return db
    .select({
      posted: transactions.posted,
      amount: transactions.amount,
      categoryName: categories.name,
      description: transactions.description,
    })
    .from(transactions)
    .leftJoin(categories, eq(transactions.categoryId, categories.id))
    .where(buildFilterWhere(filter))
    .orderBy(desc(transactions.posted), asc(transactions.id));
}

/**
 * List all accounts for the transactions filter dropdown, ordered by name.
 *
 * The `name` is the display name (nickname when set, otherwise the real name).
 */
export async function getAccountsList(): Promise<AccountOption[]> {
  return db
    .select({
      id: accounts.id,
      name: sql<string>`COALESCE(${accounts.nickname}, ${accounts.name})`,
    })
    .from(accounts)
    .orderBy(asc(accounts.name));
}
