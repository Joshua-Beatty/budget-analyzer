CREATE TABLE `__new_accounts` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`conn_id` text,
	`currency` text NOT NULL,
	`balance` integer NOT NULL,
	`available_balance` integer,
	`balance_date` integer NOT NULL,
	`extra` text,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_accounts`("id", "name", "conn_id", "currency", "balance", "available_balance", "balance_date", "extra", "updated_at") SELECT "id", "name", "conn_id", "currency", CAST(ROUND("balance" * 100) AS INTEGER), CASE WHEN "available_balance" IS NULL THEN NULL ELSE CAST(ROUND("available_balance" * 100) AS INTEGER) END, "balance_date", "extra", "updated_at" FROM `accounts`;--> statement-breakpoint
DROP TABLE `accounts`;--> statement-breakpoint
ALTER TABLE `__new_accounts` RENAME TO `accounts`;--> statement-breakpoint
CREATE TABLE `__new_transactions` (
	`id` text NOT NULL,
	`account_id` text NOT NULL,
	`amount` integer NOT NULL,
	`posted` integer NOT NULL,
	`transacted_at` integer,
	`description` text NOT NULL,
	`pending` integer DEFAULT false NOT NULL,
	`extra` text,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`account_id`, `id`),
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_transactions`("id", "account_id", "amount", "posted", "transacted_at", "description", "pending", "extra", "updated_at") SELECT "id", "account_id", CAST(ROUND("amount" * 100) AS INTEGER), "posted", "transacted_at", "description", "pending", "extra", "updated_at" FROM `transactions`;--> statement-breakpoint
DROP TABLE `transactions`;--> statement-breakpoint
ALTER TABLE `__new_transactions` RENAME TO `transactions`;