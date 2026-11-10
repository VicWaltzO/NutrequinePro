CREATE TABLE `micro_confirmations` (
	`id` text PRIMARY KEY NOT NULL,
	`data` text NOT NULL,
	`preparation_id` text NOT NULL,
	`assignment_id` text NOT NULL,
	`formula_id` text NOT NULL,
	`request_id` text NOT NULL,
	`nuclei_hundredths` integer NOT NULL,
	FOREIGN KEY (`preparation_id`) REFERENCES `micro_preparations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`assignment_id`) REFERENCES `micro_assignments`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`formula_id`) REFERENCES `micro_formulas`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "micro_confirmation_quantity" CHECK(typeof("micro_confirmations"."nuclei_hundredths") = 'integer' AND "micro_confirmations"."nuclei_hundredths" > 0 AND "micro_confirmations"."nuclei_hundredths" <= 1000000000)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `micro_confirmations_preparation_id_unique` ON `micro_confirmations` (`preparation_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `micro_confirmations_assignment_id_unique` ON `micro_confirmations` (`assignment_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `micro_confirmations_request_id_unique` ON `micro_confirmations` (`request_id`);--> statement-breakpoint
CREATE TABLE `micro_issues` (
	`id` text PRIMARY KEY NOT NULL,
	`data` text NOT NULL,
	`confirmation_id` text NOT NULL,
	`assignment_line_id` text NOT NULL,
	`formula_line_id` text NOT NULL,
	`micro_ingredient_id` text NOT NULL,
	`ledger_id` text NOT NULL,
	`request_id` text NOT NULL,
	`revision` integer NOT NULL,
	`quantity_hundredths` integer NOT NULL,
	FOREIGN KEY (`confirmation_id`) REFERENCES `micro_confirmations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`assignment_line_id`) REFERENCES `micro_assignment_lines`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`formula_line_id`) REFERENCES `micro_formula_lines`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`micro_ingredient_id`) REFERENCES `micro_ingredients`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`ledger_id`) REFERENCES `micro_ledgers`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "micro_issue_quantity" CHECK(typeof("micro_issues"."quantity_hundredths") = 'integer' AND "micro_issues"."quantity_hundredths" > 0 AND "micro_issues"."quantity_hundredths" <= 100000000000000)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `micro_issues_assignment_line_id_unique` ON `micro_issues` (`assignment_line_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `micro_issue_identity` ON `micro_issues` (`confirmation_id`,`micro_ingredient_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `micro_issue_ledger_revision` ON `micro_issues` (`ledger_id`,`revision`);--> statement-breakpoint
CREATE UNIQUE INDEX `micro_issue_ledger_request` ON `micro_issues` (`ledger_id`,`request_id`);
--> statement-breakpoint
DROP TRIGGER micro_assignment_line_valid;
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
 AND NOT EXISTS(SELECT 1 FROM micro_assignment_reversals r WHERE r.assignment_id=a.id) AND NOT EXISTS(SELECT 1 FROM micro_confirmations c WHERE c.preparation_id=a.preparation_id));
 SELECT RAISE(ABORT, 'Insufficient free micro stock') WHERE NEW.quantity_hundredths + COALESCE((
 SELECT SUM(l.quantity_hundredths) FROM micro_assignment_lines l
 WHERE l.micro_ingredient_id=NEW.micro_ingredient_id
 AND NOT EXISTS(SELECT 1 FROM micro_assignment_reversals r WHERE r.assignment_id=l.assignment_id) AND NOT EXISTS(SELECT 1 FROM micro_confirmations c WHERE c.assignment_id=l.assignment_id)),0)
 > COALESCE((SELECT COALESCE(json_extract(data,'$.ledger.quantity_hundredths'), 100 * json_extract(data,'$.ledger.quantity_grams')) FROM micro_ledgers
 WHERE micro_ingredient_id=NEW.micro_ingredient_id AND json_array_length(data,'$.ledger.events')>0),
 (SELECT 100 * json_extract(data,'$.quantity_grams') FROM micro_openings WHERE micro_ingredient_id=NEW.micro_ingredient_id),0);
END;

--> statement-breakpoint
DROP TRIGGER micro_opening_assignment_floor;
--> statement-breakpoint
CREATE TRIGGER micro_opening_assignment_floor BEFORE UPDATE ON micro_openings
BEGIN
 SELECT RAISE(ABORT, 'Opening below assigned stock') WHERE
 json_extract(NEW.data,'$.quantity_grams') * 100 < COALESCE((
 SELECT SUM(l.quantity_hundredths) FROM micro_assignment_lines l
 WHERE l.micro_ingredient_id=NEW.micro_ingredient_id
 AND NOT EXISTS(SELECT 1 FROM micro_assignment_reversals r WHERE r.assignment_id=l.assignment_id) AND NOT EXISTS(SELECT 1 FROM micro_confirmations c WHERE c.assignment_id=l.assignment_id)),0);
