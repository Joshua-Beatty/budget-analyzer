"use server";

import { asc, eq, max } from "drizzle-orm";
import type { Category } from "@/app/actions/categories-types";
import { db } from "@/db";
import { categories } from "@/db/schema";

/**
 * List active (non-deleted) categories ordered by `position`.
 */
export async function getCategories(): Promise<Category[]> {
  return db
    .select({
      id: categories.id,
      name: categories.name,
      position: categories.position,
    })
    .from(categories)
    .where(eq(categories.deleted, false))
    .orderBy(asc(categories.position));
}

/**
 * Add a new category at the end of the order.
 *
 * @param name the category name (trimmed; empty names are rejected).
 * @returns the created {@link Category}.
 * @throws when `name` is empty.
 */
export async function addCategory(name: string): Promise<Category> {
  const trimmed = name.trim();
  if (trimmed.length === 0) {
    throw new Error("Category name cannot be empty.");
  }

  const [{ value: maxPosition } = { value: null }] = await db
    .select({ value: max(categories.position) })
    .from(categories);

  const rows = await db
    .insert(categories)
    .values({
      name: trimmed,
      position: (maxPosition ?? -1) + 1,
      createdAt: Date.now(),
    })
    .returning({
      id: categories.id,
      name: categories.name,
      position: categories.position,
    });

  return rows[0];
}

/**
 * Rename a category.
 *
 * @param id the category id.
 * @param name the new name (trimmed; empty names are rejected).
 * @throws when `name` is empty.
 */
export async function renameCategory(id: number, name: string): Promise<void> {
  const trimmed = name.trim();
  if (trimmed.length === 0) {
    throw new Error("Category name cannot be empty.");
  }
  await db
    .update(categories)
    .set({ name: trimmed })
    .where(eq(categories.id, id));
}

/**
 * Soft-delete a category: it is hidden from selection but existing transaction
 * assignments still resolve to its name.
 *
 * @param id the category id.
 */
export async function softDeleteCategory(id: number): Promise<void> {
  await db
    .update(categories)
    .set({ deleted: true })
    .where(eq(categories.id, id));
}

/**
 * Persist a new category ordering.
 *
 * Each id's new `position` is its index in `orderedIds`. Ids not present are
 * left untouched.
 *
 * @param orderedIds active category ids in their desired display order.
 */
export async function reorderCategories(orderedIds: number[]): Promise<void> {
  db.transaction((tx) => {
    orderedIds.forEach((id, index) => {
      tx.update(categories)
        .set({ position: index })
        .where(eq(categories.id, id))
        .run();
    });
  });
}
