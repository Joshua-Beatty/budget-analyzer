"use client";

import { useEffect, useId, useState, useTransition } from "react";
import { syncTransactions } from "@/app/actions/sync";
import type { SyncResult } from "@/app/actions/sync-types";

const triggerButtonClass =
  "rounded-full bg-foreground px-4 py-1.5 text-background text-sm font-medium transition-colors hover:bg-[#383838] disabled:opacity-50 dark:hover:bg-[#ccc] inline-flex items-center gap-2";

const buttonClass =
  "rounded-full bg-foreground px-5 py-2 text-background text-sm font-medium transition-colors hover:bg-[#383838] disabled:opacity-50 dark:hover:bg-[#ccc] inline-flex items-center gap-2";

const secondaryButtonClass =
  "rounded-full border border-zinc-300 px-5 py-2 text-sm font-medium text-zinc-800 transition-colors hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-900 inline-flex items-center gap-2";

/** Default number of months a historical "Sync Everything" reaches back. */
const DEFAULT_MONTHS_BACK = 12;

function Spinner() {
  return (
    <svg
      className="size-4 animate-spin"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 0 1 8-8V0C5.373 0 0 5.373 0 12h4z"
      />
    </svg>
  );
}

function formatTimestamp(ms: number): string {
  return new Date(ms).toLocaleString();
}

type Props = {
  /** Whether an Access URL is stored; syncing is disabled without one. */
  hasToken: boolean;
  /** Epoch ms of the last successful sync, if any. */
  initialLastSyncAt?: number;
};

/**
 * A "Sync" trigger button that opens a modal with the sync controls
 * (incremental sync, full historical sync, last-synced time, and results).
 */
export function SyncModal({ hasToken, initialLastSyncAt }: Props) {
  const monthsInputId = useId();
  const [open, setOpen] = useState(false);
  const [result, setResult] = useState<SyncResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastSyncAt, setLastSyncAt] = useState<number | undefined>(
    initialLastSyncAt,
  );
  const [isPending, startTransition] = useTransition();
  // Which sync (if any) is running, so each button shows its own spinner.
  const [running, setRunning] = useState<"incremental" | "full" | null>(null);
  // Whether the "how far back" prompt is open, and its current value.
  const [promptOpen, setPromptOpen] = useState(false);
  const [months, setMonths] = useState(String(DEFAULT_MONTHS_BACK));
  // Gate interactive state on mount so SSR and the first client render agree.
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Close on Escape (when not mid-sync).
  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape" && running === null) setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, running]);

  function runSync(
    kind: "incremental" | "full",
    options?: { monthsBack?: number },
  ) {
    setError(null);
    setRunning(kind);
    startTransition(async () => {
      try {
        const next = await syncTransactions(options);
        setResult(next);
        setLastSyncAt(next.syncedAt);
      } catch (err) {
        setError(String(err));
      } finally {
        setRunning(null);
      }
    });
  }

  function confirmFullSync() {
    const parsed = Number.parseInt(months, 10);
    if (!Number.isFinite(parsed) || parsed < 1) {
      return;
    }
    setPromptOpen(false);
    runSync("full", { monthsBack: parsed });
  }

  const busy = !mounted || isPending;

  return (
    <>
      <button
        type="button"
        className={triggerButtonClass}
        disabled={!mounted}
        onClick={() => setOpen(true)}
      >
        Sync
      </button>

      {open ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Sync"
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
        >
          <button
            type="button"
            aria-label="Close"
            className="absolute inset-0 size-full cursor-default bg-black/50"
            disabled={running !== null}
            onClick={() => setOpen(false)}
          />
          <div className="relative flex w-full max-w-md flex-col gap-4 rounded-lg bg-white p-5 shadow-xl dark:bg-zinc-950">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-black dark:text-zinc-50">
                Sync
              </h2>
              <button
                type="button"
                aria-label="Close"
                className="text-zinc-500 hover:text-black disabled:opacity-50 dark:hover:text-white"
                disabled={running !== null}
                onClick={() => setOpen(false)}
              >
                ✕
              </button>
            </div>

            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              {hasToken
                ? "Pull accounts and transactions from SimpleFIN into the local database."
                : "Connect a SimpleFIN token in Settings before syncing."}
            </p>

            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                className={buttonClass}
                disabled={busy || !hasToken}
                onClick={() => runSync("incremental")}
              >
                {running === "incremental" ? <Spinner /> : null}
                {running === "incremental" ? "Syncing…" : "Sync Now"}
              </button>
              <button
                type="button"
                className={secondaryButtonClass}
                disabled={busy || !hasToken}
                onClick={() => setPromptOpen(true)}
                title="Pull historical transactions from SimpleFIN"
              >
                {running === "full" ? <Spinner /> : null}
                {running === "full" ? "Syncing everything…" : "Sync Everything"}
              </button>
            </div>

            {promptOpen ? (
              <div className="flex w-full flex-col gap-3 rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
                <label
                  htmlFor={monthsInputId}
                  className="text-sm font-medium text-zinc-700 dark:text-zinc-300"
                >
                  How many months back?
                </label>
                <input
                  id={monthsInputId}
                  type="number"
                  min={1}
                  value={months}
                  onChange={(event) => setMonths(event.target.value)}
                  className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-base text-black focus:border-zinc-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
                />
                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                  Fetched in 45-day windows. The SimpleFIN Bridge may serve
                  fewer months than requested.
                </p>
                <div className="flex gap-3">
                  <button
                    type="button"
                    className={buttonClass}
                    disabled={busy}
                    onClick={confirmFullSync}
                  >
                    Start
                  </button>
                  <button
                    type="button"
                    className={secondaryButtonClass}
                    disabled={busy}
                    onClick={() => setPromptOpen(false)}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : null}

            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              Last synced:{" "}
              {lastSyncAt !== undefined ? formatTimestamp(lastSyncAt) : "never"}
            </p>

            {error ? (
              <p className="text-sm text-red-600 dark:text-red-400">
                Sync failed: {error}
              </p>
            ) : null}

            {result ? (
              <div className="flex w-full flex-col gap-2 rounded-lg bg-zinc-100 p-4 text-sm text-zinc-800 dark:bg-zinc-900 dark:text-zinc-200">
                <p>
                  Synced {result.accountsUpserted} account
                  {result.accountsUpserted === 1 ? "" : "s"} and{" "}
                  {result.transactionsUpserted} transaction
                  {result.transactionsUpserted === 1 ? "" : "s"}.
                </p>
                {result.errors.length > 0 ? (
                  <div className="flex flex-col gap-1">
                    <span className="font-medium text-amber-700 dark:text-amber-400">
                      Server reported {result.errors.length} issue
                      {result.errors.length === 1 ? "" : "s"}:
                    </span>
                    <ul className="list-inside list-disc text-amber-700 dark:text-amber-400">
                      {result.errors.map((message) => (
                        <li key={message}>{message}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </>
  );
}
