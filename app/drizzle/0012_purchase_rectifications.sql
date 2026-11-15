-- NQP26-35: signed purchase deltas; all prior migrations remain unchanged.
DROP TRIGGER micro_ledger_scale_insert;
--> statement-breakpoint
DROP TRIGGER micro_ledger_scale_update;
--> statement-breakpoint
CREATE TRIGGER micro_ledger_scale_insert BEFORE INSERT ON micro_ledgers BEGIN
 SELECT RAISE(ABORT,'Invalid exact ledger balance') WHERE
 json_extract(NEW.data,'$.ledger.contract_version') NOT IN (1,2) OR
 (json_extract(NEW.data,'$.ledger.contract_version')=2 AND (typeof(json_extract(NEW.data,'$.ledger.quantity_hundredths')) IS NOT 'integer' OR json_extract(NEW.data,'$.ledger.quantity_hundredths') NOT BETWEEN 0 AND 100000000000000 OR json_extract(NEW.data,'$.ledger.quantity_grams') IS NOT json_extract(NEW.data,'$.ledger.quantity_hundredths')/100.0)) OR
 COALESCE(json_extract(NEW.data,'$.ledger.quantity_hundredths'),100*json_extract(NEW.data,'$.ledger.quantity_grams')) IS NOT
 100*json_extract(NEW.data,'$.ledger.opening.quantity_grams') + COALESCE((SELECT sum(CASE WHEN json_extract(e.value,'$.input.type')='RECEIPT' THEN 100*json_extract(e.value,'$.input.quantity_grams') WHEN json_extract(e.value,'$.input.type')='PURCHASE_ADJUSTMENT' THEN 100*json_extract(e.value,'$.input.quantity_grams') WHEN json_extract(e.value,'$.input.type')='RETURN' THEN json_extract(e.value,'$.input.quantity_hundredths') ELSE -COALESCE(json_extract(e.value,'$.input.quantity_hundredths'),100*json_extract(e.value,'$.input.quantity_grams')) END) FROM json_each(NEW.data,'$.ledger.events') e),0);
END;

--> statement-breakpoint
CREATE TRIGGER purchase_rectification_no_update BEFORE UPDATE ON corrections
WHEN json_extract(OLD.data,'$.entity_type')='MICRO_RECEIPT_RECTIFY'
BEGIN SELECT RAISE(ABORT,'Immutable purchase rectification'); END;
--> statement-breakpoint
CREATE TRIGGER purchase_rectification_no_delete BEFORE DELETE ON corrections
WHEN json_extract(OLD.data,'$.entity_type')='MICRO_RECEIPT_RECTIFY'
BEGIN SELECT RAISE(ABORT,'Immutable purchase rectification'); END;
--> statement-breakpoint
CREATE TRIGGER purchase_receipt_identity BEFORE UPDATE ON micro_receipts
WHEN json_extract(OLD.data,'$.status')='CONFIRMED' BEGIN
 SELECT RAISE(ABORT,'Immutable confirmed purchase identity') WHERE
 NEW.document_key IS NOT OLD.document_key OR NEW.expense_id IS NOT OLD.expense_id OR NEW.request_id IS NOT OLD.request_id OR
 json_extract(NEW.data,'$.status') IS NOT 'CONFIRMED' OR
 json_extract(NEW.data,'$.supplier') IS NOT json_extract(OLD.data,'$.supplier') OR
 json_extract(NEW.data,'$.reference') IS NOT json_extract(OLD.data,'$.reference') OR
 json_extract(NEW.data,'$.document_date') IS NOT json_extract(OLD.data,'$.document_date');
END;
--> statement-breakpoint
CREATE TRIGGER purchase_line_history BEFORE UPDATE ON micro_receipt_lines BEGIN
 SELECT RAISE(ABORT,'Immutable purchase line history') WHERE
 json_remove(NEW.data,'$.is_current') IS NOT json_remove(OLD.data,'$.is_current') OR
 (json_extract(OLD.data,'$.is_current')=0 AND json_extract(NEW.data,'$.is_current') IS NOT 0);
