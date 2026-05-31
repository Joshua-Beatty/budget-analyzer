/**
 * Next.js instrumentation hook. `register()` runs once when a new server
 * instance starts (for both `next dev` and `next start`) and completes before
 * the server handles requests.
 *
 * We use it to apply pending database migrations on startup. The migration code
 * is dynamically imported behind a Node.js runtime guard because it relies on
 * the native `better-sqlite3` module, which cannot run in the Edge runtime.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./db/migrate");
  }
}