END;


--> statement-breakpoint

CREATE TRIGGER micro_confirmation_valid BEFORE INSERT ON micro_confirmations BEGIN
 SELECT RAISE(ABORT,'Confirmation metadata mismatch') WHERE
 json_extract(NEW.data,'$.id') IS NOT NEW.id OR
 json_extract(NEW.data,'$.preparation_id') IS NOT NEW.preparation_id OR
 json_extract(NEW.data,'$.assignment_id') IS NOT NEW.assignment_id OR
 json_extract(NEW.data,'$.formula_id') IS NOT NEW.formula_id OR
 json_extract(NEW.data,'$.request_id') IS NOT NEW.request_id OR
 json_extract(NEW.data,'$.nuclei_hundredths') IS NOT NEW.nuclei_hundredths OR
 length(NEW.request_id) NOT BETWEEN 1 AND 100 OR
 typeof(json_extract(NEW.data,'$.created_at')) IS NOT 'text' OR
 date(json_extract(NEW.data,'$.date'),'+0 days') IS NOT json_extract(NEW.data,'$.date') OR
 typeof(json_extract(NEW.data,'$.authorization_reference')) IS NOT 'text' OR
 length(trim(json_extract(NEW.data,'$.authorization_reference'))) NOT BETWEEN 1 AND 2000 OR
 NOT EXISTS(SELECT 1 FROM users WHERE id=json_extract(NEW.data,'$.created_by') AND json_extract(data,'$.role') IN ('ADMIN','OPERATOR') AND json_extract(data,'$.is_active')=1);
 SELECT RAISE(ABORT,'Confirmation requires active complete historical assignment') WHERE NOT EXISTS (
 SELECT 1 FROM micro_assignments a JOIN micro_preparations p ON p.id=a.preparation_id
 WHERE a.id=NEW.assignment_id AND p.id=NEW.preparation_id AND p.formula_id=NEW.formula_id AND NEW.nuclei_hundredths<=p.nuclei_hundredths
 AND NOT EXISTS(SELECT 1 FROM micro_assignment_reversals r WHERE r.assignment_id=a.id)
 AND (SELECT count(*) FROM micro_assignment_lines WHERE assignment_id=a.id)>0
 AND (SELECT count(*) FROM micro_assignment_lines WHERE assignment_id=a.id)=(SELECT count(*) FROM micro_formula_lines WHERE formula_id=p.formula_id));
END;
--> statement-breakpoint
CREATE TRIGGER micro_assignment_closed BEFORE INSERT ON micro_assignments BEGIN
 SELECT RAISE(ABORT,'Preparation permanently closed') WHERE EXISTS(SELECT 1 FROM micro_confirmations WHERE preparation_id=NEW.preparation_id);
END;
--> statement-breakpoint
CREATE TRIGGER micro_reversal_consumed BEFORE INSERT ON micro_assignment_reversals BEGIN
 SELECT RAISE(ABORT,'Consumed assignment cannot be reversed') WHERE EXISTS(SELECT 1 FROM micro_confirmations WHERE assignment_id=NEW.assignment_id);
