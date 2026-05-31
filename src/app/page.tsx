import type { Metadata } from "next";
import Link from "next/link";
import { getCategories } from "@/app/actions/categories";
import { haveToken } from "@/app/actions/simplefin";
import { getLastSyncAt } from "@/app/actions/sync";
import {
  getAccountsList,
  getTransactionsPage,
} from "@/app/actions/transactions";
import {
  type CategoryFilter,
  DEFAULT_PAGE_SIZE,
  PAGE_SIZES,
  type SortDir,
  type TransactionSort,
} from "@/app/actions/transactions-types";
import { SyncModal } from "./transactions/sync-modal";
import { TransactionsTable } from "./transactions/transactions-table";

export const metadata: Metadata = {
  title: "Transactions",
  description: "Browse synced transactions.",
};

// Reads the database at render time, so it must not be prerendered at build
// time (when no database exists yet, e.g. during `docker build`).
export const dynamic = "force-dynamic";

const SORTS: readonly TransactionSort[] = ["posted", "amount", "description"];

/** Read a single string from a searchParams value that may be an array. */
function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = await searchParams;

  const pageParam = Number.parseInt(first(params.page) ?? "", 10);
  const page = Number.isFinite(pageParam) && pageParam > 0 ? pageParam : 0;

  const pageSizeParam = Number.parseInt(first(params.pageSize) ?? "", 10);
  const pageSize = (PAGE_SIZES as readonly number[]).includes(pageSizeParam)
    ? pageSizeParam
    : DEFAULT_PAGE_SIZE;

  const sortParam = first(params.sort);
  const sort: TransactionSort = SORTS.includes(sortParam as TransactionSort)
    ? (sortParam as TransactionSort)
    : "posted";

  const dir: SortDir = first(params.dir) === "asc" ? "asc" : "desc";
  const accountId = first(params.account) || undefined;

  // Category filter: "none", "any", a numeric id, or unset.
  const categoryParam = first(params.category);
  let category: CategoryFilter | undefined;
  if (categoryParam === "none" || categoryParam === "any") {
    category = categoryParam;
  } else if (categoryParam !== undefined) {
    const id = Number.parseInt(categoryParam, 10);
    if (Number.isFinite(id)) category = id;
  }

  // Boolean flag filters: "1" => true, "0" => false, unset => no filter.
  const inspectedParam = first(params.inspected);
  const inspected =
    inspectedParam === "1" ? true : inspectedParam === "0" ? false : undefined;
  const sharedParam = first(params.shared);
  const shared =
    sharedParam === "1" ? true : sharedParam === "0" ? false : undefined;

  const [pageData, accounts, categories, hasToken, lastSyncAt] =
    await Promise.all([
      getTransactionsPage({
        page,
        pageSize,
        sort,
        dir,
        accountId,
        category,
        inspected,
        shared,
      }),
      getAccountsList(),
      getCategories(),
      haveToken(),
      getLastSyncAt(),
    ]);

  return (
    <div className="flex flex-col flex-1 bg-white font-sans dark:bg-black">
      <main className="flex w-full flex-1 flex-col items-start gap-2 px-8 pt-4 pb-0">
        <div className="flex w-full items-center justify-between">
          <h1 className="text-2xl font-semibold tracking-tight text-black dark:text-zinc-50">
            Transactions
          </h1>
          <SyncModal hasToken={hasToken} initialLastSyncAt={lastSyncAt} />
        </div>
        {pageData.total === 0 &&
        accountId === undefined &&
        category === undefined &&
        inspected === undefined &&
        shared === undefined ? (
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            No transactions yet. Click{" "}
            <span className="font-medium text-zinc-950 dark:text-zinc-50">
              Sync
            </span>{" "}
            to pull them from SimpleFIN, or connect a token in{" "}
            <Link
              href="/settings"
              className="font-medium text-zinc-950 underline dark:text-zinc-50"
            >
              Settings
            </Link>
            .
          </p>
        ) : (
          <TransactionsTable
            page={pageData}
            accounts={accounts}
            categories={categories}
            state={{
              page,
              pageSize,
              sort,
              dir,
              accountId,
              category,
              inspected,
              shared,
            }}
          />
        )}
      </main>
    </div>
  );
}
