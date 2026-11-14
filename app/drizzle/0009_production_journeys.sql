CREATE TABLE `production_journey_lines` (
	`id` text PRIMARY KEY NOT NULL,
	`data` text NOT NULL,
	`journey_id` text NOT NULL,
	`product_id` text NOT NULL,
	`formula_id` text NOT NULL,
	`micro_formula_id` text NOT NULL,
	`nuclei_hundredths` integer NOT NULL,
	`family` text NOT NULL,
	FOREIGN KEY (`journey_id`) REFERENCES `production_journeys`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`formula_id`) REFERENCES `formulas`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`micro_formula_id`) REFERENCES `micro_formulas`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "journey_nuclei_positive" CHECK("production_journey_lines"."nuclei_hundredths" BETWEEN 1 AND 1000000000000),
	CONSTRAINT "journey_family" CHECK("production_journey_lines"."family" IN ('ROSADO','VERDE_AMARILLO'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `journey_product_unique` ON `production_journey_lines` (`journey_id`,`product_id`);--> statement-breakpoint
CREATE TABLE `production_journey_links` (
	`id` text PRIMARY KEY NOT NULL,
	`data` text NOT NULL,
	`line_id` text NOT NULL,
	`preparation_id` text NOT NULL,
	`confirmation_id` text NOT NULL,
	`nuclei_hundredths` integer NOT NULL,
	`request_id` text NOT NULL,
	FOREIGN KEY (`line_id`) REFERENCES `production_journey_lines`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`preparation_id`) REFERENCES `micro_preparations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`confirmation_id`) REFERENCES `micro_confirmations`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "journey_link_positive" CHECK("production_journey_links"."nuclei_hundredths" BETWEEN 1 AND 1000000000000)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `production_journey_links_request_id_unique` ON `production_journey_links` (`request_id`);--> statement-breakpoint
CREATE TABLE `production_journeys` (
	`id` text PRIMARY KEY NOT NULL,
	`data` text NOT NULL,
	`request_id` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `production_journeys_request_id_unique` ON `production_journeys` (`request_id`);
--> statement-breakpoint
CREATE TRIGGER production_journeys_metadata BEFORE INSERT ON production_journeys BEGIN SELECT RAISE(ABORT,'Journey metadata mismatch') WHERE json_extract(NEW.data,'$.id') IS NOT NEW.id OR json_extract(NEW.data,'$.request_id') IS NOT NEW.request_id OR typeof(json_extract(NEW.data,'$.created_at')) IS NOT 'text' OR NOT EXISTS(SELECT 1 FROM users WHERE id=json_extract(NEW.data,'$.created_by') AND json_extract(data,'$.is_active')=1 AND json_extract(data,'$.role') IN ('ADMIN','OPERATOR')); END;

--> statement-breakpoint
CREATE TRIGGER production_journeys_no_update BEFORE UPDATE ON production_journeys BEGIN SELECT RAISE(ABORT,'Immutable journey history'); END;

--> statement-breakpoint
CREATE TRIGGER production_journeys_no_delete BEFORE DELETE ON production_journeys BEGIN SELECT RAISE(ABORT,'Immutable journey history'); END;

--> statement-breakpoint
CREATE TRIGGER production_journey_lines_metadata BEFORE INSERT ON production_journey_lines BEGIN SELECT RAISE(ABORT,'Journey metadata mismatch') WHERE json_extract(NEW.data,'$.id') IS NOT NEW.id OR json_extract(NEW.data,'$.journey_id') IS NOT NEW.journey_id OR json_extract(NEW.data,'$.product_id') IS NOT NEW.product_id OR json_extract(NEW.data,'$.formula_id') IS NOT NEW.formula_id OR json_extract(NEW.data,'$.micro_formula_id') IS NOT NEW.micro_formula_id OR json_extract(NEW.data,'$.nuclei_hundredths') IS NOT NEW.nuclei_hundredths OR json_extract(NEW.data,'$.family') IS NOT NEW.family OR typeof(json_extract(NEW.data,'$.created_at')) IS NOT 'text' OR NOT EXISTS(SELECT 1 FROM users WHERE id=json_extract(NEW.data,'$.created_by') AND json_extract(data,'$.is_active')=1 AND json_extract(data,'$.role') IN ('ADMIN','OPERATOR')) OR typeof(NEW.nuclei_hundredths) IS NOT 'integer'; END;

--> statement-breakpoint
CREATE TRIGGER production_journey_lines_no_update BEFORE UPDATE ON production_journey_lines BEGIN SELECT RAISE(ABORT,'Immutable journey history'); END;

--> statement-breakpoint
CREATE TRIGGER production_journey_lines_no_delete BEFORE DELETE ON production_journey_lines BEGIN SELECT RAISE(ABORT,'Immutable journey history'); END;

--> statement-breakpoint
CREATE TRIGGER production_journey_links_metadata BEFORE INSERT ON production_journey_links BEGIN SELECT RAISE(ABORT,'Journey metadata mismatch') WHERE json_extract(NEW.data,'$.id') IS NOT NEW.id OR json_extract(NEW.data,'$.line_id') IS NOT NEW.line_id OR json_extract(NEW.data,'$.preparation_id') IS NOT NEW.preparation_id OR json_extract(NEW.data,'$.confirmation_id') IS NOT NEW.confirmation_id OR json_extract(NEW.data,'$.nuclei_hundredths') IS NOT NEW.nuclei_hundredths OR json_extract(NEW.data,'$.request_id') IS NOT NEW.request_id OR typeof(json_extract(NEW.data,'$.created_at')) IS NOT 'text' OR NOT EXISTS(SELECT 1 FROM users WHERE id=json_extract(NEW.data,'$.created_by') AND json_extract(data,'$.is_active')=1 AND json_extract(data,'$.role') IN ('ADMIN','OPERATOR')) OR typeof(NEW.nuclei_hundredths) IS NOT 'integer'; END;

--> statement-breakpoint
CREATE TRIGGER production_journey_links_no_update BEFORE UPDATE ON production_journey_links BEGIN SELECT RAISE(ABORT,'Immutable journey history'); END;

--> statement-breakpoint
CREATE TRIGGER production_journey_links_no_delete BEFORE DELETE ON production_journey_links BEGIN SELECT RAISE(ABORT,'Immutable journey history'); END;

--> statement-breakpoint
CREATE TRIGGER journey_line_contract BEFORE INSERT ON production_journey_lines BEGIN
 SELECT RAISE(ABORT,'Invalid journey product or recipe') WHERE NOT EXISTS (
 SELECT 1 FROM products p JOIN formulas f ON f.id=NEW.formula_id JOIN micro_formulas m ON m.id=NEW.micro_formula_id
 WHERE p.id=NEW.product_id AND json_extract(p.data,'$.is_active')=1
 AND f.product_id=p.id AND json_extract(f.data,'$.is_active')=1
 AND m.family=NEW.family AND json_extract(m.data,'$.published_at') IS NOT NULL
 AND EXISTS(SELECT 1 FROM micro_formula_heads h WHERE h.family=NEW.family AND h.active_formula_id=m.id)
 AND ((NEW.family='ROSADO' AND json_extract(p.data,'$.name')='Potripregnant') OR
 (NEW.family='VERDE_AMARILLO' AND json_extract(p.data,'$.name') IN ('Nutrelin Adulto','Hi-Performance'))));
 SELECT RAISE(ABORT,'Unexpected mill closure') WHERE
 json_type(NEW.data,'$.actual_bags') IS NOT 'null' OR json_type(NEW.data,'$.waste_grams') IS NOT 'null' OR json_type(NEW.data,'$.final_cost_cents') IS NOT 'null';
 SELECT RAISE(ABORT,'Invalid macro snapshot') WHERE json_type(NEW.data,'$.formula_snapshot') IS NOT 'array' OR json_array_length(NEW.data,'$.formula_snapshot')=0 OR
 EXISTS(SELECT json_extract(value,'$.id'),json_extract(value,'$.ingredient_id'),json_extract(value,'$.kg_per_nucleus') FROM json_each(NEW.data,'$.formula_snapshot') EXCEPT SELECT id,ingredient_id,json_extract(data,'$.kg_per_nucleus') FROM formula_ingredients WHERE formula_id=NEW.formula_id) OR
 EXISTS(SELECT id,ingredient_id,json_extract(data,'$.kg_per_nucleus') FROM formula_ingredients WHERE formula_id=NEW.formula_id EXCEPT SELECT json_extract(value,'$.id'),json_extract(value,'$.ingredient_id'),json_extract(value,'$.kg_per_nucleus') FROM json_each(NEW.data,'$.formula_snapshot'));
 SELECT RAISE(ABORT,'Invalid micro snapshot') WHERE json_type(NEW.data,'$.micro_formula_snapshot') IS NOT 'array' OR json_array_length(NEW.data,'$.micro_formula_snapshot')=0 OR
 EXISTS(SELECT json_extract(value,'$.id'),json_extract(value,'$.micro_ingredient_id'),json_extract(value,'$.dose_grams') FROM json_each(NEW.data,'$.micro_formula_snapshot') EXCEPT SELECT id,micro_ingredient_id,dose_grams FROM micro_formula_lines WHERE formula_id=NEW.micro_formula_id) OR
 EXISTS(SELECT id,micro_ingredient_id,dose_grams FROM micro_formula_lines WHERE formula_id=NEW.micro_formula_id EXCEPT SELECT json_extract(value,'$.id'),json_extract(value,'$.micro_ingredient_id'),json_extract(value,'$.dose_grams') FROM json_each(NEW.data,'$.micro_formula_snapshot'));
END;
--> statement-breakpoint
CREATE TRIGGER journey_link_contract BEFORE INSERT ON production_journey_links BEGIN
 SELECT RAISE(ABORT,'Invalid confirmed preparation reference') WHERE NOT EXISTS(
 SELECT 1 FROM production_journey_lines l JOIN micro_preparations p ON p.id=NEW.preparation_id JOIN micro_confirmations c ON c.id=NEW.confirmation_id
 WHERE l.id=NEW.line_id AND p.family=l.family AND c.preparation_id=p.id AND c.formula_id=p.formula_id
 AND NOT EXISTS(SELECT 1 FROM micro_supersessions x WHERE x.source_id=p.id));
 SELECT RAISE(ABORT,'Preparation quantity already attributed') WHERE
 NEW.nuclei_hundredths + COALESCE((SELECT SUM(nuclei_hundredths) FROM production_journey_links WHERE preparation_id=NEW.preparation_id),0) > (SELECT nuclei_hundredths FROM micro_confirmations WHERE id=NEW.confirmation_id);
 SELECT RAISE(ABORT,'Line quantity exceeded') WHERE
 NEW.nuclei_hundredths + COALESCE((SELECT SUM(nuclei_hundredths) FROM production_journey_links WHERE line_id=NEW.line_id),0) > (SELECT nuclei_hundredths FROM production_journey_lines WHERE id=NEW.line_id);
END;
--> statement-breakpoint
CREATE TRIGGER journey_complete BEFORE UPDATE ON settings BEGIN
 SELECT RAISE(ABORT,'Incomplete journey') WHERE EXISTS(SELECT 1 FROM production_journeys j WHERE
 (SELECT count(*) FROM production_journey_lines WHERE journey_id=j.id) NOT BETWEEN 1 AND 3 OR
 NOT EXISTS(SELECT 1 FROM audit a WHERE json_extract(a.data,'$.action')='JOURNEY_CREATE' AND json_extract(a.data,'$.entity_id')=j.id AND json_extract(a.data,'$.created_by')=json_extract(j.data,'$.created_by')));
 SELECT RAISE(ABORT,'Missing journey reference audit') WHERE EXISTS(SELECT 1 FROM production_journey_links l WHERE NOT EXISTS(SELECT 1 FROM audit a WHERE json_extract(a.data,'$.action')='JOURNEY_LINK' AND json_extract(a.data,'$.entity_id')=(SELECT journey_id FROM production_journey_lines WHERE id=l.line_id) AND json_extract(a.data,'$.request_id')=l.request_id AND json_extract(a.data,'$.created_by')=json_extract(l.data,'$.created_by')));
END;

--> statement-breakpoint
CREATE TRIGGER journey_header_contract BEFORE INSERT ON production_journeys BEGIN
 SELECT RAISE(ABORT,'Invalid journey date') WHERE json_type(NEW.data,'$.date') IS NOT 'text' OR
 length(json_extract(NEW.data,'$.date'))<>10 OR json_extract(NEW.data,'$.date') NOT GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]' OR
 date(json_extract(NEW.data,'$.date'),'+0 days') IS NOT json_extract(NEW.data,'$.date');
 SELECT RAISE(ABORT,'Invalid journey timezone') WHERE json_extract(NEW.data,'$.timezone') IS NOT (SELECT json_extract(data,'$.timezone') FROM settings WHERE id='company');
END;
--> statement-breakpoint
CREATE TRIGGER journey_estimate_contract BEFORE INSERT ON production_journey_lines BEGIN
 SELECT RAISE(ABORT,'Invalid planned weight') WHERE
 typeof(json_extract(NEW.data,'$.planned_weight_grams')) IS NOT 'integer' OR
 json_extract(NEW.data,'$.planned_weight_grams') IS NOT (SELECT CAST((json_extract(data,'$.commercial_weight_per_nucleus_kg')*NEW.nuclei_hundredths+50)/100 AS INTEGER) FROM products WHERE id=NEW.product_id);
 SELECT RAISE(ABORT,'Invalid macro estimate') WHERE json_type(NEW.data,'$.macro_estimate') IS NOT 'array' OR
 json_array_length(NEW.data,'$.macro_estimate') IS NOT (SELECT count(*) FROM formula_ingredients WHERE formula_id=NEW.formula_id) OR
 EXISTS(SELECT 1 FROM json_each(NEW.data,'$.macro_estimate') e WHERE
 NOT EXISTS(SELECT 1 FROM formula_ingredients f JOIN ingredients i ON i.id=f.ingredient_id WHERE f.formula_id=NEW.formula_id
 AND f.ingredient_id=json_extract(e.value,'$.ingredient_id')
 AND json_extract(e.value,'$.grams')=CAST((json_extract(f.data,'$.kg_per_nucleus')*NEW.nuclei_hundredths+50)/100 AS INTEGER)
 AND json_extract(e.value,'$.price_cents_per_kg')=json_extract(i.data,'$.current_price_per_kg')
 AND json_extract(e.value,'$.estimated_cents')=CAST((json_extract(e.value,'$.grams')*json_extract(e.value,'$.price_cents_per_kg')+500)/1000 AS INTEGER)
 AND typeof(json_extract(e.value,'$.grams'))='integer' AND typeof(json_extract(e.value,'$.estimated_cents'))='integer'
 AND json_extract(e.value,'$.grams') BETWEEN 0 AND 1000000000000 AND json_extract(e.value,'$.estimated_cents') BETWEEN 0 AND 1000000000000)) OR
 (SELECT count(DISTINCT json_extract(value,'$.ingredient_id')) FROM json_each(NEW.data,'$.macro_estimate')) IS NOT json_array_length(NEW.data,'$.macro_estimate');
END;
