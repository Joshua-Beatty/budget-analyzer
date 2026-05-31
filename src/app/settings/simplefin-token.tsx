"use client";

import { useEffect, useState, useTransition } from "react";
import {
  checkToken,
  getTokenStatus,
  saveNewToken,
  type TokenStatus,
} from "@/app/actions/simplefin";

const buttonClass =
  "rounded-full bg-foreground px-5 py-2 text-background text-sm font-medium transition-colors hover:bg-[#383838] disabled:opacity-50 dark:hover:bg-[#ccc]";

const statusStyles: Record<TokenStatus, string> = {
  Missing: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300",
  Present: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
  Valid: "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300",
};

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

export function SimplefinToken() {
  const [status, setStatus] = useState<TokenStatus | null>(null);
  const [token, setToken] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  // True only while the "Check" action is running, so its button can show a
  // spinner independently of the other transitions sharing `isPending`.
  const [checking, setChecking] = useState(false);
  // Tracks client mount so the first client render matches the server-rendered
  // HTML (avoids a hydration mismatch on the disabled buttons).
  const [mounted, setMounted] = useState(false);

  // Load the initial status on mount.
  useEffect(() => {
    setMounted(true);
    startTransition(async () => {
      try {
        setStatus(await getTokenStatus());
      } catch (error) {
        setMessage(String(error));
      }
    });
  }, []);

  function handleCheck() {
    setMessage(null);
    setChecking(true);
    startTransition(async () => {
      try {
        const next = await checkToken();
        setStatus(next);
        setMessage(
          next === "Valid"
            ? "Access token validated."
            : "Validation failed: the token is no longer usable.",
        );
      } catch (error) {
        setMessage(`Check failed: ${String(error)}`);
      } finally {
        setChecking(false);
      }
    });
  }

  function handleUseNewToken() {
    const trimmed = token.trim();
    if (trimmed.length === 0) {
      return;
    }
    setMessage(null);
    startTransition(async () => {
      try {
        await saveNewToken(trimmed);
        setToken("");
        setStatus(await getTokenStatus());
        setMessage("New token claimed and saved.");
      } catch (error) {
        setMessage(`Could not use token: ${String(error)}`);
      }
    });
  }

  // Render a stable, non-interactive placeholder for SSR and the first client
  // render. Browser extensions and `useTransition` can otherwise cause the
  // server HTML and first client render to disagree on button attributes,
  // producing a hydration mismatch. Once mounted we render the real UI.
  if (!mounted) {
    return (
      <div className="flex w-full flex-col gap-6">
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Access Token:
          </span>
          <span className="rounded-full bg-zinc-100 px-3 py-1 text-sm font-semibold text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
            …
          </span>
        </div>
        <label className="flex flex-col gap-2 text-sm font-medium text-zinc-700 dark:text-zinc-300">
          SimpleFIN Token
          <textarea
            rows={3}
            readOnly
            placeholder="Paste a SimpleFIN Token"
            className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-base text-black focus:border-zinc-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
          />
        </label>
      </div>
    );
  }

  const statusLabel = status ?? "…";
  const hasToken = token.trim().length > 0;
  const busy = isPending;
  const canCheck = status === "Present" || status === "Valid";

  return (
    <div className="flex w-full flex-col gap-6">
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
          Access Token:
        </span>
        <span
          className={`rounded-full px-3 py-1 text-sm font-semibold ${
            status
              ? statusStyles[status]
              : "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400"
          }`}
        >
          {statusLabel}
        </span>
        <button
          type="button"
          className={`${buttonClass} inline-flex items-center gap-2`}
          disabled={busy || !canCheck}
          onClick={handleCheck}
        >
          {checking ? <Spinner /> : null}
          {checking ? "Checking…" : "Check"}
        </button>
      </div>

      <label className="flex flex-col gap-2 text-sm font-medium text-zinc-700 dark:text-zinc-300">
        SimpleFIN Token
        <textarea
          value={token}
          onChange={(event) => setToken(event.target.value)}
          placeholder="Paste a SimpleFIN Token"
          rows={3}
          className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-base text-black focus:border-zinc-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
        />
      </label>
      <div>
        <button
          type="button"
          className={buttonClass}
          disabled={busy || !hasToken}
          onClick={handleUseNewToken}
        >
          Use New Token
        </button>
      </div>

      {message ? (
        <p className="text-sm text-zinc-600 dark:text-zinc-400">{message}</p>
      ) : null}
    </div>
  );
}
