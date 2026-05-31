/**
 * Shared types for the transactions query action.
 *
 * These live outside the `"use server"` module (`transactions.ts`) because such
 * files may only export async functions.
 */

/** A single transaction row joined with its account, for table display. */
export type TransactionRow = {
  /** Transaction id (unique within its account). */
  id: string;
  /** Owning account id. */
  accountId: string;
  /** Display name of the owning account. */
  accountName: string;
  /** Raw account currency (ISO 4217 code or custom-currency URL). */
  currency: string;
  /** Amount in integer minor units (cents); negative = money leaving. */
  amount: number;
  /** Unix epoch (seconds) the transaction posted. */
  posted: number;
  /** Whether the transaction is still pending. */
  pending: boolean;
  /** Human-readable description. */
  description: string;
  /** Assigned category id, or null when unset. */
  categoryId: number | null;
  /** Resolved category name (incl. soft-deleted), or null when unset. */
  categoryName: string | null;
  /** Epoch ms the transaction was marked shared, or null. */
  shared: number | null;
  /** Epoch ms the transaction was marked inspected, or null. */
  inspected: number | null;
};

/** A category option for the per-row category dropdown. */
export type CategoryOption = {
  id: number;
  name: string;
};

/** A boolean timestamp flag column that can be toggled. */
export type TransactionFlag = "shared" | "inspected";

/**
 * Category filter:
 * - a numeric id restricts to that category,
 * - `"none"` restricts to transactions with no category,
 * - `"any"` restricts to transactions that have a category,
 * - `undefined` applies no category filter.
 */
export type CategoryFilter = number | "none" | "any";

/** Columns the transactions table can be sorted by. */
export type TransactionSort = "posted" | "amount" | "description";

/** Sort direction. */
export type SortDir = "asc" | "desc";

/** The set of filters that narrow which transactions are matched. */
export type TransactionFilter = {
  /** Restrict to a single account id, when provided. */
  accountId?: string;
  /** Restrict by category (id, `"none"`, or `"any"`), when provided. */
  category?: CategoryFilter;
  /** Restrict by whether the transaction is inspected, when provided. */
  inspected?: boolean;
  /** Restrict by whether the transaction is shared, when provided. */
  shared?: boolean;
};

/** Parameters accepted by the paginated transactions query. */
export type TransactionsQuery = TransactionFilter & {
  /** Zero-based page index. */
  page: number;
  /** Rows per page. */
  pageSize: number;
  /** Column to sort by. */
  sort: TransactionSort;
  /** Sort direction. */
  dir: SortDir;
};

/** A page of transactions plus the total row count for pagination. */
export type TransactionsPage = {
  rows: TransactionRow[];
  total: number;
};

/** An account option for the filter dropdown. */
export type AccountOption = {
  id: string;
  name: string;
};

/** Allowed page sizes for the transactions table. */
export const PAGE_SIZES = [20, 50, 100, 200] as const;

/** Default page size. */
export const DEFAULT_PAGE_SIZE = 20;