END;
--> statement-breakpoint
CREATE TRIGGER micro_issue_valid BEFORE INSERT ON micro_issues BEGIN
 SELECT RAISE(ABORT,'Issue metadata mismatch') WHERE
 json_extract(NEW.data,'$.id') IS NOT NEW.id OR
 json_extract(NEW.data,'$.confirmation_id') IS NOT NEW.confirmation_id OR
 json_extract(NEW.data,'$.assignment_line_id') IS NOT NEW.assignment_line_id OR
 json_extract(NEW.data,'$.formula_line_id') IS NOT NEW.formula_line_id OR
 json_extract(NEW.data,'$.micro_ingredient_id') IS NOT NEW.micro_ingredient_id OR
 json_extract(NEW.data,'$.ledger_id') IS NOT NEW.ledger_id OR
 json_extract(NEW.data,'$.request_id') IS NOT NEW.request_id OR
 json_extract(NEW.data,'$.revision') IS NOT NEW.revision OR
 json_extract(NEW.data,'$.quantity_hundredths') IS NOT NEW.quantity_hundredths;
 SELECT RAISE(ABORT,'Issue requires exact historical line, quantity and ledger event') WHERE NOT EXISTS (
 SELECT 1 FROM micro_confirmations c JOIN micro_assignment_lines a ON a.assignment_id=c.assignment_id
 JOIN micro_formula_lines f ON f.id=a.formula_line_id JOIN micro_ledgers l ON l.micro_ingredient_id=a.micro_ingredient_id
 WHERE c.id=NEW.confirmation_id AND a.id=NEW.assignment_line_id AND f.id=NEW.formula_line_id AND a.micro_ingredient_id=NEW.micro_ingredient_id AND l.id=NEW.ledger_id
 AND f.dose_grams*c.nuclei_hundredths=NEW.quantity_hundredths AND c.request_id=NEW.request_id
 AND json_extract(NEW.data,'$.released_hundredths')=a.quantity_hundredths-NEW.quantity_hundredths
 AND json_extract(NEW.data,'$.created_by')=json_extract(c.data,'$.created_by')
 AND EXISTS(SELECT 1 FROM json_each(l.data,'$.ledger.events') e WHERE json_extract(e.value,'$.revision')=NEW.revision AND json(e.value)=json_extract(NEW.data,'$.event')
 AND json_extract(e.value,'$.input.type')='ISSUE' AND json_extract(e.value,'$.input.id')=NEW.id
 AND json_extract(e.value,'$.input.request_id')=NEW.request_id AND json_extract(e.value,'$.input.quantity_hundredths')=NEW.quantity_hundredths
 AND json_extract(e.value,'$.actor_id')=json_extract(c.data,'$.created_by') AND json_extract(e.value,'$.input.date')=json_extract(c.data,'$.date')));
 SELECT RAISE(ABORT,'Ledger revision/request already received') WHERE EXISTS(SELECT 1 FROM micro_valuation_events WHERE ledger_id=NEW.ledger_id AND (revision=NEW.revision OR request_id=NEW.request_id));
END;
--> statement-breakpoint
CREATE TRIGGER micro_receipt_issue_identity BEFORE INSERT ON micro_valuation_events BEGIN
 SELECT RAISE(ABORT,'Ledger revision/request already issued') WHERE EXISTS(SELECT 1 FROM micro_issues WHERE ledger_id=NEW.ledger_id AND (revision=NEW.revision OR request_id=NEW.request_id));
END;
--> statement-breakpoint
CREATE TRIGGER micro_opening_after_event BEFORE UPDATE ON micro_openings BEGIN
 SELECT RAISE(ABORT,'Opening with accepted events is immutable') WHERE EXISTS(SELECT 1 FROM micro_ledgers WHERE opening_id=OLD.id AND json_array_length(data,'$.ledger.events')>0);
END;
--> statement-breakpoint
CREATE TRIGGER micro_ledger_history BEFORE UPDATE ON micro_ledgers BEGIN
 SELECT RAISE(ABORT,'Ledger history cannot change') WHERE NEW.micro_ingredient_id IS NOT OLD.micro_ingredient_id OR NEW.opening_id IS NOT OLD.opening_id
 OR json_extract(NEW.data,'$.ledger.opening') IS NOT json_extract(OLD.data,'$.ledger.opening')
 OR json_array_length(NEW.data,'$.ledger.events')<=json_array_length(OLD.data,'$.ledger.events')
 OR EXISTS(SELECT 1 FROM json_each(OLD.data,'$.ledger.events') e WHERE json_extract(NEW.data,'$.ledger.events['||e.key||']') IS NOT json(e.value));
END;
--> statement-breakpoint
CREATE TRIGGER micro_confirmation_complete BEFORE UPDATE ON settings BEGIN
 SELECT RAISE(ABORT,'Incomplete confirmation') WHERE EXISTS(
 SELECT 1 FROM micro_confirmations c WHERE
 (SELECT count(*) FROM micro_issues WHERE confirmation_id=c.id)<>(SELECT count(*) FROM micro_assignment_lines WHERE assignment_id=c.assignment_id)
 OR NOT EXISTS(SELECT 1 FROM audit WHERE json_extract(data,'$.action')='MICRO_PREPARATION_CONFIRM' AND json_extract(data,'$.entity_id')=c.id AND json_extract(data,'$.created_by')=json_extract(c.data,'$.created_by')));
 SELECT RAISE(ABORT,'Micro stock below active commitments') WHERE EXISTS(
 SELECT 1 FROM micro_ingredients m WHERE COALESCE((SELECT COALESCE(json_extract(data,'$.ledger.quantity_hundredths'),100*json_extract(data,'$.ledger.quantity_grams')) FROM micro_ledgers WHERE micro_ingredient_id=m.id AND json_array_length(data,'$.ledger.events')>0),
 (SELECT 100*json_extract(data,'$.quantity_grams') FROM micro_openings WHERE micro_ingredient_id=m.id),0)
 < COALESCE((SELECT sum(a.quantity_hundredths) FROM micro_assignment_lines a WHERE a.micro_ingredient_id=m.id
 AND NOT EXISTS(SELECT 1 FROM micro_assignment_reversals r WHERE r.assignment_id=a.assignment_id)
 AND NOT EXISTS(SELECT 1 FROM micro_confirmations c WHERE c.assignment_id=a.assignment_id)),0));
