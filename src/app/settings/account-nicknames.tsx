"use client";

import { useEffect, useState, useTransition } from "react";
import {
  getAccountsWithTransactions,
  setAccountNickname,
} from "@/app/actions/accounts";
import type { AccountNicknameRow } from "@/app/actions/accounts-types";

const inputClass =
  "rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm text-black focus:border-zinc-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50";

export function AccountNicknames() {
  const [accounts, setAccounts] = useState<AccountNicknameRow[]>([]);
  // Editable nickname text per account id, seeded from the loaded data.
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    startTransition(async () => {
      try {
        const rows = await getAccountsWithTransactions();
        setAccounts(rows);
        setDrafts(
          Object.fromEntries(rows.map((r) => [r.id, r.nickname ?? ""])),
        );
      } catch (error) {
        setMessage(String(error));
      }
    });
  }, []);

  function commit(account: AccountNicknameRow) {
    const draft = (drafts[account.id] ?? "").trim();
    const current = account.nickname ?? "";
    if (draft === current) return; // no change

    setMessage(null);
    // Optimistically update the loaded value so we don't re-save on re-blur.
    setAccounts((prev) =>
      prev.map((a) =>
        a.id === account.id ? { ...a, nickname: draft || null } : a,
      ),
    );
    startTransition(async () => {
      try {
        await setAccountNickname(account.id, draft || null);
      } catch (error) {
        setMessage(`Could not save nickname: ${String(error)}`);
      }
    });
  }

  // Stable placeholder until mounted to avoid controlled/uncontrolled mismatch.
  if (!mounted) {
    return (
      <p className="text-sm text-zinc-500 dark:text-zinc-400">
        Loading accounts…
      </p>
    );
  }

  if (accounts.length === 0) {
    return (
      <p className="text-sm text-zinc-500 dark:text-zinc-400">
        No accounts with transactions yet.
      </p>
    );
  }

  return (
    <div className="flex w-full flex-col gap-3">
      <ul className="flex w-full flex-col gap-2">
        {accounts.map((account) => (
          <li
            key={account.id}
            className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-zinc-200 bg-white px-3 py-2 dark:border-zinc-800 dark:bg-zinc-950"
          >
            <span className="text-sm text-zinc-700 dark:text-zinc-300">
              {account.name}
            </span>
            <input
              value={drafts[account.id] ?? ""}
              placeholder="Add a nickname"
              className={`${inputClass} w-56`}
              onChange={(event) =>
                setDrafts((prev) => ({
                  ...prev,
                  [account.id]: event.target.value,
                }))
              }
              onBlur={() => commit(account)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.currentTarget.blur();
                }
              }}
            />
          </li>
        ))}
      </ul>
      {message ? (
        <p className="text-sm text-zinc-600 dark:text-zinc-400">{message}</p>
      ) : null}
    </div>
  );
}
