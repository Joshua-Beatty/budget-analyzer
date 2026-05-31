"use server";

import { asc, eq, inArray } from "drizzle-orm";
import type { AccountNicknameRow } from "@/app/actions/accounts-types";
import { db } from "@/db";
import { accounts, transactions } from "@/db/schema";

/**
 * List accounts that have at least one transaction, with their real name and
 * current nickname, ordered by name.
 */
export async function getAccountsWithTransactions(): Promise<
  AccountNicknameRow[]
> {
  return db
    .select({
      id: accounts.id,
      name: accounts.name,
      nickname: accounts.nickname,
    })
    .from(accounts)
    .where(
      inArray(
        accounts.id,
        db.selectDistinct({ id: transactions.accountId }).from(transactions),
      ),
    )
    .orderBy(asc(accounts.name));
}

/**
 * Set or clear an account's nickname.
 *
 * @param id the account id.
 * @param nickname the new nickname; an empty/blank value clears it (null).
 */
export async function setAccountNickname(
  id: string,
  nickname: string | null,
): Promise<void> {
  const trimmed = nickname?.trim();
  await db
    .update(accounts)
    .set({
      nickname: trimmed && trimmed.length > 0 ? trimmed : null,
      updatedAt: Date.now(),
    })
    .where(eq(accounts.id, id));
}
