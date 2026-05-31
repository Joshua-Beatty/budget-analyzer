import { existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";

/**
 * Applies any pending Drizzle migrations to the SQLite database.
 *
 * This module runs its migration as an import side-effect so it can simply be
 * `await import()`-ed from the Next.js instrumentation hook on server startup.
 * It opens its own short-lived connection (separate from the app connection in
 * `./index.ts`) and closes it once migrations are applied.
 *
 * Migrations are idempotent: `migrate()` records applied files in the
 * `__drizzle_migrations` table and only runs files that haven't been applied
 * yet, so running this on every boot is a no-op when the DB is up to date.
 */

// Plain filesystem path (no "file:" prefix for better-sqlite3). Defaults to
// ./db/prod.db, matching ./index.ts.
const DB_FILE_NAME = process.env.DB_FILE_NAME ?? "./db/prod.db";

// better-sqlite3 will not create missing parent directories.
const dbDir = dirname(DB_FILE_NAME);
if (!existsSync(dbDir)) {
  mkdirSync(dbDir, { recursive: true });
}

const sqlite = new Database(DB_FILE_NAME);

try {
  const db = drizzle(sqlite);
  // Resolved relative to process.cwd() (the project root for `next dev`/`next start`).
  migrate(db, { migrationsFolder: "./drizzle" });
  console.log(`[db] migrations applied (${DB_FILE_NAME})`);
} catch (error) {
  console.error("[db] migration failed", error);
  // Rethrow so a broken migration surfaces at boot instead of silently
  // starting the server against an out-of-date schema.
  throw error;
} finally {
  sqlite.close();
}
