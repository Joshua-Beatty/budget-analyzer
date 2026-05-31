<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Budget Analyzer

A Next.js 16 (App Router) app that pulls financial data via SimpleFIN and stores
settings in a local SQLite database (Drizzle ORM + better-sqlite3). TypeScript is
`strict`. Formatting and linting are handled by Biome.

## Commands

- `npm run dev` — start the dev server (Turbopack).
- `npm run build` / `npm run start` — production build / serve.
- `npm run lint` — Biome check (lint + format diagnostics).
- `npm run format` — Biome auto-format (`--write`).
- `npm run db:generate` — generate a migration from `src/db/schema.ts`.
- `npm run db:push` — push the schema directly to the DB (prototyping).
- `npm run db:studio` — open Drizzle Studio.

Always run `npm run lint` and a typecheck (`npx tsc --noEmit -p tsconfig.json`)
before considering a change done. Note: a stale `.next/types/validator.ts`
error can appear after editing routes — it clears on the next `dev`/`build` and
is not a real error.

## Directory layout & conventions

### `src/app/` — App Router (UI)

- Route segments (`page.tsx`, `layout.tsx`) are **React Server Components** by
  default. Only add `"use client"` when a component needs hooks, browser APIs,
  or event handlers (e.g. `src/app/settings/simplefin-token.tsx`,
  `src/app/sidebar.tsx`).
- Co-locate a route's client components next to its `page.tsx` (e.g.
  `settings/simplefin-token.tsx`) rather than in a shared folder, unless the
  component is used across multiple routes (those live directly in `src/app/`,
  like `sidebar.tsx`).
- Pages export `metadata` for title/description.
- Styling is **Tailwind CSS v4** utility classes inline; there are no CSS
  modules. Support dark mode with `dark:` variants. Reuse the established page
  shell pattern (`flex flex-1 ...` containers) so pages fill the layout's
  content column beside the sidebar.
- Hydration safety: client components that depend on async/transition state for
  attributes like `disabled` must not differ between the server render and the
  first client render. Use a `mounted` gate (return a static placeholder until
  `useEffect` sets `mounted`) — see `simplefin-token.tsx` for the pattern.

### `src/app/actions/` — Server Actions

- Every file starts with `"use server"`.
- **A `"use server"` file may only export `async` functions.** Do not export
  constants, types, or classes from these files — declare them as
  module-private (e.g. `ACCESS_URL_SETTING_KEY` in `actions/simplefin.ts`) or,
  if they must be shared, put them in a non-`"use server"` module and import.
- Actions are the boundary between UI and the rest of the system. They:
  - read/write persistence via `src/db/*` helpers (e.g. `settings.ts`'s
    `getSetting`/`setSetting`), and
  - call framework-agnostic logic in `src/utils/*` (e.g. `actions/simplefin.ts`
    wraps the `SimpleFinClient` from `utils/simplefin.ts`).
- Keep secrets server-side. Anything sensitive (e.g. the SimpleFIN Access URL,
  which embeds Basic Auth credentials) must only be read/used inside server
  actions or server components — never returned to the client.
- Preserve type-safe generics when wrapping utilities. `actions/simplefin.ts`'s
  `getAccounts` mirrors the `const Options extends GetAccountsOptions` signature
  so the option-based return narrowing survives the action boundary.
- Document each exported action with JSDoc (purpose, `@param`, `@returns`,
  `@throws`).

### `src/db/` — Database (Drizzle + better-sqlite3)

- `schema.ts` — Drizzle table definitions. This is the single source of truth
  for the schema; `drizzle.config.ts` points `drizzle-kit` at it.
- `index.ts` — the shared app DB connection. Import `{ db }` (and `schema`) from
  `@/db`. It creates the SQLite file's parent directory if missing.
- `migrate.ts` — applies pending migrations as an **import side-effect**; it
  opens its own short-lived connection and is dynamically imported from the
  instrumentation hook on boot. Don't import it for normal queries.
- Generated SQL migrations live in `./drizzle/` (committed). Workflow: edit
  `schema.ts` → `npm run db:generate` → migrations apply automatically on next
  server start (via `instrumentation.ts`).
- The DB path comes from `process.env.DB_FILE_NAME` (default `./db/prod.db`),
  consistently across `index.ts`, `migrate.ts`, and `drizzle.config.ts`.
- better-sqlite3 is a native module (Node.js runtime only) — it cannot run in
  the Edge runtime. This is why migration code is guarded by
  `process.env.NEXT_RUNTIME === "nodejs"` in `src/instrumentation.ts`.

### `src/utils/` — Framework-agnostic logic

- Pure TypeScript modules with **no React, Next.js, or DB imports**. They
  should be usable independently of the framework (e.g. `simplefin.ts` is a
  standalone SimpleFIN protocol client: `claim()` plus the `SimpleFinClient`
  class).
- Validate all external/network data at the boundary with **Zod** schemas;
  export both the schema and the inferred type.
- Throw typed errors (e.g. `SimpleFinClaimError`, `SimpleFinRequestError`) so
  callers can branch on failure modes.
- Prefer rich, type-safe signatures (generics, conditional return types) over
  loose ones — and keep them documented with JSDoc.

### Other

- `src/instrumentation.ts` — Next.js startup hook (`register()`), used to run DB
  migrations once per server start, guarded to the Node.js runtime.

## Code style

- TypeScript `strict` mode; no `any`. Use `unknown` + Zod/parsing at boundaries.
- Path alias `@/*` → `src/*` (configured in `tsconfig.json`).
- Biome enforces 2-space indentation and organizes imports automatically; run
  `npm run format`. Do not hand-fight the formatter.
- Document exported functions, classes, and non-obvious types with JSDoc,
  including `@param`/`@returns`/`@throws` and a `@see` link to any external spec.
