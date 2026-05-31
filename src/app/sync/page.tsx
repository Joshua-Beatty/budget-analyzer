import type { Metadata } from "next";
import { haveToken } from "@/app/actions/simplefin";
import { getLastSyncAt } from "@/app/actions/sync";
import { SyncButton } from "./sync-button";

export const metadata: Metadata = {
  title: "Sync",
  description: "Sync accounts and transactions from SimpleFIN.",
};

export default async function Sync() {
  const [hasToken, lastSyncAt] = await Promise.all([
    haveToken(),
    getLastSyncAt(),
  ]);

  return (
    <div className="flex flex-col flex-1 items-center justify-center bg-zinc-50 font-sans dark:bg-black">
      <main className="flex flex-1 w-full max-w-3xl flex-col items-start justify-center gap-6 py-32 px-16 bg-white dark:bg-black">
        <h1 className="text-3xl font-semibold leading-10 tracking-tight text-black dark:text-zinc-50">
          Sync
        </h1>
        <SyncButton hasToken={hasToken} initialLastSyncAt={lastSyncAt} />
      </main>
    </div>
  );
}
