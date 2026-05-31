/**
 * Shared types for the SimpleFIN sync action.
 *
 * These live outside the `"use server"` module (`sync.ts`) because such files
 * may only export async functions. Importing types from here keeps the action
 * and its UI in sync.
 */

/** Summary returned by a sync run. */
export type SyncResult = {
  /** Number of accounts inserted or updated. */
  accountsUpserted: number;
  /** Number of transactions inserted or updated. */
  transactionsUpserted: number;
  /**
   * Human-readable error messages surfaced from the Account Set `errlist`
   * (e.g. a connection that failed to refresh). These are non-fatal: the rest
   * of the data is still persisted.
   */
  errors: string[];
  /** Epoch ms when this sync completed. */
  syncedAt: number;
};
