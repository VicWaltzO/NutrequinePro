-- NQP26-34: additive returns; immutable historical ISSUE and snapshots remain intact.
DROP TRIGGER micro_ledger_scale_insert;
--> statement-breakpoint
DROP TRIGGER micro_ledger_scale_update;
--> statement-breakpoint
CREATE TRIGGER micro_ledger_scale_insert BEFORE INSERT ON micro_ledgers BEGIN
 SELECT RAISE(ABORT,'Invalid exact ledger balance') WHERE
 json_extract(NEW.data,'$.ledger.contract_version') NOT IN (1,2) OR
 (json_extract(NEW.data,'$.ledger.contract_version')=2 AND (typeof(json_extract(NEW.data,'$.ledger.quantity_hundredths')) IS NOT 'integer' OR json_extract(NEW.data,'$.ledger.quantity_hundredths') NOT BETWEEN 0 AND 100000000000000 OR json_extract(NEW.data,'$.ledger.quantity_grams') IS NOT json_extract(NEW.data,'$.ledger.quantity_hundredths')/100.0)) OR
 COALESCE(json_extract(NEW.data,'$.ledger.quantity_hundredths'),100*json_extract(NEW.data,'$.ledger.quantity_grams')) IS NOT
 100*json_extract(NEW.data,'$.ledger.opening.quantity_grams') + COALESCE((SELECT sum(CASE WHEN json_extract(e.value,'$.input.type')='RECEIPT' THEN 100*json_extract(e.value,'$.input.quantity_grams') WHEN json_extract(e.value,'$.input.type')='RETURN' THEN json_extract(e.value,'$.input.quantity_hundredths') ELSE -COALESCE(json_extract(e.value,'$.input.quantity_hundredths'),100*json_extract(e.value,'$.input.quantity_grams')) END) FROM json_each(NEW.data,'$.ledger.events') e),0);
END;

--> statement-breakpoint
CREATE TRIGGER micro_ledger_scale_update BEFORE UPDATE ON micro_ledgers BEGIN
 SELECT RAISE(ABORT,'Invalid exact ledger balance') WHERE
 json_extract(NEW.data,'$.ledger.contract_version') NOT IN (1,2) OR
 (json_extract(NEW.data,'$.ledger.contract_version')=2 AND (typeof(json_extract(NEW.data,'$.ledger.quantity_hundredths')) IS NOT 'integer' OR json_extract(NEW.data,'$.ledger.quantity_hundredths') NOT BETWEEN 0 AND 100000000000000 OR json_extract(NEW.data,'$.ledger.quantity_grams') IS NOT json_extract(NEW.data,'$.ledger.quantity_hundredths')/100.0)) OR
 COALESCE(json_extract(NEW.data,'$.ledger.quantity_hundredths'),100*json_extract(NEW.data,'$.ledger.quantity_grams')) IS NOT
 100*json_extract(NEW.data,'$.ledger.opening.quantity_grams') + COALESCE((SELECT sum(CASE WHEN json_extract(e.value,'$.input.type')='RECEIPT' THEN 100*json_extract(e.value,'$.input.quantity_grams') WHEN json_extract(e.value,'$.input.type')='RETURN' THEN json_extract(e.value,'$.input.quantity_hundredths') ELSE -COALESCE(json_extract(e.value,'$.input.quantity_hundredths'),100*json_extract(e.value,'$.input.quantity_grams')) END) FROM json_each(NEW.data,'$.ledger.events') e),0);
END;

