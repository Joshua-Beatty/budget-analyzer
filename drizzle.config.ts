import { existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { defineConfig } from "drizzle-kit";

const dbFileName = process.env.DB_FILE_NAME ?? "./db/prod.db";

// better-sqlite3 (used by drizzle-kit) will not create missing parent
// directories, so ensure the directory holding the database file exists.
const dbDir = dirname(dbFileName);
if (!existsSync(dbDir)) {
  mkdirSync(dbDir, { recursive: true });
}

export default defineConfig({
  out: "./drizzle",
  schema: "./src/db/schema.ts",
  dialect: "sqlite",
  dbCredentials: {
    url: dbFileName,
  },
});
