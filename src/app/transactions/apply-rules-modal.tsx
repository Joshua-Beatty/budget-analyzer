"use client";

import { useEffect, useState } from "react";
import type { RulePreview } from "@/app/actions/rules-types";
import { fromCents } from "@/utils/money";

/** Composite key identifying a transaction in the preview. */
function rowKey(accountId: string, id: string): string {
  return `${accountId}:${id}`;
}

const confirmButtonClass =
  "rounded-full bg-foreground px-5 py-2 text-background text-sm font-medium transition-colors hover:bg-[#383838] disabled:opacity-50 dark:hover:bg-[#ccc]";

const cancelButtonClass =
  "rounded-full border border-zinc-300 px-5 py-2 text-sm font-medium text-zinc-800 transition-colors hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-900";

/** Format epoch seconds as a deterministic UTC `YYYY-MM-DD`. */
function formatDate(epochSeconds: number): string {
  return new Date(epochSeconds * 1000).toISOString().slice(0, 10);
}

type Props = {
  preview: RulePreview;
  /** Whether the confirm action is running. */
  applying: boolean;
  /** Confirm with the set of composite `accountId:id` keys to skip. */
  onConfirm: (skipKeys: string[]) => void;
  onCancel: () => void;
};

export function ApplyRulesModal({
  preview,
  applying,
  onConfirm,
  onCancel,
}: Props) {
  // Keys (accountId:id) the user has unchecked and wants to skip.
  const [skipped, setSkipped] = useState<Set<string>>(new Set());

  // Close on Escape.
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape" && !applying) onCancel();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [applying, onCancel]);

  function toggleSkip(key: string) {
    setSkipped((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }

  const { changes, invalidRuleNames } = preview;
  const applyCount = changes.length - skipped.size;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Apply rules"
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
    >
      <button
        type="button"
        aria-label="Close"
        className="absolute inset-0 size-full cursor-default bg-black/50"
        disabled={applying}
        onClick={onCancel}
      />
      <div className="relative flex max-h-[80vh] w-full max-w-4xl flex-col rounded-lg bg-white shadow-xl dark:bg-zinc-950">
        <div className="border-b border-zinc-200 px-5 py-3 dark:border-zinc-800">
          <h2 className="text-lg font-semibold text-black dark:text-zinc-50">
            Apply rules
          </h2>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            {changes.length === 0
              ? "No transactions will change."
              : `${applyCount} of ${changes.length} transaction${
                  changes.length === 1 ? "" : "s"
                } will have its category changed.`}
          </p>
          {invalidRuleNames.length > 0 ? (
            <p className="mt-1 text-sm text-amber-700 dark:text-amber-400">
              Skipped {invalidRuleNames.length} rule
              {invalidRuleNames.length === 1 ? "" : "s"} with an invalid regex:{" "}
              {invalidRuleNames.join(", ")}.
            </p>
          ) : null}
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-3">
          {changes.length > 0 ? (
            <table className="w-full text-left text-sm">
              <thead className="sticky top-0 bg-white text-zinc-600 dark:bg-zinc-950 dark:text-zinc-300">
                <tr className="border-b border-zinc-200 dark:border-zinc-800">
                  <th className="px-2 py-1.5 font-medium">Apply</th>
                  <th className="px-2 py-1.5 font-medium">Date</th>
                  <th className="px-2 py-1.5 font-medium">Account</th>
                  <th className="px-2 py-1.5 font-medium">Description</th>
                  <th className="px-2 py-1.5 text-right font-medium">Amount</th>
                  <th className="px-2 py-1.5 font-medium">Old category</th>
                  <th className="px-2 py-1.5 font-medium">New category</th>
                </tr>
              </thead>
              <tbody>
                {changes.map((change) => {
                  const key = rowKey(change.txn.accountId, change.txn.id);
                  const skip = skipped.has(key);
                  return (
                    <tr
                      key={key}
                      className={`border-b border-zinc-100 last:border-0 dark:border-zinc-900 ${
                        skip ? "opacity-40" : ""
                      }`}
                    >
                      <td className="px-2 py-1">
                        <input
                          type="checkbox"
                          className="size-5 cursor-pointer rounded border-2 border-zinc-400 accent-green-600 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-500 dark:border-zinc-500 dark:accent-green-500"
                          aria-label="Apply this change"
                          checked={!skip}
                          disabled={applying}
                          onChange={() => toggleSkip(key)}
                        />
                      </td>
                      <td className="px-2 py-1 text-zinc-800 dark:text-zinc-200">
                        {formatDate(change.txn.posted)}
                      </td>
                      <td className="px-2 py-1 text-zinc-800 dark:text-zinc-200">
                        {change.txn.accountName}
                      </td>
                      <td className="px-2 py-1 text-zinc-800 dark:text-zinc-200">
                        {change.txn.description}
                      </td>
                      <td className="px-2 py-1 text-right tabular-nums text-zinc-800 dark:text-zinc-200">
                        {fromCents(change.txn.amount)} {change.txn.currency}
                      </td>
                      <td className="px-2 py-1 text-zinc-500 dark:text-zinc-400">
                        {change.oldCategoryName ?? "—"}
                      </td>
                      <td className="px-2 py-1 font-medium text-zinc-900 dark:text-zinc-100">
                        {change.newCategoryName}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : (
            <p className="py-6 text-center text-sm text-zinc-500 dark:text-zinc-400">
              Nothing to apply for the current filter.
            </p>
          )}
        </div>

        <div className="flex justify-end gap-3 border-t border-zinc-200 px-5 py-3 dark:border-zinc-800">
          <button
            type="button"
            className={cancelButtonClass}
            disabled={applying}
            onClick={onCancel}
          >
            Cancel
          </button>
          <button
            type="button"
            className={confirmButtonClass}
            disabled={applying || applyCount === 0}
            onClick={() => onConfirm([...skipped])}
          >
            {applying ? "Applying…" : "Confirm"}
          </button>
        </div>
      </div>
    </div>
  );
}
