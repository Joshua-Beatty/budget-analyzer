CREATE TABLE `categories` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`position` integer NOT NULL,
	`deleted` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE `transactions` ADD `category_id` integer REFERENCES categories(id);--> statement-breakpoint
ALTER TABLE `transactions` ADD `shared` integer;--> statement-breakpoint
ALTER TABLE `transactions` ADD `inspected` integer;