"use server";

import { getSetting, setSetting } from "@/app/actions/settings";
import { getAccounts } from "@/app/actions/simplefin";
import type { SyncResult } from "@/app/actions/sync-types";
import { db } from "@/db";
import { accounts, transactions } from "@/db/schema";
import { toCents } from "@/utils/money";
import type { Account, SimpleFinError } from "@/utils/simplefin";

/**
 * Settings key under which the epoch-ms timestamp of the last successful sync
 * is stored (in the `meta_data_table`).
 */
const LAST_SYNC_SETTING_KEY = "simplefin_last_sync_at";

/**
 * On an incremental sync, transactions are fetched starting this far before the
 * previous sync timestamp, to catch any late-posting or amended transactions.
 */
const SYNC_OVERLAP_MS = 14 * 24 * 60 * 60 * 1000; // 14 days

/**
 * Size of each historical fetch window, in seconds.
 *
 * The SimpleFIN Bridge recommends a request range of at most 45 days (and warns
 * that larger ranges may be capped in the future), so a historical sync is
 * paginated into windows no larger than this.
 */
const WINDOW_SECONDS = 45 * 24 * 60 * 60; // 45 days

/** Average seconds per month, used to convert a "months back" request. */
const MONTH_SECONDS = Math.floor((365.25 / 12) * 24 * 60 * 60);

/**
 * Read the epoch-ms timestamp of the last successful sync, if any.
 *
 * @returns the timestamp, or `undefined` when no sync has completed yet.
 */
export async function getLastSyncAt(): Promise<number | undefined> {
  const setting = await getSetting(LAST_SYNC_SETTING_KEY);
  const value = setting?.value;
  return typeof value === "number" ? value : undefined;
}

/** Format a server error for display, including any connection/account id. */
function formatError(err: SimpleFinError): string {
  const scope = err.conn_id ?? err.account_id;
  return scope
    ? `${err.code}: ${err.msg} (${scope})`
    : `${err.code}: ${err.msg}`;
}

/**
 * Upsert one fetched window of accounts (and their transactions) into the DB,
 * incrementing the running counts.
 *
 * @returns the number of accounts and transactions upserted in this window.
 */
function upsertWindow(
  fetched: Account[],
  now: number,
): { accountsUpserted: number; transactionsUpserted: number } {
  let accountsUpserted = 0;
  let transactionsUpserted = 0;

  db.transaction((tx) => {
    for (const account of fetched) {
      // Convert protocol decimal strings to integer cents for storage.
      const balanceCents = toCents(account.balance);
      const availableBalanceCents =
        account["available-balance"] != null
          ? toCents(account["available-balance"])
          : null;

      tx.insert(accounts)
        .values({
          id: account.id,
          name: account.name,
          connId: account.conn_id ?? null,
          currency: account.currency,
          balance: balanceCents,
          availableBalance: availableBalanceCents,
          balanceDate: account["balance-date"],
          extra: account.extra ?? null,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: accounts.id,
          set: {
            name: account.name,
            connId: account.conn_id ?? null,
            currency: account.currency,
            balance: balanceCents,
            availableBalance: availableBalanceCents,
            balanceDate: account["balance-date"],
            extra: account.extra ?? null,
            updatedAt: now,
          },
        })
        .run();
      accountsUpserted += 1;

      for (const txn of account.transactions ?? []) {
        const amountCents = toCents(txn.amount);

        tx.insert(transactions)
          .values({
            id: txn.id,
            accountId: account.id,
            amount: amountCents,
            posted: txn.posted,
            transactedAt: txn.transacted_at ?? null,
            description: txn.description,
            pending: txn.pending ?? false,
            extra: txn.extra ?? null,
            updatedAt: now,
          })
          .onConflictDoUpdate({
            target: [transactions.accountId, transactions.id],
            set: {
              amount: amountCents,
              posted: txn.posted,
              transactedAt: txn.transacted_at ?? null,
              description: txn.description,
              pending: txn.pending ?? false,
              extra: txn.extra ?? null,
              updatedAt: now,
            },
          })
          .run();
        transactionsUpserted += 1;
      }
    }
  });

  return { accountsUpserted, transactionsUpserted };
}

/**
 * Fetch accounts and transactions from SimpleFIN and upsert them into the
 * local database. Pending transactions are always included.
 *
 * The fetch window depends on the options:
 *
 * - **Incremental (default):** a single request starting 14 days before the
 *   last successful sync ({@link SYNC_OVERLAP_MS}) so late-posting transactions
 *   are not missed. When no prior sync exists, this defaults to one window
 *   ({@link WINDOW_SECONDS}, ~45 days) back.
 * - **Historical (`monthsBack`):** reaches `monthsBack` months into the past,
 *   paginated into {@link WINDOW_SECONDS}-sized requests because the SimpleFIN
 *   Bridge recommends a request range of at most ~45 days. Accounts are
 *   de-duplicated across windows; transactions are upserted, so overlapping
 *   windows are safe.
 *
 * Records are upserted by primary key (accounts by `id`; transactions by the
 * composite `(accountId, id)`), so re-running the sync is idempotent.
 *
 * @param options.monthsBack when set, perform a historical sync reaching this
 *   many months back (paginated). When omitted, perform an incremental sync.
 * @returns a {@link SyncResult} summary (counts, non-fatal `errlist` errors,
 *   and the completion timestamp).
 * @throws when no Access URL is stored, or a request/parse fails.
 */
export async function syncTransactions(options?: {
  monthsBack?: number;
}): Promise<SyncResult> {
  const lastSyncAt = await getLastSyncAt();
  const now = Date.now();
  const nowSeconds = Math.floor(now / 1000);

  // Determine the earliest start-date (epoch seconds) to reach.
  let earliestStart: number;
  if (options?.monthsBack !== undefined) {
    earliestStart = nowSeconds - options.monthsBack * MONTH_SECONDS;
  } else if (lastSyncAt === undefined) {
    earliestStart = nowSeconds - WINDOW_SECONDS;
  } else {
    earliestStart = Math.floor((lastSyncAt - SYNC_OVERLAP_MS) / 1000);
  }

  let accountsUpserted = 0;
  let transactionsUpserted = 0;
  const seenAccountIds = new Set<string>();
  const errorSet = new Map<string, string>();

  // Page backwards in <=45-day windows from now until earliestStart.
  let windowEnd = nowSeconds;
  while (windowEnd > earliestStart) {
    const windowStart = Math.max(earliestStart, windowEnd - WINDOW_SECONDS);

    const accountSet = await getAccounts({
      startDate: windowStart,
      endDate: windowEnd,
      pending: true,
    });

    const counts = upsertWindow(accountSet.accounts, now);
    transactionsUpserted += counts.transactionsUpserted;
    for (const account of accountSet.accounts) {
      if (!seenAccountIds.has(account.id)) {
        seenAccountIds.add(account.id);
        accountsUpserted += 1;
      }
    }

    for (const err of accountSet.errlist) {
      const message = formatError(err);
      errorSet.set(message, message);
    }

    windowEnd = windowStart;
  }

  await setSetting(LAST_SYNC_SETTING_KEY, now);

  return {
    accountsUpserted,
    transactionsUpserted,
    errors: [...errorSet.values()],
    syncedAt: now,
  };
}
