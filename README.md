This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

## Database (Drizzle + SQLite)

The app uses [Drizzle ORM](https://orm.drizzle.team) with `better-sqlite3`. The
database file path is read from `DB_FILE_NAME` and defaults to `./db/prod.db`.

Migrations are applied **automatically on server startup** via the Next.js
instrumentation hook (`src/instrumentation.ts` → `src/db/migrate.ts`). Running
`npm run dev` or `npm run start` will create the database file if missing and
apply any pending migrations from the `drizzle/` folder. This is idempotent — a
boot against an up-to-date database is a no-op.

### Rapid iteration (schema changing constantly, not deployed)

Use `db:push` to sync your schema straight into a local, disposable database
without generating migration files:

```bash
# edit src/db/schema.ts, then:
npm run db:push
npm run dev
```

`npm run db:studio` opens a browser UI to inspect the data.

> Do not point `push` and the migrate-on-boot flow at the **same** database
> file. A pushed database has no migration ledger (`__drizzle_migrations`),
> while migrations expect one. Keep a disposable DB for `push`-based dev and let
> released/production databases be migration-only.

### Cutting a release (versioned migrations)

When the schema is stable, generate a migration and commit the `drizzle/`
folder — these files are the source of truth for the schema version:

```bash
npm run db:generate   # writes drizzle/NNNN_*.sql + updates drizzle/meta/
git add drizzle/
```

On the next boot (`npm run start`), the startup hook applies the new migration.
A fresh database runs all migrations in order; an existing one runs only the
files it hasn't applied yet, preserving data.

### Deploying with Docker

The SQLite file must live on a **persistent volume**, otherwise it resets on
every container restart. Mount a volume and point `DB_FILE_NAME` at it:

```bash
# example
-v budget-db:/app/db -e DB_FILE_NAME=/app/db/prod.db
```

The committed `drizzle/` migrations ship in the image and are applied
automatically on startup, so no manual migrate step is needed in the container.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
