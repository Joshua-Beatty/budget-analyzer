CREATE TABLE `accounts` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`conn_id` text,
	`currency` text NOT NULL,
	`balance` text NOT NULL,
	`available_balance` text,
	`balance_date` integer NOT NULL,
	`extra` text,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `transactions` (
	`id` text NOT NULL,
	`account_id` text NOT NULL,
	`amount` text NOT NULL,
	`posted` integer NOT NULL,
	`transacted_at` integer,
	`description` text NOT NULL,
	`pending` integer DEFAULT false NOT NULL,
	`extra` text,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`account_id`, `id`),
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action
);
