"use client";

import {
  type ColumnDef,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useTransition,
} from "react";
import {
  applyRulesForFilter,
  previewRulesForFilter,
} from "@/app/actions/rules";
import type { RulePreview } from "@/app/actions/rules-types";
import {
  getTransactionsForExport,
  setFlagForFilter,
  setTransactionCategory,
  setTransactionFlag,
} from "@/app/actions/transactions";
import type {
  AccountOption,
  CategoryFilter,
  CategoryOption,
  SortDir,
  TransactionFlag,
  TransactionRow,
  TransactionSort,
  TransactionsPage,
} from "@/app/actions/transactions-types";
import { PAGE_SIZES } from "@/app/actions/transactions-types";
import { fromCents } from "@/utils/money";
import { ApplyRulesModal } from "./apply-rules-modal";

const buttonClass =
  "rounded-full border border-zinc-300 px-4 py-1.5 text-sm font-medium text-zinc-800 transition-colors hover:bg-zinc-100 disabled:opacity-40 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-900";

const selectClass =
  "rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm text-black focus:border-zinc-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50";

const rowSelectClass =
  "w-32 truncate rounded border border-zinc-300 bg-white px-1.5 py-0.5 text-sm text-black focus:border-zinc-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50";

const pageButtonClass =
  "min-w-8 rounded-md border border-zinc-300 px-2 py-1 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-100 disabled:opacity-40 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900";

const pageButtonActiveClass =
  "min-w-8 rounded-md border border-zinc-900 bg-zinc-900 px-2 py-1 text-sm font-medium text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-black";

/**
 * Build a compact list of page numbers (1-based) with `"ellipsis"` gaps, always
 * showing the first, last, current, and the neighbors of the current page.
 *
 * @example pageItems(13, 25) => [1, "ellipsis", 12, 13, 14, "ellipsis", 25]
 */
function pageItems(current: number, total: number): (number | "ellipsis")[] {
  // Show all when there are few pages.
  if (total <= 7) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }

  const items: (number | "ellipsis")[] = [];
  const left = Math.max(2, current - 1);
  const right = Math.min(total - 1, current + 1);

  items.push(1);
  if (left > 2) items.push("ellipsis");
  for (let p = left; p <= right; p++) items.push(p);
  if (right < total - 1) items.push("ellipsis");
  items.push(total);

  return items;
}

/** Format epoch seconds as a deterministic UTC `YYYY-MM-DD` (no locale drift). */
function formatDate(epochSeconds: number): string {
  return new Date(epochSeconds * 1000).toISOString().slice(0, 10);
}

const SORTABLE: ReadonlySet<string> = new Set([
  "posted",
  "amount",
  "description",
]);

type Props = {
  page: TransactionsPage;
  accounts: AccountOption[];
  categories: CategoryOption[];
  state: {
    page: number;
    pageSize: number;
    sort: TransactionSort;
    dir: SortDir;
    accountId?: string;
    category?: CategoryFilter;
    inspected?: boolean;
    shared?: boolean;
  };
};

