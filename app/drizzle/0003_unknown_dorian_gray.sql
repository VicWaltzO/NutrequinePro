CREATE TABLE `micro_ledgers` (
	`id` text PRIMARY KEY NOT NULL,
	`data` text NOT NULL,
	`micro_ingredient_id` text NOT NULL,
	`opening_id` text NOT NULL,
	FOREIGN KEY (`micro_ingredient_id`) REFERENCES `micro_ingredients`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`opening_id`) REFERENCES `micro_openings`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `micro_ledgers_micro_ingredient_id_unique` ON `micro_ledgers` (`micro_ingredient_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `micro_ledgers_opening_id_unique` ON `micro_ledgers` (`opening_id`);--> statement-breakpoint
CREATE TABLE `micro_receipt_lines` (
	`id` text PRIMARY KEY NOT NULL,
	`data` text NOT NULL,
	`receipt_id` text NOT NULL,
	`micro_ingredient_id` text NOT NULL,
	FOREIGN KEY (`receipt_id`) REFERENCES `micro_receipts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`micro_ingredient_id`) REFERENCES `micro_ingredients`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `micro_receipts` (
	`id` text PRIMARY KEY NOT NULL,
	`data` text NOT NULL,
	`document_key` text NOT NULL,
	`expense_id` text,
	`request_id` text NOT NULL,
	FOREIGN KEY (`expense_id`) REFERENCES `expenses`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `micro_receipts_document_key_unique` ON `micro_receipts` (`document_key`);--> statement-breakpoint
CREATE UNIQUE INDEX `micro_receipts_expense_id_unique` ON `micro_receipts` (`expense_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `micro_receipts_request_id_unique` ON `micro_receipts` (`request_id`);--> statement-breakpoint
CREATE TABLE `micro_valuation_events` (
	`id` text PRIMARY KEY NOT NULL,
	`data` text NOT NULL,
	`ledger_id` text NOT NULL,
	`receipt_line_id` text NOT NULL,
	`request_id` text NOT NULL,
	`revision` integer NOT NULL,
	FOREIGN KEY (`ledger_id`) REFERENCES `micro_ledgers`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`receipt_line_id`) REFERENCES `micro_receipt_lines`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `micro_valuation_events_receipt_line_id_unique` ON `micro_valuation_events` (`receipt_line_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX micro_event_ledger_revision ON micro_valuation_events(ledger_id, revision);
--> statement-breakpoint
CREATE UNIQUE INDEX micro_event_ledger_request ON micro_valuation_events(ledger_id, request_id);

--> statement-breakpoint
CREATE TRIGGER micro_receipts_cross_insert BEFORE INSERT ON micro_receipts
BEGIN
 SELECT RAISE(ABORT, 'Duplicate micro document or expense') WHERE EXISTS (
 SELECT 1 FROM micro_purchases WHERE document_key = NEW.document_key OR (NEW.expense_id IS NOT NULL AND expense_id = NEW.expense_id));
END;

--> statement-breakpoint
CREATE TRIGGER micro_receipts_cross_update BEFORE UPDATE ON micro_receipts
BEGIN
 SELECT RAISE(ABORT, 'Duplicate micro document or expense') WHERE EXISTS (
 SELECT 1 FROM micro_purchases WHERE document_key = NEW.document_key OR (NEW.expense_id IS NOT NULL AND expense_id = NEW.expense_id));
END;

--> statement-breakpoint
CREATE TRIGGER micro_purchases_cross_insert BEFORE INSERT ON micro_purchases
BEGIN
 SELECT RAISE(ABORT, 'Duplicate micro document or expense') WHERE EXISTS (
 SELECT 1 FROM micro_receipts WHERE document_key = NEW.document_key OR (NEW.expense_id IS NOT NULL AND expense_id = NEW.expense_id));
END;

--> statement-breakpoint
CREATE TRIGGER micro_purchases_cross_update BEFORE UPDATE ON micro_purchases
BEGIN
 SELECT RAISE(ABORT, 'Duplicate micro document or expense') WHERE EXISTS (
 SELECT 1 FROM micro_receipts WHERE document_key = NEW.document_key OR (NEW.expense_id IS NOT NULL AND expense_id = NEW.expense_id));
END;
