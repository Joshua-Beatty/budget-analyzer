/**
 * Shared types for the rules action.
 *
 * These live outside the `"use server"` module (`rules.ts`) because such files
 * may only export async functions.
 */

import type { TransactionRow } from "@/app/actions/transactions-types";

/** A category-assignment rule, with its category name resolved for display. */
export type Rule = {
  id: number;
  name: string;
  /** 0-based order; lower runs first (first match wins). */
  position: number;
  /** Account ids the rule applies to; empty means all accounts. */
  accountIds: string[];
  /** Minimum signed amount in cents (inclusive), or null. */
  minAmount: number | null;
  /** Maximum signed amount in cents (inclusive), or null. */
  maxAmount: number | null;
  /** Case-insensitive regex matched against the description; null = no check. */
  descriptionRegex: string | null;
  /** Category assigned to matching transactions. */
  categoryId: number;
  /** Resolved category name (incl. soft-deleted), or null if missing. */
  categoryName: string | null;
};

/** Input for creating or updating a rule. */
export type RuleInput = {
  name: string;
  accountIds: string[];
  minAmount: number | null;
  maxAmount: number | null;
  descriptionRegex: string | null;
  categoryId: number;
};

/** A single planned category change, shown in the apply-rules preview. */
export type RulePreviewRow = {
  /** The transaction that will change (for table display). */
  txn: TransactionRow;
  /** Current category name, or null when uncategorized. */
  oldCategoryName: string | null;
  /** Category id the matching rule will set. */
  newCategoryId: number;
  /** Name of the category the rule will set. */
  newCategoryName: string;
  /** Name of the rule that matched. */
  ruleName: string;
};

/** Result of computing an apply-rules preview. */
export type RulePreview = {
  /** Rows whose category will change. */
  changes: RulePreviewRow[];
  /** Names of rules skipped because their regex failed to compile. */
  invalidRuleNames: string[];
};
