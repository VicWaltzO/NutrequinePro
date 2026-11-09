CREATE TABLE `micro_preparations` (
	`id` text PRIMARY KEY NOT NULL,
	`data` text NOT NULL,
	`formula_id` text NOT NULL,
	`request_id` text NOT NULL,
	`family` text NOT NULL,
	`nuclei_hundredths` integer NOT NULL,
	FOREIGN KEY (`formula_id`) REFERENCES `micro_formulas`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "micro_preparation_family" CHECK("micro_preparations"."family" IN ('ROSADO','VERDE_AMARILLO')),
	CONSTRAINT "micro_preparation_quantity" CHECK(typeof("micro_preparations"."nuclei_hundredths") = 'integer' AND "micro_preparations"."nuclei_hundredths" > 0 AND "micro_preparations"."nuclei_hundredths" <= 1000000000)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `micro_preparations_request_id_unique` ON `micro_preparations` (`request_id`);
--> statement-breakpoint
CREATE TRIGGER micro_preparation_valid BEFORE INSERT ON micro_preparations
BEGIN
 SELECT RAISE(ABORT, 'Preparation identity mismatch') WHERE
 json_extract(NEW.data,'$.id') IS NOT NEW.id OR
 json_extract(NEW.data,'$.formula_id') IS NOT NEW.formula_id OR
 json_extract(NEW.data,'$.request_id') IS NOT NEW.request_id OR
 json_extract(NEW.data,'$.family') IS NOT NEW.family OR
 json_extract(NEW.data,'$.nuclei_hundredths') IS NOT NEW.nuclei_hundredths OR
 json_extract(NEW.data,'$.status') IS NOT 'PENDING' OR
 length(NEW.request_id) NOT BETWEEN 1 AND 100 OR
 typeof(json_extract(NEW.data,'$.authorization_reference')) IS NOT 'text' OR
 length(trim(json_extract(NEW.data,'$.authorization_reference'))) NOT BETWEEN 1 AND 2000 OR
 typeof(json_extract(NEW.data,'$.date')) IS NOT 'text' OR
 date(json_extract(NEW.data,'$.date'),'+0 days') IS NOT json_extract(NEW.data,'$.date') OR
 length(json_extract(NEW.data,'$.date')) IS NOT 10 OR
 NOT EXISTS(SELECT 1 FROM users WHERE id=json_extract(NEW.data,'$.created_by')) OR
 typeof(json_extract(NEW.data,'$.created_at')) IS NOT 'text';
 SELECT RAISE(ABORT, 'Preparation requires active published formula') WHERE NOT EXISTS (
 SELECT 1 FROM micro_formulas f JOIN micro_formula_heads h ON h.active_formula_id=f.id
 WHERE f.id=NEW.formula_id AND f.family=NEW.family AND h.family=NEW.family AND
 json_extract(f.data,'$.published_at') IS NOT NULL AND
 EXISTS (SELECT 1 FROM micro_formula_lines WHERE formula_id=f.id));
END;
--> statement-breakpoint
CREATE TRIGGER micro_preparation_no_update BEFORE UPDATE ON micro_preparations
BEGIN SELECT RAISE(ABORT, 'Immutable pending preparation'); END;
--> statement-breakpoint
CREATE TRIGGER micro_preparation_no_delete BEFORE DELETE ON micro_preparations
BEGIN SELECT RAISE(ABORT, 'Immutable pending preparation'); END;
