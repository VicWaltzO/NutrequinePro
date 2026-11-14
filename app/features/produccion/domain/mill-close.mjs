import { date, pick, requireValue } from "../../../shared/domain/core.mjs";
import { presentationSnapshot } from "../../../shared/domain/presentation.mjs";

// A journey line is one complete mill lot, independently closed by explicit business decision.
export function millClose({ s, p, add, uid, movement, request_id }) {
  requireValue(
    Object.keys(p).every((k) =>
      ["line_id", "date", "actual_bags", "lot_complete", "formula_consent", "expected_revision"].includes(k),
    ),
    "Campo de cierre no permitido.",
  );
  requireValue(
    Number.isSafeInteger(p.expected_revision) && p.expected_revision === s.revision,
    "Los datos cambiaron. Recargue antes de cerrar.",
  );
  requireValue(
    typeof request_id === "string" && /^[A-Za-z0-9_.:-]{1,100}$/.test(request_id),
    "Identificador de operación inválido.",
  );
  const line = pick(s, "productionJourneyLines", p.line_id);
  const journey = pick(s, "productionJourneys", line.journey_id);
  requireValue(!s.millClosures.some((c) => c.line_id === line.id), "El lote ya está cerrado.");
  requireValue(p.lot_complete === true, "Confirme que el molino terminó la totalidad del lote.");
  const links = s.productionJourneyLinks.filter((l) => l.line_id === line.id);
  requireValue(
    links.length > 0 && links.reduce((n, l) => n + l.nuclei_hundredths, 0) === line.nuclei_hundredths,
    "Vincule todos los núcleos del lote antes de cerrar.",
  );
  const mismatch = links.some(
    (l) => pick(s, "microConfirmations", l.confirmation_id).formula_id !== line.micro_formula_id,
  );
  requireValue(
    typeof p.formula_consent === "boolean" && (!mismatch || p.formula_consent),
    "Confirme la diferencia entre microfórmula prevista y efectiva.",
  );
  const product = pick(s, "products", line.product_id);
  const presentation = presentationSnapshot(product);
  requireValue(
    product.is_active &&
      presentation.presentation_unit_snapshot === "BAG" &&
      presentation.unit_weight_grams_snapshot === 25000,
    "El cierre admite únicamente productos activos en sacos de 25 kg.",
  );
  const bags = p.actual_bags;
  requireValue(
    Number.isSafeInteger(bags) && bags >= 0 && bags <= Math.floor(line.planned_weight_grams / 25000),
    "Sacos completos reales fuera de rango.",
  );
  requireValue(
    bags > 0 || line.planned_weight_grams < 25000,
    "Cero sacos solo corresponde a un plan inferior a un saco completo.",
  );
  const day = date(p.date);
  requireValue(
    day >= journey.date && links.every((l) => day >= pick(s, "microConfirmations", l.confirmation_id).date),
    "El cierre no puede preceder a la jornada o sus confirmaciones.",
  );
  const id = uid();
  const entry = bags
    ? movement({
        item_type: "PRODUCT",
        item_id: line.product_id,
        movement_type: "PRODUCTION_IN",
        quantity: bags,
        weight_kg: bags * 25000,
        source_type: "MILL_CLOSURE",
        source_id: id,
        date: day,
        notes: `Molino: ${journey.code} · ${line.product_name}`,
      })
    : null;
  // Macro consumption follows the frozen legacy recipe contract once; no new micro ISSUE or cost.
  for (const m of line.macro_estimate)
    if (m.grams > 0)
      movement({
        item_type: "INGREDIENT",
        item_id: m.ingredient_id,
        movement_type: "CONSUMPTION_OUT",
        quantity: 0,
        weight_kg: -m.grams,
        source_type: "MILL_CLOSURE",
        source_id: id,
        date: day,
        notes: `Molino: ${journey.code} · ${line.product_name}`,
      });
  add("millClosures", {
    id,
    journey_id: journey.id,
    line_id: line.id,
    product_id: line.product_id,
    request_id,
    date: day,
    lot_complete: true,
    formula_consent: p.formula_consent,
    formula_mismatch: mismatch,
    actual_bags: bags,
    waste_grams: line.planned_weight_grams - bags * 25000,
    theoretical_weight_grams: line.planned_weight_grams,
    unit_weight_grams: 25000,
    movement_id: entry?.id ?? null,
    final_cost_cents: null,
  });
  return id;
}