END;

--> statement-breakpoint
CREATE TRIGGER micro_confirmations_no_update BEFORE UPDATE ON micro_confirmations BEGIN SELECT RAISE(ABORT,'Immutable micro history'); END;

--> statement-breakpoint
CREATE TRIGGER micro_confirmations_no_delete BEFORE DELETE ON micro_confirmations BEGIN SELECT RAISE(ABORT,'Immutable micro history'); END;

--> statement-breakpoint
CREATE TRIGGER micro_issues_no_update BEFORE UPDATE ON micro_issues BEGIN SELECT RAISE(ABORT,'Immutable micro history'); END;

--> statement-breakpoint
CREATE TRIGGER micro_issues_no_delete BEFORE DELETE ON micro_issues BEGIN SELECT RAISE(ABORT,'Immutable micro history'); END;

--> statement-breakpoint
CREATE TRIGGER micro_valuation_events_no_update BEFORE UPDATE ON micro_valuation_events BEGIN SELECT RAISE(ABORT,'Immutable micro history'); END;

--> statement-breakpoint
CREATE TRIGGER micro_valuation_events_no_delete BEFORE DELETE ON micro_valuation_events BEGIN SELECT RAISE(ABORT,'Immutable micro history'); END;

--> statement-breakpoint
CREATE TRIGGER micro_ledgers_no_delete BEFORE DELETE ON micro_ledgers BEGIN SELECT RAISE(ABORT,'Immutable ledger history'); END;

--> statement-breakpoint
CREATE TRIGGER micro_ledger_scale_insert BEFORE INSERT ON micro_ledgers BEGIN
 SELECT RAISE(ABORT,'Invalid exact ledger balance') WHERE
 json_extract(NEW.data,'$.ledger.contract_version') NOT IN (1,2) OR
 (json_extract(NEW.data,'$.ledger.contract_version')=2 AND (typeof(json_extract(NEW.data,'$.ledger.quantity_hundredths')) IS NOT 'integer' OR json_extract(NEW.data,'$.ledger.quantity_hundredths') NOT BETWEEN 0 AND 100000000000000 OR json_extract(NEW.data,'$.ledger.quantity_grams') IS NOT json_extract(NEW.data,'$.ledger.quantity_hundredths')/100.0)) OR
 COALESCE(json_extract(NEW.data,'$.ledger.quantity_hundredths'),100*json_extract(NEW.data,'$.ledger.quantity_grams')) IS NOT
 100*json_extract(NEW.data,'$.ledger.opening.quantity_grams') + COALESCE((SELECT sum(CASE WHEN json_extract(e.value,'$.input.type')='RECEIPT' THEN 100*json_extract(e.value,'$.input.quantity_grams') ELSE -COALESCE(json_extract(e.value,'$.input.quantity_hundredths'),100*json_extract(e.value,'$.input.quantity_grams')) END) FROM json_each(NEW.data,'$.ledger.events') e),0);
END;

--> statement-breakpoint
CREATE TRIGGER micro_ledger_scale_update BEFORE UPDATE ON micro_ledgers BEGIN
 SELECT RAISE(ABORT,'Invalid exact ledger balance') WHERE
 json_extract(NEW.data,'$.ledger.contract_version') NOT IN (1,2) OR
 (json_extract(NEW.data,'$.ledger.contract_version')=2 AND (typeof(json_extract(NEW.data,'$.ledger.quantity_hundredths')) IS NOT 'integer' OR json_extract(NEW.data,'$.ledger.quantity_hundredths') NOT BETWEEN 0 AND 100000000000000 OR json_extract(NEW.data,'$.ledger.quantity_grams') IS NOT json_extract(NEW.data,'$.ledger.quantity_hundredths')/100.0)) OR
 COALESCE(json_extract(NEW.data,'$.ledger.quantity_hundredths'),100*json_extract(NEW.data,'$.ledger.quantity_grams')) IS NOT
 100*json_extract(NEW.data,'$.ledger.opening.quantity_grams') + COALESCE((SELECT sum(CASE WHEN json_extract(e.value,'$.input.type')='RECEIPT' THEN 100*json_extract(e.value,'$.input.quantity_grams') ELSE -COALESCE(json_extract(e.value,'$.input.quantity_hundredths'),100*json_extract(e.value,'$.input.quantity_grams')) END) FROM json_each(NEW.data,'$.ledger.events') e),0);
END;
