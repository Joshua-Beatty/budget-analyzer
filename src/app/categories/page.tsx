import type { Metadata } from "next";
import { Categories } from "./categories";

export const metadata: Metadata = {
  title: "Categories",
  description: "Manage transaction categories.",
};

export default function CategoriesPage() {
  return (
    <div className="flex flex-col flex-1 items-center bg-zinc-50 font-sans dark:bg-black">
      <main className="flex flex-1 w-full max-w-3xl flex-col items-start gap-6 py-16 px-16 bg-white dark:bg-black">
        <h1 className="text-3xl font-semibold leading-10 tracking-tight text-black dark:text-zinc-50">
          Categories
        </h1>
        <Categories />
      </main>
    </div>
  );
}
