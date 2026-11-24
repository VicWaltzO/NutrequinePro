import { requireValue } from "../../../shared/domain/core.mjs";

// Initial snapshots need the same completeness checks as incremental transactions.
export function assertMillIntegrity(before, s) {
  const closures = s.millClosures;
  for (const old of before?.millClosures ?? [])
    requireValue(
      JSON.stringify(closures.find((c) => c.id === old.id)) === JSON.stringify(old),
      "Cierre del molino inmutable.",
    );
  for (const c of closures) {
    const line = s.productionJourneyLines.find((l) => l.id === c.line_id);
    requireValue(
      line && line.journey_id === c.journey_id && line.product_id === c.product_id,
      "Origen de cierre inválido.",
    );
    const moves = s.inventoryMovements.filter(
      (m) => m.source_type === "MILL_CLOSURE" && m.source_id === c.id,
    );
    const product = moves.filter((m) => m.item_type === "PRODUCT");
    const macros = moves.filter((m) => m.item_type === "INGREDIENT");
    requireValue(
      product.length === (c.actual_bags > 0 ? 1 : 0) &&
        (c.actual_bags > 0
          ? product[0].id === c.movement_id &&
            product[0].item_id === c.product_id &&
            product[0].quantity === c.actual_bags &&
            product[0].weight_kg === c.actual_bags * 25000 &&
            product[0].movement_type === "PRODUCTION_IN"
          : c.movement_id === null),
      "Entrada comercial del molino inválida.",
    );
    const expected = line.macro_estimate.filter((m) => m.grams > 0);
    requireValue(
      macros.length === expected.length &&
        expected.every(
          (e) =>
            macros.filter(
              (m) =>
                m.item_id === e.ingredient_id &&
                m.quantity === 0 &&
                m.weight_kg === -e.grams &&
                m.movement_type === "CONSUMPTION_OUT",
            ).length === 1,
        ),
      "Consumos macro del molino incompletos.",
    );
    requireValue(
      moves.length === product.length + macros.length &&
        moves.every((m) => m.created_by === c.created_by && m.date === c.date),
      "Movimiento del molino inválido.",
    );
    const audits = s.audit.filter((a) => a.action === "MILL_CLOSE" && a.entity_id === c.id);
    const [audit] = audits;
    requireValue(
      audits.length === 1 &&
        audit.created_by === c.created_by &&
        audit.created_at === c.created_at &&
        audit.request_id === c.request_id &&
        ["ADMIN", "OPERATOR"].includes(audit.actor_role) &&
        audit.payload?.line_id === c.line_id &&
        audit.payload.date === c.date &&
        audit.payload.actual_bags === c.actual_bags &&
        audit.payload.lot_complete === true &&
        c.lot_complete === true &&
        audit.payload.formula_consent === c.formula_consent,
      "La auditoría no coincide con el cierre del molino.",
    );
    requireValue(
      Number.isSafeInteger(c.actual_bags) &&
        c.actual_bags >= 0 &&
        c.unit_weight_grams === 25000 &&
        c.theoretical_weight_grams === line.planned_weight_grams &&
        c.waste_grams === line.planned_weight_grams - c.actual_bags * 25000 &&
        c.waste_grams >= 0 &&
        (c.actual_bags > 0 || line.planned_weight_grams < 25000),
      "Rendimiento del molino inválido.",
    );
  }
  requireValue(
    s.inventoryMovements
      .filter((m) => m.source_type === "MILL_CLOSURE")
      .every((m) => closures.some((c) => c.id === m.source_id)),
    "Movimiento del molino sin cierre.",
  );
}
