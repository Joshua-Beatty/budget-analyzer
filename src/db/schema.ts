import {
  integer,
  primaryKey,
  sqliteTable,
  text,
} from "drizzle-orm/sqlite-core";

/**
 * Key/value store for app settings and sync metadata (e.g. the SimpleFIN
 * Access URL and the last-sync timestamp).
 */
export const metaData = sqliteTable("meta_data_table", {
  key: text().primaryKey(),
  value: text({ mode: "json" }),
});

/**
 * A financial account synced from SimpleFIN.
 *
 * `id` is the SimpleFIN account id. Balances are stored as the raw numeric
 * strings from the protocol; `currency` is the raw protocol value (an ISO 4217
 * code or a custom-currency URL) and is not interpreted here.
 *
 * @see https://www.simplefin.org/protocol.html#account
 */
export const accounts = sqliteTable("accounts", {
  /** SimpleFIN account id. */
  id: text().primaryKey(),
  name: text().notNull(),
  /** Optional user-defined display name; overrides `name` in the UI. */
  nickname: text(),
  /** v2 connection id (may be absent on older servers). */
  connId: text("conn_id"),
  /** Raw currency value: ISO 4217 code or a custom-currency URL. */
  currency: text().notNull(),
  /** Account balance in integer minor units (cents). */
  balance: integer().notNull(),
  /** Available balance in integer minor units (cents), when provided. */
  availableBalance: integer("available_balance"),
  /** Unix epoch (seconds) when the balance became current. */
  balanceDate: integer("balance_date").notNull(),
  /** Server-defined extra data, stored verbatim. */
  extra: text({ mode: "json" }),
  /** Epoch ms of the last local upsert. */
  updatedAt: integer("updated_at").notNull(),
});

/**
 * A user-defined transaction category.
 *
 * Categories are soft-deleted (`deleted = true`) rather than removed, so a
 * category that has been assigned to transactions can disappear from selection
 * dropdowns while existing assignments still resolve to its name.
 */
export const categories = sqliteTable("categories", {
  /** Auto-incrementing category id. */
  id: integer().primaryKey({ autoIncrement: true }),
  name: text().notNull(),
  /** 0-based display order; lower sorts first. */
  position: integer().notNull(),
  /** Soft-delete flag; deleted categories are hidden from selection. */
  deleted: integer({ mode: "boolean" }).notNull().default(false),
  /** Epoch ms the category was created. */
  createdAt: integer("created_at").notNull(),
});

/**
 * A user-defined rule that assigns a category to matching transactions.
 *
 * Matching criteria are ANDed: an optional list of account ids, an optional
 * signed amount range (cents), and a description regex. Rules are ordered by
 * `position`; when applying, the first matching rule wins per transaction.
 */
export const rules = sqliteTable("rules", {
  /** Auto-incrementing rule id. */
  id: integer().primaryKey({ autoIncrement: true }),
  /** User-facing label for the rule. */
  name: text().notNull(),
  /** 0-based order; lower runs first (first match wins). */
  position: integer().notNull(),
  /** Account ids the rule applies to; null/empty means all accounts. */
  accountIds: text("account_ids", { mode: "json" }).$type<string[]>(),
  /** Minimum signed amount in cents (inclusive), or null for no minimum. */
  minAmount: integer("min_amount"),
  /** Maximum signed amount in cents (inclusive), or null for no maximum. */
  maxAmount: integer("max_amount"),
  /** Case-insensitive regex matched against the description; null = no check. */
  descriptionRegex: text("description_regex"),
  /** Category to assign to matching transactions ({@link categories.id}). */
  categoryId: integer("category_id")
    .notNull()
    .references(() => categories.id),
  /** Epoch ms the rule was created. */
  createdAt: integer("created_at").notNull(),
});

/**
 * A transaction belonging to an {@link accounts} row.
 *
 * SimpleFIN only guarantees transaction `id` is unique *within* an account, so
 * the primary key is the composite `(accountId, id)`.
 *
 * @see https://www.simplefin.org/protocol.html#transaction
 */
export const transactions = sqliteTable(
  "transactions",
  {
    /** SimpleFIN transaction id (unique within its account). */
    id: text().notNull(),
    /** Owning account id ({@link accounts.id}). */
    accountId: text("account_id")
      .notNull()
      .references(() => accounts.id),
    /** Amount in integer minor units (cents); negative = money leaving. */
    amount: integer().notNull(),
    /** Unix epoch (seconds) the transaction posted; `0` when pending. */
    posted: integer().notNull(),
    /** Unix epoch (seconds) the transaction occurred, when provided. */
    transactedAt: integer("transacted_at"),
    description: text().notNull(),
    /** Whether the transaction has not yet posted. */
    pending: integer({ mode: "boolean" }).notNull().default(false),
    /** User-assigned category ({@link categories.id}); null when unset. */
    categoryId: integer("category_id").references(() => categories.id),
    /** Timestamp the user marked this shared; null when not shared. */
    shared: integer({ mode: "timestamp_ms" }),
    /** Timestamp the user marked this inspected; null when not inspected. */
    inspected: integer({ mode: "timestamp_ms" }),
    /** Server-defined extra data, stored verbatim. */
    extra: text({ mode: "json" }),
    /** Epoch ms of the last local upsert. */
    updatedAt: integer("updated_at").notNull(),
  },
  (table) => [primaryKey({ columns: [table.accountId, table.id] })],
);
