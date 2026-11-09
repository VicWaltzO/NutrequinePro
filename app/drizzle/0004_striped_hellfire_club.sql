CREATE TABLE `micro_formula_heads` (
	`id` text PRIMARY KEY NOT NULL,
	`data` text NOT NULL,
	`family` text NOT NULL,
	`active_formula_id` text,
	`version` integer NOT NULL,
	FOREIGN KEY (`active_formula_id`) REFERENCES `micro_formulas`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "micro_head_family" CHECK("micro_formula_heads"."family" IN ('ROSADO','VERDE_AMARILLO')),
	CONSTRAINT "micro_head_version" CHECK(typeof("micro_formula_heads"."version") = 'integer' AND "micro_formula_heads"."version" > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `micro_formula_heads_family_unique` ON `micro_formula_heads` (`family`);--> statement-breakpoint
CREATE UNIQUE INDEX `micro_formula_heads_active_formula_id_unique` ON `micro_formula_heads` (`active_formula_id`);--> statement-breakpoint
CREATE TABLE `micro_formula_lines` (
	`id` text PRIMARY KEY NOT NULL,
	`data` text NOT NULL,
	`formula_id` text NOT NULL,
	`micro_ingredient_id` text NOT NULL,
	`dose_grams` integer NOT NULL,
	FOREIGN KEY (`formula_id`) REFERENCES `micro_formulas`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`micro_ingredient_id`) REFERENCES `micro_ingredients`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "micro_formula_positive_dose" CHECK(typeof("micro_formula_lines"."dose_grams") = 'integer' AND "micro_formula_lines"."dose_grams" > 0 AND "micro_formula_lines"."dose_grams" <= 1000000000000)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `micro_formula_line_identity` ON `micro_formula_lines` (`formula_id`,`micro_ingredient_id`);--> statement-breakpoint
CREATE TABLE `micro_formulas` (
	`id` text PRIMARY KEY NOT NULL,
	`data` text NOT NULL,
	`family` text NOT NULL,
	`version` integer NOT NULL,
	CONSTRAINT "micro_formula_family" CHECK("micro_formulas"."family" IN ('ROSADO','VERDE_AMARILLO')),
	CONSTRAINT "micro_formula_version" CHECK(typeof("micro_formulas"."version") = 'integer' AND "micro_formulas"."version" > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `micro_formula_family_version` ON `micro_formulas` (`family`,`version`);
--> statement-breakpoint
CREATE TRIGGER micro_formula_immutable BEFORE UPDATE ON micro_formulas
BEGIN
 SELECT RAISE(ABORT, 'Immutable micro formula') WHERE
 OLD.family != NEW.family OR OLD.version != NEW.version OR
 json_extract(OLD.data,'$.published_at') IS NOT NULL OR
 json_extract(NEW.data,'$.published_at') IS NULL OR
 json_extract(NEW.data,'$.published_by') IS NULL OR
 json_remove(OLD.data,'$.published_at','$.published_by') != json_remove(NEW.data,'$.published_at','$.published_by');
END;
--> statement-breakpoint
CREATE TRIGGER micro_formula_no_delete BEFORE DELETE ON micro_formulas
BEGIN SELECT RAISE(ABORT, 'Immutable micro formula'); END;
--> statement-breakpoint
CREATE TRIGGER micro_formula_line_no_update BEFORE UPDATE ON micro_formula_lines
BEGIN SELECT RAISE(ABORT, 'Immutable micro formula line'); END;
--> statement-breakpoint
CREATE TRIGGER micro_formula_line_no_delete BEFORE DELETE ON micro_formula_lines
BEGIN SELECT RAISE(ABORT, 'Immutable micro formula line'); END;
--> statement-breakpoint
CREATE TRIGGER micro_formula_line_draft BEFORE INSERT ON micro_formula_lines
BEGIN
 SELECT RAISE(ABORT, 'Published formula cannot receive lines') WHERE EXISTS
 (SELECT 1 FROM micro_formulas WHERE id=NEW.formula_id AND json_extract(data,'$.published_at') IS NOT NULL);
 SELECT RAISE(ABORT, 'Micro formula line mismatch') WHERE
 json_extract(NEW.data,'$.formula_id') IS NOT NEW.formula_id OR
 json_extract(NEW.data,'$.micro_ingredient_id') IS NOT NEW.micro_ingredient_id OR
 json_extract(NEW.data,'$.dose_grams') IS NOT NEW.dose_grams;
END;
--> statement-breakpoint
CREATE TRIGGER micro_formula_head_no_delete BEFORE DELETE ON micro_formula_heads
BEGIN SELECT RAISE(ABORT, 'Immutable micro formula head'); END;
--> statement-breakpoint
CREATE TRIGGER micro_formula_head_cas BEFORE UPDATE ON micro_formula_heads
BEGIN
 SELECT RAISE(ABORT, 'Micro formula head conflict') WHERE NEW.family != OLD.family OR NEW.version != OLD.version+1;
 SELECT RAISE(ABORT, 'Historical formula cannot reactivate') WHERE
 NEW.active_formula_id IS NOT OLD.active_formula_id AND OLD.active_formula_id IS NOT NULL AND
 (NEW.active_formula_id IS NULL OR
 (SELECT version FROM micro_formulas WHERE id=NEW.active_formula_id) <= (SELECT version FROM micro_formulas WHERE id=OLD.active_formula_id));
END;

--> statement-breakpoint
CREATE TRIGGER micro_formula_head_valid_insert BEFORE INSERT ON micro_formula_heads
WHEN NOT EXISTS (SELECT 1 FROM micro_formula_heads WHERE id=NEW.id)
BEGIN
 SELECT RAISE(ABORT, 'Micro formula head mismatch') WHERE
 json_extract(NEW.data,'$.family') IS NOT NEW.family OR
 json_extract(NEW.data,'$.active_formula_id') IS NOT NEW.active_formula_id OR
 json_extract(NEW.data,'$.version') IS NOT NEW.version;
 SELECT RAISE(ABORT, 'Invalid active micro formula') WHERE NEW.active_formula_id IS NOT NULL AND NOT EXISTS
 (SELECT 1 FROM micro_formulas f WHERE f.id=NEW.active_formula_id AND f.family=NEW.family AND
 json_extract(f.data,'$.published_at') IS NOT NULL AND
 EXISTS (SELECT 1 FROM micro_formula_lines l WHERE l.formula_id=f.id) AND
 NOT EXISTS (SELECT 1 FROM micro_formula_lines l JOIN micro_ingredients m ON m.id=l.micro_ingredient_id
 WHERE l.formula_id=f.id AND json_extract(m.data,'$.is_active') != 1));
END;

--> statement-breakpoint
CREATE TRIGGER micro_formula_head_valid_update BEFORE UPDATE ON micro_formula_heads
BEGIN
 SELECT RAISE(ABORT, 'Micro formula head mismatch') WHERE
 json_extract(NEW.data,'$.family') IS NOT NEW.family OR
 json_extract(NEW.data,'$.active_formula_id') IS NOT NEW.active_formula_id OR
 json_extract(NEW.data,'$.version') IS NOT NEW.version;
 SELECT RAISE(ABORT, 'Invalid active micro formula') WHERE NEW.active_formula_id IS NOT OLD.active_formula_id AND NEW.active_formula_id IS NOT NULL AND NOT EXISTS
 (SELECT 1 FROM micro_formulas f WHERE f.id=NEW.active_formula_id AND f.family=NEW.family AND
 json_extract(f.data,'$.published_at') IS NOT NULL AND
 EXISTS (SELECT 1 FROM micro_formula_lines l WHERE l.formula_id=f.id) AND
 NOT EXISTS (SELECT 1 FROM micro_formula_lines l JOIN micro_ingredients m ON m.id=l.micro_ingredient_id
 WHERE l.formula_id=f.id AND json_extract(m.data,'$.is_active') != 1));
END;

--> statement-breakpoint
CREATE TRIGGER micro_formula_identity_insert BEFORE INSERT ON micro_formulas
BEGIN
 SELECT RAISE(ABORT, 'Micro formula identity mismatch') WHERE
 json_extract(NEW.data,'$.id') IS NOT NEW.id OR
 json_extract(NEW.data,'$.family') IS NOT NEW.family OR
 json_extract(NEW.data,'$.version') IS NOT NEW.version;
 SELECT RAISE(ABORT, 'Formula must begin as draft') WHERE
 NOT EXISTS (SELECT 1 FROM micro_formulas WHERE id=NEW.id) AND
 (json_extract(NEW.data,'$.published_at') IS NOT NULL OR json_extract(NEW.data,'$.published_by') IS NOT NULL);
END;
--> statement-breakpoint
CREATE TRIGGER micro_formula_publish_valid BEFORE UPDATE ON micro_formulas
WHEN json_extract(NEW.data,'$.published_at') IS NOT NULL
BEGIN
 SELECT RAISE(ABORT, 'Cannot publish incomplete micro formula') WHERE
 NOT EXISTS (SELECT 1 FROM micro_formula_lines WHERE formula_id=NEW.id) OR
 json_extract(NEW.data,'$.total_grams') IS NOT (SELECT SUM(dose_grams) FROM micro_formula_lines WHERE formula_id=NEW.id) OR
 EXISTS (SELECT 1 FROM micro_formula_lines l JOIN micro_ingredients m ON m.id=l.micro_ingredient_id
 WHERE l.formula_id=NEW.id AND json_extract(m.data,'$.is_active') != 1);
END;