export function TransactionsTable({
  page,
  accounts,
  categories,
  state,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  // Local copy of the page rows so inline edits (category/flags) reflect
  // immediately. Re-seeded whenever the server provides a new page.
  const [rows, setRows] = useState<TransactionRow[]>(page.rows);
  useEffect(() => {
    setRows(page.rows);
  }, [page.rows]);

  // Active category ids, to decide whether a row's assigned category is still
  // selectable or was soft-deleted (shown read-only).
  const activeCategoryIds = useMemo(
    () => new Set(categories.map((c) => c.id)),
    [categories],
  );

  // Inline edits autosave directly (not via the navigation transition) so they
  // update only the edited row and never trigger the page-level "Loading…"
  // state or a full-table re-render.
  const handleCategoryChange = useCallback(
    (row: TransactionRow, value: string) => {
      const categoryId = value === "" ? null : Number.parseInt(value, 10);
      const selected = categories.find((c) => c.id === categoryId);
      setRows((prev) =>
        prev.map((r) =>
          r.id === row.id && r.accountId === row.accountId
            ? {
                ...r,
                categoryId,
                categoryName: selected ? selected.name : null,
              }
            : r,
        ),
      );
      void setTransactionCategory(row.accountId, row.id, categoryId);
    },
    [categories],
  );

  const handleFlagChange = useCallback(
    (row: TransactionRow, flag: TransactionFlag, checked: boolean) => {
      const value = checked ? Date.now() : null;
      setRows((prev) =>
        prev.map((r) =>
          r.id === row.id && r.accountId === row.accountId
            ? { ...r, [flag]: value }
            : r,
        ),
      );
      void setTransactionFlag(row.accountId, row.id, flag, checked);
    },
    [],
  );

  // Tracks which bulk action (if any) is running, to disable buttons + label.
  const [bulkRunning, setBulkRunning] = useState<TransactionFlag | null>(null);

  /** Mark every transaction in the current filter set as inspected/shared. */
  function handleBulkFlag(flag: TransactionFlag) {
    setBulkRunning(flag);
    startTransition(async () => {
      try {
        await setFlagForFilter(
          {
            accountId: state.accountId,
            category: state.category,
            inspected: state.inspected,
            shared: state.shared,
          },
          flag,
          true,
        );
        // Re-fetch the current page so the table reflects the bulk update.
        router.refresh();
      } finally {
        setBulkRunning(null);
      }
    });
  }

  /** The current filter set, shared by all bulk actions. */
  const currentFilter = {
    accountId: state.accountId,
    category: state.category,
    inspected: state.inspected,
    shared: state.shared,
  };

  // Apply-rules preview/confirm flow.
  const [rulePreview, setRulePreview] = useState<RulePreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [applying, setApplying] = useState(false);

  function handleOpenApplyRules() {
    setPreviewLoading(true);
    startTransition(async () => {
      try {
        setRulePreview(await previewRulesForFilter(currentFilter));
      } finally {
        setPreviewLoading(false);
      }
    });
  }

  function handleConfirmApplyRules(skipKeys: string[]) {
    setApplying(true);
    startTransition(async () => {
      try {
        await applyRulesForFilter(currentFilter, skipKeys);
        setRulePreview(null);
        router.refresh();
      } finally {
        setApplying(false);
      }
    });
  }

  // Export status message shown briefly after copying to the clipboard.
  const [exportStatus, setExportStatus] = useState<string | null>(null);

  /**
   * Copy every filtered transaction to the clipboard as tab-separated lines:
   * `M/D/YYYY\t<amount>\t\t<category>\t<description>` (no header row).
   */
  function handleExport() {
    setExportStatus(null);
    startTransition(async () => {
      try {
        const rows = await getTransactionsForExport(currentFilter);
        const text = rows
          .map((row) => {
            const d = new Date(row.posted * 1000);
            const date = `${d.getUTCMonth() + 1}/${d.getUTCDate()}/${d.getUTCFullYear()}`;
            return [
              date,
              fromCents(row.amount),
              "",
              row.categoryName ?? "",
              row.description,
            ].join("\t");
          })
          .join("\n");
        await navigator.clipboard.writeText(text);
        setExportStatus(`Copied ${rows.length} transactions to clipboard.`);
      } catch (error) {
        setExportStatus(`Export failed: ${String(error)}`);
      }
    });
  }

  const pageCount = Math.max(1, Math.ceil(page.total / state.pageSize));
  const canPrev = state.page > 0;
  const canNext = state.page < pageCount - 1;

  /** Push updated query params, resetting `page` unless explicitly set. */
  function updateParams(next: Record<string, string | undefined>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(next)) {
      if (value === undefined || value === "") {
        params.delete(key);
      } else {
        params.set(key, value);
      }
    }
    startTransition(() => {
      router.push(`${pathname}?${params.toString()}`);
    });
  }

  function toggleSort(columnId: string) {
    if (!SORTABLE.has(columnId)) return;
    const isCurrent = state.sort === columnId;
    // New column defaults to desc; clicking the current column flips direction.
    const nextDir: SortDir = isCurrent && state.dir === "desc" ? "asc" : "desc";
    updateParams({ sort: columnId, dir: nextDir, page: "0" });
  }

  const columns = useMemo<ColumnDef<TransactionRow>[]>(
    () => [
      {
        accessorKey: "posted",
        header: "Date",
        cell: (info) => formatDate(info.row.original.posted),
      },
      {
        accessorKey: "accountName",
        header: "Account",
        cell: (info) => info.row.original.accountName,
      },
      {
        accessorKey: "description",
        header: "Description",
        cell: (info) => info.row.original.description,
      },
      {
        accessorKey: "amount",
        header: "Amount",
        cell: (info) => {
          const { amount, currency } = info.row.original;
          const negative = amount < 0;
          return (
            <span
              className={
                negative
                  ? "text-red-600 dark:text-red-400"
                  : "text-green-700 dark:text-green-400"
              }
            >
              {fromCents(amount)} {currency}
            </span>
          );
        },
      },
      {
        accessorKey: "pending",
        header: "Pending",
        cell: (info) =>
          info.row.original.pending ? (
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-950 dark:text-amber-300">
              Pending
            </span>
          ) : null,
      },
      {
        accessorKey: "categoryId",
        header: "Category",
        cell: (info) => {
          const row = info.row.original;
          // A soft-deleted category is no longer selectable. Show its name as
          // a read-only label; otherwise show the editable dropdown.
          const isDeletedAssignment =
            row.categoryId !== null && !activeCategoryIds.has(row.categoryId);

          if (isDeletedAssignment) {
            return (
              <span
                className="inline-block w-32 truncate text-zinc-400 italic dark:text-zinc-500"
                title={`${row.categoryName ?? ""} (deleted)`}
              >
                {row.categoryName}
              </span>
            );
          }

          return (
            <select
              className={rowSelectClass}
              value={row.categoryId ?? ""}
              onChange={(event) =>
                handleCategoryChange(row, event.target.value)
              }
            >
              <option value="">—</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          );
        },
      },
      {
        accessorKey: "inspected",
        header: "Inspected",
        cell: (info) => {
          const row = info.row.original;
          return (
            <input
              type="checkbox"
              className="size-4 accent-zinc-900 dark:accent-zinc-100"
              checked={row.inspected !== null}
              onChange={(event) =>
                handleFlagChange(row, "inspected", event.target.checked)
              }
            />
          );
        },
      },
      {
        accessorKey: "shared",
        header: "Shared",
        cell: (info) => {
          const row = info.row.original;
          return (
            <input
              type="checkbox"
              className="size-4 accent-zinc-900 dark:accent-zinc-100"
              checked={row.shared !== null}
              onChange={(event) =>
                handleFlagChange(row, "shared", event.target.checked)
              }
            />
          );
        },
      },
    ],
    [categories, activeCategoryIds, handleCategoryChange, handleFlagChange],
  );

  const table = useReactTable({
    data: rows,
    columns,
    getCoreRowModel: getCoreRowModel(),
    manualPagination: true,
    manualSorting: true,
    rowCount: page.total,
    state: {
      pagination: { pageIndex: state.page, pageSize: state.pageSize },
      sorting: [{ id: state.sort, desc: state.dir === "desc" }],
    },
  });

  return (
    <div className="flex w-full flex-col gap-2">
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300">
          Account
          <select
            className={selectClass}
            value={state.accountId ?? ""}
            onChange={(event) =>
              updateParams({
                account: event.target.value || undefined,
                page: "0",
              })
            }
          >
            <option value="">All accounts</option>
            {accounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300">
          Category
          <select
            className={selectClass}
            value={state.category === undefined ? "" : String(state.category)}
            onChange={(event) =>
              updateParams({
                category: event.target.value || undefined,
                page: "0",
              })
            }
          >
            <option value="">All categories</option>
            <option value="none">(none)</option>
            <option value="any">(any)</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300">
          Inspected
          <select
            className={selectClass}
            value={
              state.inspected === undefined ? "" : state.inspected ? "1" : "0"
            }
            onChange={(event) =>
              updateParams({
                inspected: event.target.value || undefined,
                page: "0",
              })
            }
          >
            <option value="">All</option>
            <option value="1">Inspected</option>
            <option value="0">Not inspected</option>
          </select>
        </label>
        <label className="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300">
          Shared
          <select
            className={selectClass}
            value={state.shared === undefined ? "" : state.shared ? "1" : "0"}
            onChange={(event) =>
              updateParams({
                shared: event.target.value || undefined,
                page: "0",
              })
            }
          >
            <option value="">All</option>
            <option value="1">Shared</option>
            <option value="0">Not shared</option>
          </select>
        </label>
        {isPending ? (
          <span className="text-sm text-zinc-500 dark:text-zinc-400">
            Loading…
          </span>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-zinc-500 dark:text-zinc-400">
          Bulk actions ({page.total} matching):
        </span>
        <button
          type="button"
          className={buttonClass}
          disabled={isPending || page.total === 0}
          onClick={() => handleBulkFlag("inspected")}
        >
          {bulkRunning === "inspected" ? "Checking…" : "Check inspected"}
        </button>
        <button
          type="button"
          className={buttonClass}
          disabled={isPending || page.total === 0}
          onClick={() => handleBulkFlag("shared")}
        >
          {bulkRunning === "shared" ? "Checking…" : "Check shared"}
        </button>
        <button
          type="button"
          className={buttonClass}
          disabled={isPending || page.total === 0}
          onClick={handleOpenApplyRules}
        >
          {previewLoading ? "Loading…" : "Apply rules"}
        </button>
        <button
          type="button"
          className={buttonClass}
          disabled={isPending || page.total === 0}
          onClick={handleExport}
        >
          Export
        </button>
        {exportStatus ? (
          <span className="text-sm text-zinc-500 dark:text-zinc-400">
            {exportStatus}
          </span>
        ) : null}
      </div>

      {rulePreview !== null ? (
        <ApplyRulesModal
          preview={rulePreview}
          applying={applying}
          onConfirm={handleConfirmApplyRules}
          onCancel={() => setRulePreview(null)}
        />
      ) : null}

      <div className="w-full overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-zinc-200 bg-zinc-50 text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300">
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map((header) => {
                  const columnId = header.column.id;
                  const sortable = SORTABLE.has(columnId);
                  const active = state.sort === columnId;
                  const isAmount = columnId === "amount";
                  return (
                    <th
                      key={header.id}
                      className={`px-3 py-1.5 font-medium ${isAmount ? "text-right" : ""}`}
                    >
                      {sortable ? (
                        <button
                          type="button"
                          className="inline-flex items-center gap-1 hover:text-black dark:hover:text-white"
                          onClick={() => toggleSort(columnId)}
                        >
                          {flexRender(
                            header.column.columnDef.header,
                            header.getContext(),
                          )}
                          {active ? (state.dir === "desc" ? "▼" : "▲") : ""}
                        </button>
                      ) : (
                        flexRender(
                          header.column.columnDef.header,
                          header.getContext(),
                        )
                      )}
                    </th>
                  );
                })}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map((row) => (
              <tr
                key={row.id}
                className="border-b border-zinc-100 last:border-0 dark:border-zinc-900"
              >
                {row.getVisibleCells().map((cell) => (
                  <td
                    key={cell.id}
                    className={`px-3 py-1 text-zinc-800 dark:text-zinc-200 ${
                      cell.column.id === "amount"
                        ? "text-right tabular-nums"
                        : ""
                    }`}
                  >
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-zinc-600 dark:text-zinc-400">
        <div className="flex flex-wrap items-center gap-1">
          <button
            type="button"
            className={buttonClass}
            disabled={!canPrev || isPending}
            onClick={() => updateParams({ page: String(state.page - 1) })}
          >
            Previous
          </button>
          {pageItems(state.page + 1, pageCount).map((item, index) =>
            item === "ellipsis" ? (
              <span
                // biome-ignore lint/suspicious/noArrayIndexKey: ellipsis positions are stable per render
                key={`ellipsis-${index}`}
                className="px-1 text-zinc-400 dark:text-zinc-600"
              >
                …
              </span>
            ) : (
              <button
                key={item}
                type="button"
                className={
                  item === state.page + 1
                    ? pageButtonActiveClass
                    : pageButtonClass
                }
                disabled={isPending}
                aria-current={item === state.page + 1 ? "page" : undefined}
                onClick={() => updateParams({ page: String(item - 1) })}
              >
                {item}
              </button>
            ),
          )}
          <button
            type="button"
            className={buttonClass}
            disabled={!canNext || isPending}
            onClick={() => updateParams({ page: String(state.page + 1) })}
          >
            Next
          </button>
          <span className="ml-2">({page.total} total)</span>
        </div>
        <label className="flex items-center gap-2">
          Rows per page
          <select
            className={selectClass}
            value={state.pageSize}
            onChange={(event) =>
              updateParams({ pageSize: event.target.value, page: "0" })
            }
          >
            {PAGE_SIZES.map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </select>
        </label>
      </div>
    </div>
  );
}