END;
--> statement-breakpoint
CREATE TRIGGER purchase_rectification_complete BEFORE UPDATE ON settings BEGIN
 SELECT RAISE(ABORT,'Purchase header differs from documentary lines') WHERE EXISTS(
 SELECT 1 FROM micro_receipts r WHERE json_extract(r.data,'$.status')='CONFIRMED' AND (
 json_extract(r.data,'$.total_cents') IS NOT (SELECT SUM(json_extract(l.data,'$.total_cost_cents')) FROM micro_receipt_lines l WHERE l.receipt_id=r.id AND json_extract(l.data,'$.is_current')=1) OR
 json_extract(r.data,'$.discount_cents') IS NOT (SELECT SUM(json_extract(l.data,'$.discount_cents')) FROM micro_receipt_lines l WHERE l.receipt_id=r.id AND json_extract(l.data,'$.is_current')=1) OR
 EXISTS(SELECT 1 FROM micro_receipt_lines l WHERE l.receipt_id=r.id AND json_extract(l.data,'$.is_current')=1 AND json_extract(l.data,'$.version') IS NOT json_extract(r.data,'$.version'))));
 SELECT RAISE(ABORT,'Purchase version requires audited correction') WHERE EXISTS(
 SELECT 1 FROM micro_receipts r WHERE json_extract(r.data,'$.status')='CONFIRMED' AND
 json_extract(r.data,'$.version') IS NOT COALESCE((SELECT MAX(json_extract(c.data,'$.new_snapshot.receipt.version')) FROM corrections c WHERE json_extract(c.data,'$.entity_type')='MICRO_RECEIPT_RECTIFY' AND json_extract(c.data,'$.entity_id')=r.id),
 (SELECT MAX(json_extract(l.data,'$.version')) FROM micro_receipt_lines l JOIN micro_valuation_events e ON e.receipt_line_id=l.id WHERE l.receipt_id=r.id)));
 SELECT RAISE(ABORT,'Orphan purchase adjustment') WHERE EXISTS(
 SELECT 1 FROM micro_ledgers l,json_each(l.data,'$.ledger.events') e
 WHERE json_extract(e.value,'$.input.type')='PURCHASE_ADJUSTMENT' AND NOT EXISTS(
 SELECT 1 FROM corrections r,json_each(r.data,'$.new_snapshot.differences') d,json_each(d.value,'$.events') ce
 WHERE json_extract(r.data,'$.entity_type')='MICRO_RECEIPT_RECTIFY' AND json_extract(r.data,'$.entity_id')=json_extract(e.value,'$.input.receipt_id') AND json(ce.value)=json(e.value)));
 SELECT RAISE(ABORT,'Purchase rectification requires audit') WHERE EXISTS(
 SELECT 1 FROM corrections r WHERE json_extract(r.data,'$.entity_type')='MICRO_RECEIPT_RECTIFY' AND NOT EXISTS(
 SELECT 1 FROM audit a WHERE json_extract(a.data,'$.action')='MICRO_RECEIPT_RECTIFY' AND json_extract(a.data,'$.entity_id')=r.id
 AND json_extract(a.data,'$.created_by')=json_extract(r.data,'$.created_by') AND json_extract(a.data,'$.actor_role')='ADMIN'
 AND json_extract(a.data,'$.request_id')=json_extract(r.data,'$.new_snapshot.request_id')));
 SELECT RAISE(ABORT,'Inconsistent purchase expense') WHERE EXISTS(
 SELECT 1 FROM micro_receipts r LEFT JOIN expenses e ON e.id=r.expense_id
 WHERE json_extract(r.data,'$.status')='CONFIRMED' AND (e.id IS NULL OR json_extract(e.data,'$.amount') IS NOT json_extract(r.data,'$.total_cents') OR json_extract(e.data,'$.status') IS NOT 'CONFIRMED'));
END;

--> statement-breakpoint
CREATE TRIGGER micro_ledger_scale_update BEFORE UPDATE ON micro_ledgers BEGIN
 SELECT RAISE(ABORT,'Invalid exact ledger balance') WHERE
 json_extract(NEW.data,'$.ledger.contract_version') NOT IN (1,2) OR
 (json_extract(NEW.data,'$.ledger.contract_version')=2 AND (typeof(json_extract(NEW.data,'$.ledger.quantity_hundredths')) IS NOT 'integer' OR json_extract(NEW.data,'$.ledger.quantity_hundredths') NOT BETWEEN 0 AND 100000000000000 OR json_extract(NEW.data,'$.ledger.quantity_grams') IS NOT json_extract(NEW.data,'$.ledger.quantity_hundredths')/100.0)) OR
 COALESCE(json_extract(NEW.data,'$.ledger.quantity_hundredths'),100*json_extract(NEW.data,'$.ledger.quantity_grams')) IS NOT
 100*json_extract(NEW.data,'$.ledger.opening.quantity_grams') + COALESCE((SELECT sum(CASE WHEN json_extract(e.value,'$.input.type')='RECEIPT' THEN 100*json_extract(e.value,'$.input.quantity_grams') WHEN json_extract(e.value,'$.input.type')='PURCHASE_ADJUSTMENT' THEN 100*json_extract(e.value,'$.input.quantity_grams') WHEN json_extract(e.value,'$.input.type')='RETURN' THEN json_extract(e.value,'$.input.quantity_hundredths') ELSE -COALESCE(json_extract(e.value,'$.input.quantity_hundredths'),100*json_extract(e.value,'$.input.quantity_grams')) END) FROM json_each(NEW.data,'$.ledger.events') e),0);
END;

--> statement-breakpoint
