import type { Metadata } from "next";
import Link from "next/link";
import { SimplefinToken } from "./simplefin-token";

export const metadata: Metadata = {
  title: "Settings",
  description: "Manage settings stored in the database.",
};

export default function Settings() {
  return (
    <div className="flex flex-col flex-1 items-center justify-center bg-zinc-50 font-sans dark:bg-black">
      <main className="flex flex-1 w-full max-w-3xl flex-col items-start justify-center gap-6 py-32 px-16 bg-white dark:bg-black">
        <h1 className="text-3xl font-semibold leading-10 tracking-tight text-black dark:text-zinc-50">
          Settings
        </h1>
        <h2 className="text-xl font-semibold text-black dark:text-zinc-50">
          SimpleFIN
        </h2>
        <SimplefinToken />
      </main>
    </div>
  );
}
