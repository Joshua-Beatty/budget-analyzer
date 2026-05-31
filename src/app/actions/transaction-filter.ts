/**
 * Shared SQL filter builder for transactions.
 *
 * Kept in a non-`"use server"` module so multiple server actions
 * (`transactions.ts`, `rules.ts`) can import the same filter semantics. It
 * returns a Drizzle `SQL` condition and so must not be exported from a
 * `"use server"` file.
 */

import { and, eq, isNotNull, isNull, type SQL } from "drizzle-orm";
import type { TransactionFilter } from "@/app/actions/transactions-types";
import { transactions } from "@/db/schema";

/**
 * Build the SQL `WHERE` condition for a {@link TransactionFilter}.
 *
 * @returns a combined condition, or `undefined` when no filter is active.
 */
export function buildFilterWhere(filter: TransactionFilter): SQL | undefined {
  const { accountId, category, inspected, shared } = filter;
  const conditions: SQL[] = [];

  if (accountId) {
    conditions.push(eq(transactions.accountId, accountId));
  }
  if (category === "none") {
    conditions.push(isNull(transactions.categoryId));
  } else if (category === "any") {
    conditions.push(isNotNull(transactions.categoryId));
  } else if (typeof category === "number") {
    conditions.push(eq(transactions.categoryId, category));
  }
  if (inspected !== undefined) {
    conditions.push(
      inspected
        ? isNotNull(transactions.inspected)
        : isNull(transactions.inspected),
    );
  }
  if (shared !== undefined) {
    conditions.push(
      shared ? isNotNull(transactions.shared) : isNull(transactions.shared),
    );
  }

  return conditions.length > 0 ? and(...conditions) : undefined;
}
