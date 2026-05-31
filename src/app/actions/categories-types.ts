/**
 * Shared types for the categories action.
 *
 * These live outside the `"use server"` module (`categories.ts`) because such
 * files may only export async functions.
 */

/** A user-defined category (active, i.e. not soft-deleted). */
export type Category = {
  id: number;
  name: string;
  /** 0-based display order. */
  position: number;
};
