import { existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema";

/**
 * Path to the SQLite database file. Defaults to `./db/prod.db` (relative to the
 * project root) when `DB_FILE_NAME` is not set.
 *
 * Note: better-sqlite3 takes a plain filesystem path (no `file:` prefix).
 */
export const DB_FILE_NAME = process.env.DB_FILE_NAME ?? "./db/prod.db";

// better-sqlite3 will not create missing parent directories, so make sure the
// directory holding the database file exists before opening the connection.
const dbDir = dirname(DB_FILE_NAME);
if (!existsSync(dbDir)) {
  mkdirSync(dbDir, { recursive: true });
}

const sqlite = new Database(DB_FILE_NAME);

export const db = drizzle(sqlite, { schema });

export { schema };
