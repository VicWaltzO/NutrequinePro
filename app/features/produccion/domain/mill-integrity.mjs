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
    requireValue(
      s.audit.some(
        (a) =>
          a.action === "MILL_CLOSE" &&
          a.entity_id === c.id &&
          a.created_by === c.created_by &&
          a.request_id === c.request_id,
      ),
      "Falta auditoría del cierre del molino.",
    );
  }
  requireValue(
    s.inventoryMovements
      .filter((m) => m.source_type === "MILL_CLOSURE")
      .every((m) => closures.some((c) => c.id === m.source_id)),
    "Movimiento del molino sin cierre.",
  );
}
