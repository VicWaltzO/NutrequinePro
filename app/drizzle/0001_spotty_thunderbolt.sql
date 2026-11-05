CREATE TABLE `micro_ingredients` (
	`id` text PRIMARY KEY NOT NULL,
	`data` text NOT NULL,
	`operational_id` integer NOT NULL,
	CONSTRAINT "micro_operational_allowed" CHECK("micro_ingredients"."operational_id" > 0 AND "micro_ingredients"."operational_id" != 14)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `micro_ingredients_operational_id_unique` ON `micro_ingredients` (`operational_id`);--> statement-breakpoint
CREATE TABLE `micro_openings` (
	`id` text PRIMARY KEY NOT NULL,
	`data` text NOT NULL,
	`micro_ingredient_id` text NOT NULL,
	FOREIGN KEY (`micro_ingredient_id`) REFERENCES `micro_ingredients`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `micro_openings_micro_ingredient_id_unique` ON `micro_openings` (`micro_ingredient_id`);