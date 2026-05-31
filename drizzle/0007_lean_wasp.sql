PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_rules` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`position` integer NOT NULL,
	`account_ids` text,
	`min_amount` integer,
	`max_amount` integer,
	`description_regex` text,
	`category_id` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_rules`("id", "name", "position", "account_ids", "min_amount", "max_amount", "description_regex", "category_id", "created_at") SELECT "id", "name", "position", "account_ids", "min_amount", "max_amount", "description_regex", "category_id", "created_at" FROM `rules`;--> statement-breakpoint
DROP TABLE `rules`;--> statement-breakpoint
ALTER TABLE `__new_rules` RENAME TO `rules`;--> statement-breakpoint
PRAGMA foreign_keys=ON;