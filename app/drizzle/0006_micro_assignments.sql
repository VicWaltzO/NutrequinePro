CREATE TABLE `micro_assignment_lines` (
	`id` text PRIMARY KEY NOT NULL,
	`data` text NOT NULL,
	`assignment_id` text NOT NULL,
	`formula_line_id` text NOT NULL,
	`micro_ingredient_id` text NOT NULL,
	`quantity_hundredths` integer NOT NULL,
	FOREIGN KEY (`assignment_id`) REFERENCES `micro_assignments`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`formula_line_id`) REFERENCES `micro_formula_lines`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`micro_ingredient_id`) REFERENCES `micro_ingredients`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "micro_assignment_quantity" CHECK(typeof("micro_assignment_lines"."quantity_hundredths") = 'integer' AND "micro_assignment_lines"."quantity_hundredths" > 0 AND "micro_assignment_lines"."quantity_hundredths" <= 9007199254740991)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `micro_assignment_line_identity` ON `micro_assignment_lines` (`assignment_id`,`micro_ingredient_id`);--> statement-breakpoint
CREATE TABLE `micro_assignment_reversals` (
	`id` text PRIMARY KEY NOT NULL,
	`data` text NOT NULL,
	`assignment_id` text NOT NULL,
	`request_id` text NOT NULL,
	FOREIGN KEY (`assignment_id`) REFERENCES `micro_assignments`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `micro_assignment_reversals_assignment_id_unique` ON `micro_assignment_reversals` (`assignment_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `micro_assignment_reversals_request_id_unique` ON `micro_assignment_reversals` (`request_id`);--> statement-breakpoint
CREATE TABLE `micro_assignments` (
	`id` text PRIMARY KEY NOT NULL,
	`data` text NOT NULL,
	`preparation_id` text NOT NULL,
	`request_id` text NOT NULL,
	FOREIGN KEY (`preparation_id`) REFERENCES `micro_preparations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `micro_assignments_request_id_unique` ON `micro_assignments` (`request_id`);
--> statement-breakpoint
CREATE TRIGGER micro_assignments_valid BEFORE INSERT ON micro_assignments
BEGIN
 SELECT RAISE(ABORT, 'Assignment metadata mismatch') WHERE json_extract(NEW.data,'$.id') IS NOT NEW.id OR
 json_extract(NEW.data,'$.preparation_id') IS NOT NEW.preparation_id OR
 json_extract(NEW.data,'$.request_id') IS NOT NEW.request_id OR
 length(NEW.request_id) NOT BETWEEN 1 AND 100 OR
 typeof(json_extract(NEW.data,'$.reason')) IS NOT 'text' OR
 length(trim(json_extract(NEW.data,'$.reason'))) NOT BETWEEN 1 AND 2000 OR
 typeof(json_extract(NEW.data,'$.created_at')) IS NOT 'text' OR
 NOT EXISTS(SELECT 1 FROM users WHERE id=json_extract(NEW.data,'$.created_by'));
END;

--> statement-breakpoint
CREATE TRIGGER micro_assignment_reversals_valid BEFORE INSERT ON micro_assignment_reversals
BEGIN
 SELECT RAISE(ABORT, 'Assignment metadata mismatch') WHERE json_extract(NEW.data,'$.id') IS NOT NEW.id OR
 json_extract(NEW.data,'$.assignment_id') IS NOT NEW.assignment_id OR
 json_extract(NEW.data,'$.request_id') IS NOT NEW.request_id OR
 length(NEW.request_id) NOT BETWEEN 1 AND 100 OR
 typeof(json_extract(NEW.data,'$.reason')) IS NOT 'text' OR
 length(trim(json_extract(NEW.data,'$.reason'))) NOT BETWEEN 1 AND 2000 OR
 typeof(json_extract(NEW.data,'$.created_at')) IS NOT 'text' OR
 NOT EXISTS(SELECT 1 FROM users WHERE id=json_extract(NEW.data,'$.created_by'));
END;

--> statement-breakpoint
CREATE TRIGGER micro_assignment_exclusive BEFORE INSERT ON micro_assignments
BEGIN
 SELECT RAISE(ABORT, 'Order already assigned') WHERE EXISTS (
 SELECT 1 FROM micro_assignments a WHERE a.preparation_id=NEW.preparation_id
 AND NOT EXISTS(SELECT 1 FROM micro_assignment_reversals r WHERE r.assignment_id=a.id));
 SELECT RAISE(ABORT, 'Missing assignment authorization') WHERE
 typeof(json_extract(NEW.data,'$.authorization_reference')) IS NOT 'text' OR
 length(trim(json_extract(NEW.data,'$.authorization_reference'))) NOT BETWEEN 1 AND 2000;
END;
--> statement-breakpoint
CREATE TRIGGER micro_assignment_line_valid BEFORE INSERT ON micro_assignment_lines
BEGIN
 SELECT RAISE(ABORT, 'Assignment line mismatch') WHERE
 json_extract(NEW.data,'$.id') IS NOT NEW.id OR
 json_extract(NEW.data,'$.assignment_id') IS NOT NEW.assignment_id OR
 json_extract(NEW.data,'$.formula_line_id') IS NOT NEW.formula_line_id OR
 json_extract(NEW.data,'$.micro_ingredient_id') IS NOT NEW.micro_ingredient_id OR
 json_extract(NEW.data,'$.quantity_hundredths') IS NOT NEW.quantity_hundredths OR
 NOT EXISTS(SELECT 1 FROM users WHERE id=json_extract(NEW.data,'$.created_by')) OR
 typeof(json_extract(NEW.data,'$.created_at')) IS NOT 'text';
 SELECT RAISE(ABORT, 'Assignment requires exact historical dose and active ingredient') WHERE NOT EXISTS (
 SELECT 1 FROM micro_assignments a JOIN micro_preparations p ON p.id=a.preparation_id
 JOIN micro_formula_lines f ON f.formula_id=p.formula_id
 JOIN micro_ingredients m ON m.id=f.micro_ingredient_id
 WHERE a.id=NEW.assignment_id AND f.id=NEW.formula_line_id AND m.id=NEW.micro_ingredient_id
 AND json_extract(m.data,'$.is_active')=1
 AND f.dose_grams * p.nuclei_hundredths=NEW.quantity_hundredths
 AND NOT EXISTS(SELECT 1 FROM micro_assignment_reversals r WHERE r.assignment_id=a.id));
 SELECT RAISE(ABORT, 'Insufficient free micro stock') WHERE NEW.quantity_hundredths + COALESCE((
 SELECT SUM(l.quantity_hundredths) FROM micro_assignment_lines l
 WHERE l.micro_ingredient_id=NEW.micro_ingredient_id
 AND NOT EXISTS(SELECT 1 FROM micro_assignment_reversals r WHERE r.assignment_id=l.assignment_id)),0)
 > 100 * COALESCE((SELECT json_extract(data,'$.ledger.quantity_grams') FROM micro_ledgers
 WHERE micro_ingredient_id=NEW.micro_ingredient_id AND json_array_length(data,'$.ledger.events')>0),
 (SELECT json_extract(data,'$.quantity_grams') FROM micro_openings WHERE micro_ingredient_id=NEW.micro_ingredient_id),0);
END;
--> statement-breakpoint
CREATE TRIGGER micro_opening_assignment_floor BEFORE UPDATE ON micro_openings
BEGIN
 SELECT RAISE(ABORT, 'Opening below assigned stock') WHERE
 json_extract(NEW.data,'$.quantity_grams') * 100 < COALESCE((
 SELECT SUM(l.quantity_hundredths) FROM micro_assignment_lines l
 WHERE l.micro_ingredient_id=NEW.micro_ingredient_id
 AND NOT EXISTS(SELECT 1 FROM micro_assignment_reversals r WHERE r.assignment_id=l.assignment_id)),0);
END;

--> statement-breakpoint
CREATE TRIGGER micro_assignments_no_update BEFORE UPDATE ON micro_assignments
BEGIN SELECT RAISE(ABORT, 'Immutable assignment history'); END;

--> statement-breakpoint
CREATE TRIGGER micro_assignments_no_delete BEFORE DELETE ON micro_assignments
BEGIN SELECT RAISE(ABORT, 'Immutable assignment history'); END;

--> statement-breakpoint
CREATE TRIGGER micro_assignment_lines_no_update BEFORE UPDATE ON micro_assignment_lines
BEGIN SELECT RAISE(ABORT, 'Immutable assignment history'); END;

--> statement-breakpoint
CREATE TRIGGER micro_assignment_lines_no_delete BEFORE DELETE ON micro_assignment_lines
BEGIN SELECT RAISE(ABORT, 'Immutable assignment history'); END;

--> statement-breakpoint
CREATE TRIGGER micro_assignment_reversals_no_update BEFORE UPDATE ON micro_assignment_reversals
BEGIN SELECT RAISE(ABORT, 'Immutable assignment history'); END;

--> statement-breakpoint
CREATE TRIGGER micro_assignment_reversals_no_delete BEFORE DELETE ON micro_assignment_reversals
BEGIN SELECT RAISE(ABORT, 'Immutable assignment history'); END;
