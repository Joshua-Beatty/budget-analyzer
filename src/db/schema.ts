import { sqliteTable, text } from "drizzle-orm/sqlite-core";

export const metaData = sqliteTable("meta_data_table", {
  key: text().primaryKey(),
  value: text({ mode: "json" }),
});
