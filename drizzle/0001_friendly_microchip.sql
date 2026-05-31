PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_meta_data_table` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text
);
--> statement-breakpoint
INSERT INTO `__new_meta_data_table`("key", "value") SELECT "key", "value" FROM `meta_data_table`;--> statement-breakpoint
DROP TABLE `meta_data_table`;--> statement-breakpoint
ALTER TABLE `__new_meta_data_table` RENAME TO `meta_data_table`;--> statement-breakpoint
PRAGMA foreign_keys=ON;