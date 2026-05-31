import type { Metadata } from "next";
import { getCategories } from "@/app/actions/categories";
import { getRules } from "@/app/actions/rules";
import { getAccountsList } from "@/app/actions/transactions";
import { RulesManager } from "./rules-manager";

export const metadata: Metadata = {
  title: "Rules",
  description: "Define rules that assign categories to transactions.",
};

// Reads the database at render time, so it must not be prerendered at build
// time (when no database exists yet, e.g. during `docker build`).
export const dynamic = "force-dynamic";

export default async function Rules() {
  const [rules, categories, accounts] = await Promise.all([
    getRules(),
    getCategories(),
    getAccountsList(),
  ]);

  return (
    <div className="flex flex-col flex-1 items-center bg-zinc-50 font-sans dark:bg-black">
      <main className="flex flex-1 w-full max-w-3xl flex-col items-start gap-6 py-16 px-16 bg-white dark:bg-black">
        <h1 className="text-3xl font-semibold leading-10 tracking-tight text-black dark:text-zinc-50">
          Rules
        </h1>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Rules assign a category to matching transactions. Criteria are ANDed;
          rules run top to bottom and the first match wins.
        </p>
        <RulesManager
          initialRules={rules}
          categories={categories}
          accounts={accounts}
        />
      </main>
    </div>
  );
}
