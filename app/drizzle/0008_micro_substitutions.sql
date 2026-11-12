CREATE TABLE `micro_preparation_groups` (
	`id` text PRIMARY KEY NOT NULL,
	`data` text NOT NULL,
	`preparation_id` text NOT NULL,
	`group_reference` text NOT NULL,
	FOREIGN KEY (`preparation_id`) REFERENCES `micro_preparations`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "micro_group_reference" CHECK(length(trim("micro_preparation_groups"."group_reference")) BETWEEN 1 AND 100)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `micro_preparation_groups_preparation_id_unique` ON `micro_preparation_groups` (`preparation_id`);--> statement-breakpoint
CREATE TABLE `micro_substitutions` (
	`id` text PRIMARY KEY NOT NULL,
	`data` text NOT NULL,
	`policy_id` text NOT NULL,
	`request_id` text NOT NULL,
	`rosado_formula_id` text NOT NULL,
	`verde_formula_id` text NOT NULL,
	`source_rosado_id` text NOT NULL,
	`source_verde_id` text NOT NULL,
	`from_ingredient_id` text NOT NULL,
	`to_ingredient_id` text NOT NULL,
	FOREIGN KEY (`rosado_formula_id`) REFERENCES `micro_formulas`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`verde_formula_id`) REFERENCES `micro_formulas`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`source_rosado_id`) REFERENCES `micro_formulas`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`source_verde_id`) REFERENCES `micro_formulas`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`from_ingredient_id`) REFERENCES `micro_ingredients`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`to_ingredient_id`) REFERENCES `micro_ingredients`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "micro_substitution_distinct" CHECK("micro_substitutions"."from_ingredient_id" <> "micro_substitutions"."to_ingredient_id")
);
--> statement-breakpoint
CREATE UNIQUE INDEX `micro_substitutions_policy_id_unique` ON `micro_substitutions` (`policy_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `micro_substitutions_request_id_unique` ON `micro_substitutions` (`request_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `micro_substitutions_rosado_formula_id_unique` ON `micro_substitutions` (`rosado_formula_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `micro_substitutions_verde_formula_id_unique` ON `micro_substitutions` (`verde_formula_id`);--> statement-breakpoint
CREATE TABLE `micro_supersessions` (
	`id` text PRIMARY KEY NOT NULL,
	`data` text NOT NULL,
	`source_id` text NOT NULL,
	`target_id` text NOT NULL,
	`substitution_id` text NOT NULL,
	`request_id` text NOT NULL,
	FOREIGN KEY (`source_id`) REFERENCES `micro_preparations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`target_id`) REFERENCES `micro_preparations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`substitution_id`) REFERENCES `micro_substitutions`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "micro_supersession_distinct" CHECK("micro_supersessions"."source_id" <> "micro_supersessions"."target_id")
);
--> statement-breakpoint
CREATE UNIQUE INDEX `micro_supersessions_source_id_unique` ON `micro_supersessions` (`source_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `micro_supersessions_target_id_unique` ON `micro_supersessions` (`target_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `micro_supersessions_request_id_unique` ON `micro_supersessions` (`request_id`);
--> statement-breakpoint
CREATE TRIGGER micro_substitutions_valid BEFORE INSERT ON micro_substitutions BEGIN
 SELECT RAISE(ABORT,'Substitution metadata mismatch') WHERE json_extract(NEW.data,'$.id') IS NOT NEW.id OR
 json_extract(NEW.data,'$.policy_id') IS NOT NEW.policy_id OR
 json_extract(NEW.data,'$.request_id') IS NOT NEW.request_id OR
 json_extract(NEW.data,'$.rosado_formula_id') IS NOT NEW.rosado_formula_id OR
 json_extract(NEW.data,'$.verde_formula_id') IS NOT NEW.verde_formula_id OR
 json_extract(NEW.data,'$.source_rosado_id') IS NOT NEW.source_rosado_id OR
 json_extract(NEW.data,'$.source_verde_id') IS NOT NEW.source_verde_id OR
 json_extract(NEW.data,'$.from_ingredient_id') IS NOT NEW.from_ingredient_id OR
 json_extract(NEW.data,'$.to_ingredient_id') IS NOT NEW.to_ingredient_id OR
 typeof(json_extract(NEW.data,'$.created_at')) IS NOT 'text' OR
 typeof(json_extract(NEW.data,'$.reason')) IS NOT 'text' OR
 length(trim(json_extract(NEW.data,'$.reason'))) NOT BETWEEN 1 AND 2000 OR
 NOT EXISTS(SELECT 1 FROM users WHERE id=json_extract(NEW.data,'$.created_by') AND json_extract(data,'$.role') IN ('ADMIN','OPERATOR') AND json_extract(data,'$.is_active')=1);
END;

--> statement-breakpoint
CREATE TRIGGER micro_substitutions_no_update BEFORE UPDATE ON micro_substitutions BEGIN SELECT RAISE(ABORT,'Immutable substitution history'); END;

--> statement-breakpoint
CREATE TRIGGER micro_substitutions_no_delete BEFORE DELETE ON micro_substitutions BEGIN SELECT RAISE(ABORT,'Immutable substitution history'); END;

--> statement-breakpoint
CREATE TRIGGER micro_supersessions_valid BEFORE INSERT ON micro_supersessions BEGIN
 SELECT RAISE(ABORT,'Substitution metadata mismatch') WHERE json_extract(NEW.data,'$.id') IS NOT NEW.id OR
 json_extract(NEW.data,'$.source_id') IS NOT NEW.source_id OR
 json_extract(NEW.data,'$.target_id') IS NOT NEW.target_id OR
 json_extract(NEW.data,'$.substitution_id') IS NOT NEW.substitution_id OR
 json_extract(NEW.data,'$.request_id') IS NOT NEW.request_id OR
 typeof(json_extract(NEW.data,'$.created_at')) IS NOT 'text' OR
 typeof(json_extract(NEW.data,'$.reason')) IS NOT 'text' OR
 length(trim(json_extract(NEW.data,'$.reason'))) NOT BETWEEN 1 AND 2000 OR
 NOT EXISTS(SELECT 1 FROM users WHERE id=json_extract(NEW.data,'$.created_by') AND json_extract(data,'$.role') IN ('ADMIN','OPERATOR') AND json_extract(data,'$.is_active')=1);
END;

--> statement-breakpoint
CREATE TRIGGER micro_supersessions_no_update BEFORE UPDATE ON micro_supersessions BEGIN SELECT RAISE(ABORT,'Immutable substitution history'); END;

--> statement-breakpoint
CREATE TRIGGER micro_supersessions_no_delete BEFORE DELETE ON micro_supersessions BEGIN SELECT RAISE(ABORT,'Immutable substitution history'); END;

--> statement-breakpoint
CREATE TRIGGER micro_preparation_groups_valid BEFORE INSERT ON micro_preparation_groups BEGIN
 SELECT RAISE(ABORT,'Substitution metadata mismatch') WHERE json_extract(NEW.data,'$.id') IS NOT NEW.id OR
 json_extract(NEW.data,'$.preparation_id') IS NOT NEW.preparation_id OR
 json_extract(NEW.data,'$.group_reference') IS NOT NEW.group_reference OR
 typeof(json_extract(NEW.data,'$.created_at')) IS NOT 'text' OR
 typeof(json_extract(NEW.data,'$.reason')) IS NOT 'text' OR
 length(trim(json_extract(NEW.data,'$.reason'))) NOT BETWEEN 1 AND 2000 OR
 NOT EXISTS(SELECT 1 FROM users WHERE id=json_extract(NEW.data,'$.created_by') AND json_extract(data,'$.role') IN ('ADMIN','OPERATOR') AND json_extract(data,'$.is_active')=1);
END;

--> statement-breakpoint
CREATE TRIGGER micro_preparation_groups_no_update BEFORE UPDATE ON micro_preparation_groups BEGIN SELECT RAISE(ABORT,'Immutable substitution history'); END;

--> statement-breakpoint
CREATE TRIGGER micro_preparation_groups_no_delete BEFORE DELETE ON micro_preparation_groups BEGIN SELECT RAISE(ABORT,'Immutable substitution history'); END;

--> statement-breakpoint
CREATE TRIGGER micro_supersession_contract BEFORE INSERT ON micro_supersessions BEGIN
 SELECT RAISE(ABORT,'Supersession requires explicit pending successor') WHERE json_extract(NEW.data,'$.consent') IS NOT 1 OR
 NOT EXISTS(SELECT 1 FROM micro_preparations a JOIN micro_preparations b ON b.id=NEW.target_id JOIN micro_substitutions e ON e.id=NEW.substitution_id
 WHERE a.id=NEW.source_id AND a.family=b.family AND a.nuclei_hundredths=b.nuclei_hundredths AND a.formula_id<>b.formula_id
 AND json_extract(a.data,'$.date')=json_extract(b.data,'$.date')
 AND b.request_id=NEW.request_id
 AND json_extract(b.data,'$.created_by')=json_extract(NEW.data,'$.created_by')
 AND json_extract(b.data,'$.created_at')=json_extract(NEW.data,'$.created_at')
 AND NOT EXISTS(SELECT 1 FROM micro_assignments WHERE preparation_id=b.id)
 AND a.formula_id=CASE a.family WHEN 'ROSADO' THEN e.source_rosado_id ELSE e.source_verde_id END
 AND b.formula_id=CASE b.family WHEN 'ROSADO' THEN e.rosado_formula_id ELSE e.verde_formula_id END
 AND json_extract(NEW.data,'$.approval_reference')=json_extract(e.data,'$.approval_reference')
 AND NOT EXISTS(SELECT 1 FROM micro_confirmations WHERE preparation_id IN (a.id,b.id))
 AND NOT EXISTS(SELECT 1 FROM micro_supersessions WHERE source_id=b.id)
 AND NOT EXISTS(SELECT 1 FROM micro_assignments x WHERE x.preparation_id=a.id AND NOT EXISTS(SELECT 1 FROM micro_assignment_reversals r WHERE r.assignment_id=x.id)));
END;
--> statement-breakpoint
CREATE TRIGGER micro_assignment_superseded BEFORE INSERT ON micro_assignments BEGIN
 SELECT RAISE(ABORT,'Preparation superseded') WHERE EXISTS(SELECT 1 FROM micro_supersessions WHERE source_id=NEW.preparation_id);
END;
--> statement-breakpoint
CREATE TRIGGER micro_confirmation_superseded BEFORE INSERT ON micro_confirmations BEGIN
 SELECT RAISE(ABORT,'Preparation superseded') WHERE EXISTS(SELECT 1 FROM micro_supersessions WHERE source_id=NEW.preparation_id);
END;
--> statement-breakpoint
CREATE TRIGGER micro_substitution_contract BEFORE INSERT ON micro_substitutions BEGIN
 SELECT RAISE(ABORT,'Invalid substitution approval') WHERE
 typeof(json_extract(NEW.data,'$.approval_reference')) IS NOT 'text' OR length(trim(json_extract(NEW.data,'$.approval_reference'))) NOT BETWEEN 1 AND 100 OR
 NOT EXISTS(SELECT 1 FROM micro_ingredients WHERE id=NEW.from_ingredient_id AND json_extract(data,'$.is_active')=1) OR
 NOT EXISTS(SELECT 1 FROM micro_ingredients WHERE id=NEW.to_ingredient_id AND json_extract(data,'$.is_active')=1);
 SELECT RAISE(ABORT,'Both future families required') WHERE
 NOT EXISTS(SELECT 1 FROM micro_formulas a JOIN micro_formulas b ON b.id=NEW.rosado_formula_id JOIN micro_formula_heads h ON h.active_formula_id=b.id
 WHERE a.id=NEW.source_rosado_id AND a.family='ROSADO' AND b.family=a.family AND b.version>a.version AND json_extract(a.data,'$.published_at') IS NOT NULL AND json_extract(b.data,'$.published_at') IS NOT NULL) OR
 NOT EXISTS(SELECT 1 FROM micro_formulas a JOIN micro_formulas b ON b.id=NEW.verde_formula_id JOIN micro_formula_heads h ON h.active_formula_id=b.id
 WHERE a.id=NEW.source_verde_id AND a.family='VERDE_AMARILLO' AND b.family=a.family AND b.version>a.version AND json_extract(a.data,'$.published_at') IS NOT NULL AND json_extract(b.data,'$.published_at') IS NOT NULL);
END;
--> statement-breakpoint
CREATE TRIGGER micro_substitution_complete BEFORE UPDATE ON settings BEGIN
 SELECT RAISE(ABORT,'Missing substitution audit') WHERE EXISTS(SELECT 1 FROM micro_substitutions e WHERE NOT EXISTS(SELECT 1 FROM audit WHERE json_extract(data,'$.action')='MICRO_SUBSTITUTE' AND json_extract(data,'$.entity_id')=e.id AND json_extract(data,'$.created_by')=json_extract(e.data,'$.created_by')));
 SELECT RAISE(ABORT,'Missing adoption audit') WHERE EXISTS(SELECT 1 FROM micro_supersessions e WHERE NOT EXISTS(SELECT 1 FROM audit WHERE json_extract(data,'$.action')='MICRO_ADOPT' AND json_extract(data,'$.entity_id')=e.id AND json_extract(data,'$.created_by')=json_extract(e.data,'$.created_by')));
END;

--> statement-breakpoint
CREATE TRIGGER micro_substitution_recipes BEFORE INSERT ON micro_substitutions BEGIN
 SELECT RAISE(ABORT,'Substitution recipe identity mismatch') WHERE
 NOT EXISTS(SELECT 1 FROM micro_formula_lines WHERE formula_id=NEW.source_rosado_id AND micro_ingredient_id=NEW.from_ingredient_id) OR
 EXISTS(SELECT 1 FROM micro_formula_lines WHERE formula_id=NEW.source_rosado_id AND micro_ingredient_id=NEW.to_ingredient_id) OR
 EXISTS(SELECT 1 FROM micro_formula_lines WHERE formula_id=NEW.rosado_formula_id AND micro_ingredient_id=NEW.from_ingredient_id) OR
 NOT EXISTS(SELECT 1 FROM micro_formula_lines WHERE formula_id=NEW.rosado_formula_id AND micro_ingredient_id=NEW.to_ingredient_id) OR
 EXISTS(SELECT micro_ingredient_id,dose_grams FROM micro_formula_lines WHERE formula_id=NEW.source_rosado_id AND micro_ingredient_id<>NEW.from_ingredient_id EXCEPT SELECT micro_ingredient_id,dose_grams FROM micro_formula_lines WHERE formula_id=NEW.rosado_formula_id AND micro_ingredient_id<>NEW.to_ingredient_id) OR
 EXISTS(SELECT micro_ingredient_id,dose_grams FROM micro_formula_lines WHERE formula_id=NEW.rosado_formula_id AND micro_ingredient_id<>NEW.to_ingredient_id EXCEPT SELECT micro_ingredient_id,dose_grams FROM micro_formula_lines WHERE formula_id=NEW.source_rosado_id AND micro_ingredient_id<>NEW.from_ingredient_id);
 SELECT RAISE(ABORT,'Substitution recipe identity mismatch') WHERE
 NOT EXISTS(SELECT 1 FROM micro_formula_lines WHERE formula_id=NEW.source_verde_id AND micro_ingredient_id=NEW.from_ingredient_id) OR
 EXISTS(SELECT 1 FROM micro_formula_lines WHERE formula_id=NEW.source_verde_id AND micro_ingredient_id=NEW.to_ingredient_id) OR
 EXISTS(SELECT 1 FROM micro_formula_lines WHERE formula_id=NEW.verde_formula_id AND micro_ingredient_id=NEW.from_ingredient_id) OR
 NOT EXISTS(SELECT 1 FROM micro_formula_lines WHERE formula_id=NEW.verde_formula_id AND micro_ingredient_id=NEW.to_ingredient_id) OR
 EXISTS(SELECT micro_ingredient_id,dose_grams FROM micro_formula_lines WHERE formula_id=NEW.source_verde_id AND micro_ingredient_id<>NEW.from_ingredient_id EXCEPT SELECT micro_ingredient_id,dose_grams FROM micro_formula_lines WHERE formula_id=NEW.verde_formula_id AND micro_ingredient_id<>NEW.to_ingredient_id) OR
 EXISTS(SELECT micro_ingredient_id,dose_grams FROM micro_formula_lines WHERE formula_id=NEW.verde_formula_id AND micro_ingredient_id<>NEW.to_ingredient_id EXCEPT SELECT micro_ingredient_id,dose_grams FROM micro_formula_lines WHERE formula_id=NEW.source_verde_id AND micro_ingredient_id<>NEW.from_ingredient_id);
END;
