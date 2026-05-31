/**
 * Shared types for the accounts action.
 *
 * These live outside the `"use server"` module (`accounts.ts`) because such
 * files may only export async functions.
 */

/** An account that has transactions, with its real name and optional nickname. */
export type AccountNicknameRow = {
  id: string;
  /** Original SimpleFIN account name. */
  name: string;
  /** User-defined nickname, or null when unset. */
  nickname: string | null;
};
