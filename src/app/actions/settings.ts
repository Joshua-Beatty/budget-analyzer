"use server";

import { eq } from "drizzle-orm";
import { db } from "@/db";
import { metaData } from "@/db/schema";

/**
 * A single settings record stored in the `meta_data_table`.
 *
 * `key` is the integer primary key and `value` is an arbitrary JSON payload.
 */
export type Setting = typeof metaData.$inferSelect;

/**
 * Read every setting from the database.
 */
export async function getAllSettings(): Promise<Setting[]> {
  return db.select().from(metaData);
}

/**
 * Read a single setting by its numeric key.
 *
 * @returns the matching setting, or `undefined` when no row exists.
 */
export async function getSetting(key: string): Promise<Setting | undefined> {
  const rows = await db
    .select()
    .from(metaData)
    .where(eq(metaData.key, key))
    .limit(1);

  return rows[0];
}

/**
 * Create or update the setting stored under `key`.
 *
 * Performs an upsert: when a row already exists for `key` its `value` is
 * overwritten, otherwise a new row is inserted.
 *
 * @returns the persisted setting.
 */
export async function setSetting(
  key: string,
  value: unknown,
): Promise<Setting> {
  const rows = await db
    .insert(metaData)
    .values({ key, value })
    .onConflictDoUpdate({ target: metaData.key, set: { value } })
    .returning();

  return rows[0];
}

/**
 * Delete the setting stored under `key`.
 *
 * @returns the deleted setting, or `undefined` when no row existed.
 */
export async function deleteSetting(key: string): Promise<Setting | undefined> {
  const rows = await db
    .delete(metaData)
    .where(eq(metaData.key, key))
    .returning();

  return rows[0];
}
