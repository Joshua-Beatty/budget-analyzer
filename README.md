# Budget Analyzer

A self-hosted budgeting app that pulls account and transaction data via
[SimpleFIN](https://www.simplefin.org/) and lets you categorize, filter, and
bulk-process transactions with reusable rules.

Built with **Next.js 16** (App Router), **Drizzle ORM** + **better-sqlite3**,
and **Tailwind CSS v4**.

## Features

- **Sync** accounts and transactions from SimpleFIN (incremental or full history)
- **Transactions** table with server-side pagination, sorting, and filtering
- **Categories** with drag-to-reorder management
- **Rules** that auto-assign categories by account, amount, and description regex
- **Bulk actions** — mark inspected/shared, apply rules with a preview, export to clipboard
- Account **nicknames** and a clean light/dark UI

## Quick start

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000), then add a SimpleFIN token
in **Settings** and run a **Sync**.

## Deploy with Docker

The easiest way to self-host is Docker Compose. See the example
[`docker-compose.yml`](./docker-compose.yml):

```bash
docker compose up -d
```

It builds the image, serves on port `3000`, and persists the SQLite database to
`./data` on the host. The database path is configurable via the `DB_FILE_NAME`
environment variable (default `/data/prod.db`).

> Always keep the database on a **persistent volume** — otherwise it resets on
> every container restart.

## Database

The schema lives in `src/db/schema.ts`. Migrations in `drizzle/` are applied
**automatically on startup**, so a fresh database is created and brought
up to date with no manual step.

| Command | Description |
| --- | --- |
| `npm run db:generate` | Generate a migration after editing the schema |
| `npm run db:push` | Push the schema directly to a disposable dev database |
| `npm run db:studio` | Open Drizzle Studio to inspect data |

After changing the schema, run `npm run db:generate` and commit the `drizzle/`
folder — those files are the source of truth for the schema version.

## Development

```bash
npm run dev      # start the dev server (Turbopack)
npm run build    # production build
npm run lint     # Biome lint + format check
npm run format   # Biome auto-format
```

See [`AGENTS.md`](./AGENTS.md) for architecture and code conventions.