--> statement-breakpoint
CREATE TRIGGER micro_rectification_no_update BEFORE UPDATE ON corrections
WHEN json_extract(OLD.data,'$.entity_type')='MICRO_PREPARATION_RECTIFY'
BEGIN SELECT RAISE(ABORT,'Immutable preparation rectification'); END;
--> statement-breakpoint
CREATE TRIGGER micro_rectification_no_delete BEFORE DELETE ON corrections
WHEN json_extract(OLD.data,'$.entity_type')='MICRO_PREPARATION_RECTIFY'
BEGIN SELECT RAISE(ABORT,'Immutable preparation rectification'); END;
--> statement-breakpoint
CREATE TRIGGER micro_rectification_valid BEFORE INSERT ON corrections
WHEN json_extract(NEW.data,'$.entity_type')='MICRO_PREPARATION_RECTIFY'
BEGIN
 SELECT RAISE(ABORT,'Invalid rectification metadata') WHERE
 json_extract(NEW.data,'$.id') IS NOT NEW.id OR
 NOT EXISTS(SELECT 1 FROM micro_confirmations WHERE preparation_id=json_extract(NEW.data,'$.entity_id') AND id=json_extract(NEW.data,'$.new_snapshot.confirmation_id')) OR
 NOT EXISTS(SELECT 1 FROM users WHERE id=json_extract(NEW.data,'$.created_by') AND json_extract(data,'$.is_active')=1 AND json_extract(data,'$.role') IN ('ADMIN','OPERATOR')) OR
 typeof(json_extract(NEW.data,'$.new_snapshot.nuclei_hundredths')) IS NOT 'integer' OR
 json_extract(NEW.data,'$.new_snapshot.nuclei_hundredths')<=0 OR
 json_extract(NEW.data,'$.new_snapshot.mode') NOT IN ('PHYSICAL','AUDIT_ONLY');
END;
--> statement-breakpoint
CREATE TRIGGER journey_rectification_floor BEFORE INSERT ON production_journey_links BEGIN
 SELECT RAISE(ABORT,'Corrected preparation unavailable') WHERE EXISTS(
 SELECT 1 FROM corrections r WHERE json_extract(r.data,'$.entity_type')='MICRO_PREPARATION_RECTIFY'
 AND json_extract(r.data,'$.entity_id')=NEW.preparation_id AND
 (json_extract(r.data,'$.new_snapshot.mode')='AUDIT_ONLY' OR
 (r.id=(SELECT id FROM corrections WHERE json_extract(data,'$.entity_type')='MICRO_PREPARATION_RECTIFY' AND json_extract(data,'$.entity_id')=NEW.preparation_id ORDER BY json_extract(data,'$.code') DESC LIMIT 1)
 AND NEW.nuclei_hundredths+COALESCE((SELECT SUM(nuclei_hundredths) FROM production_journey_links WHERE preparation_id=NEW.preparation_id),0)>json_extract(r.data,'$.new_snapshot.usable_nuclei_hundredths'))));
END;

--> statement-breakpoint
DROP TRIGGER journey_link_contract;
--> statement-breakpoint
CREATE TRIGGER journey_link_contract BEFORE INSERT ON production_journey_links BEGIN
 SELECT RAISE(ABORT,'Invalid confirmed preparation reference') WHERE NOT EXISTS(
 SELECT 1 FROM production_journey_lines l JOIN micro_preparations p ON p.id=NEW.preparation_id JOIN micro_confirmations c ON c.id=NEW.confirmation_id
 WHERE l.id=NEW.line_id AND p.family=l.family AND c.preparation_id=p.id AND c.formula_id=p.formula_id
 AND NOT EXISTS(SELECT 1 FROM micro_supersessions x WHERE x.source_id=p.id));
 SELECT RAISE(ABORT,'Preparation quantity already attributed') WHERE
 NEW.nuclei_hundredths + COALESCE((SELECT SUM(nuclei_hundredths) FROM production_journey_links WHERE preparation_id=NEW.preparation_id),0) > COALESCE((SELECT json_extract(data,'$.new_snapshot.usable_nuclei_hundredths') FROM corrections WHERE json_extract(data,'$.entity_type')='MICRO_PREPARATION_RECTIFY' AND json_extract(data,'$.entity_id')=NEW.preparation_id ORDER BY json_extract(data,'$.code') DESC LIMIT 1),(SELECT nuclei_hundredths FROM micro_confirmations WHERE id=NEW.confirmation_id));
 SELECT RAISE(ABORT,'Line quantity exceeded') WHERE
 NEW.nuclei_hundredths + COALESCE((SELECT SUM(nuclei_hundredths) FROM production_journey_links WHERE line_id=NEW.line_id),0) > (SELECT nuclei_hundredths FROM production_journey_lines WHERE id=NEW.line_id);
END;

