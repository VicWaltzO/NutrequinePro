CREATE TABLE `mill_closures` (
	`id` text PRIMARY KEY NOT NULL,
	`data` text NOT NULL,
	`journey_id` text NOT NULL,
	`line_id` text NOT NULL,
	`product_id` text NOT NULL,
	`request_id` text NOT NULL,
	`actual_bags` integer NOT NULL,
	`waste_grams` integer NOT NULL,
	`movement_id` text,
	FOREIGN KEY (`journey_id`) REFERENCES `production_journeys`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`line_id`) REFERENCES `production_journey_lines`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`movement_id`) REFERENCES `inventory_movements`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "mill_bags_integer" CHECK(typeof("mill_closures"."actual_bags") = 'integer' AND "mill_closures"."actual_bags" BETWEEN 0 AND 1000000000000),
	CONSTRAINT "mill_waste_integer" CHECK(typeof("mill_closures"."waste_grams") = 'integer' AND "mill_closures"."waste_grams" BETWEEN 0 AND 1000000000000)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `mill_closures_line_id_unique` ON `mill_closures` (`line_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `mill_closures_request_id_unique` ON `mill_closures` (`request_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `mill_closures_movement_id_unique` ON `mill_closures` (`movement_id`);
--> statement-breakpoint
CREATE TRIGGER mill_closure_metadata BEFORE INSERT ON mill_closures BEGIN
SELECT RAISE(ABORT,'Mill metadata mismatch') WHERE json_extract(NEW.data,'$.id') IS NOT NEW.id OR json_extract(NEW.data,'$.journey_id') IS NOT NEW.journey_id OR json_extract(NEW.data,'$.line_id') IS NOT NEW.line_id OR json_extract(NEW.data,'$.product_id') IS NOT NEW.product_id OR json_extract(NEW.data,'$.request_id') IS NOT NEW.request_id OR json_extract(NEW.data,'$.actual_bags') IS NOT NEW.actual_bags OR json_extract(NEW.data,'$.waste_grams') IS NOT NEW.waste_grams OR json_extract(NEW.data,'$.movement_id') IS NOT NEW.movement_id
 OR typeof(json_extract(NEW.data,'$.created_at')) IS NOT 'text'
 OR NOT EXISTS(SELECT 1 FROM users WHERE id=json_extract(NEW.data,'$.created_by') AND json_extract(data,'$.is_active')=1 AND json_extract(data,'$.role') IN ('ADMIN','OPERATOR'));
SELECT RAISE(ABORT,'Invalid mill closure') WHERE
 json_type(NEW.data,'$.lot_complete') IS NOT 'true' OR json_type(NEW.data,'$.formula_consent') NOT IN ('true','false')
 OR json_type(NEW.data,'$.formula_mismatch') NOT IN ('true','false') OR json_type(NEW.data,'$.final_cost_cents') IS NOT 'null'
 OR json_extract(NEW.data,'$.unit_weight_grams') IS NOT 25000
 OR json_type(NEW.data,'$.date') IS NOT 'text' OR length(json_extract(NEW.data,'$.date'))<>10
 OR date(json_extract(NEW.data,'$.date'),'+0 days') IS NOT json_extract(NEW.data,'$.date');
END;

--> statement-breakpoint
CREATE TRIGGER mill_closure_contract BEFORE INSERT ON mill_closures BEGIN
SELECT RAISE(ABORT,'Invalid complete mill lot') WHERE NOT EXISTS(
 SELECT 1 FROM production_journey_lines l JOIN production_journeys j ON j.id=l.journey_id JOIN products p ON p.id=l.product_id
 WHERE l.id=NEW.line_id AND l.journey_id=NEW.journey_id AND l.product_id=NEW.product_id
 AND json_extract(p.data,'$.is_active')=1 AND COALESCE(json_extract(p.data,'$.presentation_unit'),'BAG')='BAG'
 AND COALESCE(json_extract(p.data,'$.unit_weight_grams'),json_extract(p.data,'$.standard_bag_weight_kg'),25000)=25000
 AND json_extract(NEW.data,'$.date')>=json_extract(j.data,'$.date')
 AND (SELECT sum(nuclei_hundredths) FROM production_journey_links WHERE line_id=l.id)=l.nuclei_hundredths
 AND json_extract(NEW.data,'$.theoretical_weight_grams') IS json_extract(l.data,'$.planned_weight_grams')
 AND NEW.actual_bags*25000+NEW.waste_grams=json_extract(l.data,'$.planned_weight_grams')
 AND (NEW.actual_bags>0 OR json_extract(l.data,'$.planned_weight_grams')<25000));
SELECT RAISE(ABORT,'Invalid confirmation date or formula consent') WHERE
 EXISTS(SELECT 1 FROM production_journey_links k JOIN micro_confirmations c ON c.id=k.confirmation_id WHERE k.line_id=NEW.line_id AND json_extract(c.data,'$.date')>json_extract(NEW.data,'$.date'))
 OR json_extract(NEW.data,'$.formula_mismatch') IS NOT EXISTS(SELECT 1 FROM production_journey_links k JOIN micro_confirmations c ON c.id=k.confirmation_id JOIN production_journey_lines l ON l.id=k.line_id WHERE l.id=NEW.line_id AND c.formula_id<>l.micro_formula_id)
 OR (json_extract(NEW.data,'$.formula_mismatch')=1 AND json_type(NEW.data,'$.formula_consent') IS NOT 'true');
END;

--> statement-breakpoint
CREATE TRIGGER mill_closure_no_update BEFORE UPDATE ON mill_closures BEGIN
SELECT RAISE(ABORT,'Immutable mill closure');
END;

--> statement-breakpoint
CREATE TRIGGER mill_closure_no_delete BEFORE DELETE ON mill_closures BEGIN
SELECT RAISE(ABORT,'Immutable mill closure');
END;

--> statement-breakpoint
CREATE TRIGGER mill_no_late_link BEFORE INSERT ON production_journey_links BEGIN
SELECT RAISE(ABORT,'Mill lot already closed') WHERE EXISTS(SELECT 1 FROM mill_closures WHERE line_id=NEW.line_id);
END;

--> statement-breakpoint
CREATE TRIGGER mill_movement_no_update BEFORE UPDATE ON inventory_movements BEGIN
SELECT RAISE(ABORT,'Immutable mill movement') WHERE json_extract(OLD.data,'$.source_type')='MILL_CLOSURE';
END;

--> statement-breakpoint
CREATE TRIGGER mill_movement_no_delete BEFORE DELETE ON inventory_movements BEGIN
SELECT RAISE(ABORT,'Immutable mill movement') WHERE json_extract(OLD.data,'$.source_type')='MILL_CLOSURE';
END;

--> statement-breakpoint
CREATE TRIGGER mill_no_extra_movement BEFORE INSERT ON inventory_movements BEGIN
SELECT RAISE(ABORT,'Mill lot already closed') WHERE json_extract(NEW.data,'$.source_type')='MILL_CLOSURE' AND EXISTS(SELECT 1 FROM mill_closures WHERE id=json_extract(NEW.data,'$.source_id'));
END;

--> statement-breakpoint
CREATE TRIGGER mill_complete BEFORE UPDATE ON settings BEGIN
SELECT RAISE(ABORT,'Missing mill audit') WHERE EXISTS(SELECT 1 FROM mill_closures c WHERE NOT EXISTS(SELECT 1 FROM audit a WHERE json_extract(a.data,'$.action')='MILL_CLOSE' AND json_extract(a.data,'$.entity_id')=c.id AND json_extract(a.data,'$.request_id')=c.request_id AND json_extract(a.data,'$.created_by')=json_extract(c.data,'$.created_by')));
SELECT RAISE(ABORT,'Invalid mill inventory entry') WHERE EXISTS(SELECT 1 FROM mill_closures c WHERE
 (SELECT count(*) FROM inventory_movements m WHERE json_extract(m.data,'$.source_type')='MILL_CLOSURE' AND json_extract(m.data,'$.source_id')=c.id AND json_extract(m.data,'$.item_type')='PRODUCT') <> CASE WHEN c.actual_bags>0 THEN 1 ELSE 0 END
 OR (c.actual_bags=0 AND c.movement_id IS NOT NULL)
 OR (c.actual_bags>0 AND NOT EXISTS(SELECT 1 FROM inventory_movements m WHERE m.id=c.movement_id AND json_extract(m.data,'$.source_type')='MILL_CLOSURE' AND json_extract(m.data,'$.source_id')=c.id AND json_extract(m.data,'$.item_type')='PRODUCT' AND json_extract(m.data,'$.item_id')=c.product_id AND json_extract(m.data,'$.movement_type')='PRODUCTION_IN' AND json_extract(m.data,'$.quantity')=c.actual_bags AND json_extract(m.data,'$.weight_kg')=c.actual_bags*25000 AND json_extract(m.data,'$.date')=json_extract(c.data,'$.date') AND json_extract(m.data,'$.created_by')=json_extract(c.data,'$.created_by'))));
SELECT RAISE(ABORT,'Invalid mill macro consumption') WHERE EXISTS(SELECT 1 FROM mill_closures c JOIN production_journey_lines l ON l.id=c.line_id WHERE
 (SELECT count(*) FROM inventory_movements m WHERE json_extract(m.data,'$.source_type')='MILL_CLOSURE' AND json_extract(m.data,'$.source_id')=c.id AND json_extract(m.data,'$.item_type')='INGREDIENT')<>(SELECT count(*) FROM json_each(l.data,'$.macro_estimate') e WHERE json_extract(e.value,'$.grams')>0)
 OR EXISTS(SELECT 1 FROM json_each(l.data,'$.macro_estimate') e WHERE json_extract(e.value,'$.grams')>0 AND (SELECT count(*) FROM inventory_movements m WHERE json_extract(m.data,'$.source_type')='MILL_CLOSURE' AND json_extract(m.data,'$.source_id')=c.id AND json_extract(m.data,'$.item_type')='INGREDIENT' AND json_extract(m.data,'$.item_id')=json_extract(e.value,'$.ingredient_id') AND json_extract(m.data,'$.movement_type')='CONSUMPTION_OUT' AND json_extract(m.data,'$.quantity')=0 AND json_extract(m.data,'$.weight_kg')=-json_extract(e.value,'$.grams') AND json_extract(m.data,'$.date')=json_extract(c.data,'$.date') AND json_extract(m.data,'$.created_by')=json_extract(c.data,'$.created_by'))<>1));
SELECT RAISE(ABORT,'Orphan mill movement') WHERE EXISTS(SELECT 1 FROM inventory_movements m WHERE json_extract(m.data,'$.source_type')='MILL_CLOSURE' AND (json_extract(m.data,'$.item_type') NOT IN ('PRODUCT','INGREDIENT') OR NOT EXISTS(SELECT 1 FROM mill_closures c WHERE c.id=json_extract(m.data,'$.source_id'))));
END;
