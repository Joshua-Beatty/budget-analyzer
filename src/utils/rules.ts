/**
 * Framework-agnostic rule matching logic (no React/DB imports).
 *
 * A rule matches a transaction when all of its (optional) criteria hold:
 * the transaction's account is in the rule's account list (empty = any), the
 * signed amount falls within the rule's min/max range (each optional,
 * inclusive), and the description matches the rule's case-insensitive regex.
 */

/** The criteria portion of a rule needed to evaluate a match. */
export type RuleCriteria = {
  /** Account ids the rule applies to; null/empty means all accounts. */
  accountIds: string[] | null;
  /** Minimum signed amount in cents (inclusive), or null. */
  minAmount: number | null;
  /** Maximum signed amount in cents (inclusive), or null. */
  maxAmount: number | null;
  /** Case-insensitive regex pattern for the description; null = no check. */
  descriptionRegex: string | null;
};

/** The transaction fields needed to evaluate a rule. */
export type MatchableTransaction = {
  accountId: string;
  /** Signed amount in cents. */
  amount: number;
  description: string;
};

/**
 * Validate a regex pattern.
 *
 * @returns `true` when the pattern compiles, `false` otherwise.
 */
export function isValidRegex(pattern: string): boolean {
  try {
    new RegExp(pattern, "i");
    return true;
  } catch {
    return false;
  }
}

/**
 * Compile a description regex (case-insensitive).
 *
 * @returns the compiled `RegExp`, or `null` when the pattern is invalid.
 */
export function compileRegex(pattern: string): RegExp | null {
  try {
    return new RegExp(pattern, "i");
  } catch {
    return null;
  }
}

/**
 * Whether a transaction matches a rule's criteria.
 *
 * @param criteria the rule criteria.
 * @param txn the transaction to test.
 * @param regex a precompiled regex for `criteria.descriptionRegex`. Pass this
 *   to avoid recompiling per transaction; when omitted it is compiled here.
 * @returns `true` when all criteria hold. An invalid regex never matches.
 */
export function matchesRule(
  criteria: RuleCriteria,
  txn: MatchableTransaction,
  regex?: RegExp | null,
): boolean {
  // Accounts: empty/null list means "any account".
  if (
    criteria.accountIds &&
    criteria.accountIds.length > 0 &&
    !criteria.accountIds.includes(txn.accountId)
  ) {
    return false;
  }

  // Amount range (inclusive, signed).
  if (criteria.minAmount !== null && txn.amount < criteria.minAmount) {
    return false;
  }
  if (criteria.maxAmount !== null && txn.amount > criteria.maxAmount) {
    return false;
  }

  // Description regex (optional). An empty/null pattern means no description
  // check; an invalid pattern never matches.
  if (criteria.descriptionRegex) {
    const compiled =
      regex === undefined ? compileRegex(criteria.descriptionRegex) : regex;
    if (compiled === null || !compiled.test(txn.description)) {
      return false;
    }
  }

  return true;
}