--> statement-breakpoint
CREATE TRIGGER micro_rectification_complete BEFORE UPDATE ON settings BEGIN
 SELECT RAISE(ABORT,'Return requires audited preparation rectification') WHERE EXISTS(
 SELECT 1 FROM micro_ledgers l, json_each(l.data,'$.ledger.events') e
 WHERE json_extract(e.value,'$.input.type')='RETURN' AND NOT EXISTS(
 SELECT 1 FROM corrections r, json_each(r.data,'$.new_snapshot.lines') line, json_each(line.value,'$.events') ce
 WHERE json_extract(r.data,'$.entity_type')='MICRO_PREPARATION_RECTIFY'
 AND json_extract(r.data,'$.new_snapshot.mode')='PHYSICAL'
 AND json_extract(line.value,'$.micro_ingredient_id')=l.micro_ingredient_id
 AND json(ce.value)=json(e.value)));
 SELECT RAISE(ABORT,'Rectification requires audit and exact event references') WHERE EXISTS(
 SELECT 1 FROM corrections r WHERE json_extract(r.data,'$.entity_type')='MICRO_PREPARATION_RECTIFY'
 AND (NOT EXISTS(SELECT 1 FROM audit a WHERE json_extract(a.data,'$.action')='MICRO_PREPARATION_RECTIFY'
 AND json_extract(a.data,'$.entity_id')=r.id AND json_extract(a.data,'$.created_by')=json_extract(r.data,'$.created_by')
 AND json_extract(a.data,'$.request_id')=json_extract(r.data,'$.new_snapshot.request_id')) OR EXISTS(
 SELECT 1 FROM json_each(r.data,'$.new_snapshot.lines') line, json_each(line.value,'$.events') ce
 WHERE NOT EXISTS(SELECT 1 FROM micro_ledgers l,json_each(l.data,'$.ledger.events') e
 WHERE l.micro_ingredient_id=json_extract(line.value,'$.micro_ingredient_id') AND json(e.value)=json(ce.value)))));
END;

--> statement-breakpoint
CREATE TRIGGER micro_rectification_closed_guard BEFORE UPDATE ON settings BEGIN
 SELECT RAISE(ABORT,'Closed commercial lot prohibits physical correction') WHERE EXISTS(
 SELECT 1 FROM corrections r JOIN micro_confirmations cf ON cf.id=json_extract(r.data,'$.new_snapshot.confirmation_id')
 JOIN production_journey_links jl ON jl.preparation_id=cf.preparation_id
 JOIN mill_closures mc ON mc.line_id=jl.line_id
 JOIN audit ca ON json_extract(ca.data,'$.entity_id')=r.id AND json_extract(ca.data,'$.action')='MICRO_PREPARATION_RECTIFY'
 JOIN audit ma ON json_extract(ma.data,'$.entity_id')=mc.id AND json_extract(ma.data,'$.action')='MILL_CLOSE'
 WHERE json_extract(r.data,'$.entity_type')='MICRO_PREPARATION_RECTIFY'
 AND json_extract(r.data,'$.new_snapshot.mode')='PHYSICAL'
 AND json_extract(ma.data,'$.payload.expected_revision')<=json_extract(ca.data,'$.payload.expected_revision'));
 SELECT RAISE(ABORT,'Orphan differential issue') WHERE EXISTS(
 SELECT 1 FROM micro_ledgers l,json_each(l.data,'$.ledger.events') e
 WHERE json_extract(e.value,'$.input.type')='ISSUE'
 AND NOT EXISTS(SELECT 1 FROM micro_issues i WHERE i.id=json_extract(e.value,'$.input.id'))
 AND NOT EXISTS(SELECT 1 FROM corrections r,json_each(r.data,'$.new_snapshot.lines') line,json_each(line.value,'$.events') ce
 WHERE json_extract(r.data,'$.entity_type')='MICRO_PREPARATION_RECTIFY' AND json(ce.value)=json(e.value)));
 SELECT RAISE(ABORT,'Orphan preparation rectification audit') WHERE EXISTS(
 SELECT 1 FROM audit a WHERE json_extract(a.data,'$.action')='MICRO_PREPARATION_RECTIFY'
 AND NOT EXISTS(SELECT 1 FROM corrections r WHERE r.id=json_extract(a.data,'$.entity_id') AND json_extract(r.data,'$.entity_type')='MICRO_PREPARATION_RECTIFY'));
END;
