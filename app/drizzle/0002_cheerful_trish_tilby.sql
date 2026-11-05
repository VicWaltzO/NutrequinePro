CREATE TABLE `micro_purchase_lines` (
	`id` text PRIMARY KEY NOT NULL,
	`data` text NOT NULL,
	`purchase_id` text NOT NULL,
	`micro_ingredient_id` text NOT NULL,
	FOREIGN KEY (`purchase_id`) REFERENCES `micro_purchases`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`micro_ingredient_id`) REFERENCES `micro_ingredients`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `micro_purchases` (
	`id` text PRIMARY KEY NOT NULL,
	`data` text NOT NULL,
	`document_key` text NOT NULL,
	`expense_id` text,
	FOREIGN KEY (`expense_id`) REFERENCES `expenses`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `micro_purchases_document_key_unique` ON `micro_purchases` (`document_key`);--> statement-breakpoint
CREATE UNIQUE INDEX `micro_purchases_expense_id_unique` ON `micro_purchases` (`expense_id`);