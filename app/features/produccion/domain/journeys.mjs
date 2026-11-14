import { date, pick, requireValue, text, roundedProduct } from "../../../shared/domain/core.mjs";
import { nucleusHundredths, perNucleusAmount } from "../../../shared/domain/production-quantities.mjs";
import { journeyFamily } from "./journey-view.mjs";
export { journeyFamily, journeySummary } from "./journey-view.mjs";
import { preparationAuthorization } from "../../microinsumos/domain/preparations.mjs";
import { buildProductionProduct } from "./production-snapshots.mjs";

function fields(value, allowed) {
  requireValue(
    value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      Object.keys(value).every((k) => allowed.includes(k)),
    "Campo de jornada no permitido.",
  );
}
function preflight({ s, p, request_id }) {
  requireValue(
    Number.isSafeInteger(p.expected_revision) && p.expected_revision === s.revision,
    "Los datos cambiaron. Recargue antes de guardar la jornada.",
  );
  requireValue(
    typeof request_id === "string" && /^[A-Za-z0-9_.:-]{1,100}$/.test(request_id),
    "Identificador de operación inválido.",
  );
}
export function journeyCreate(context) {
  const { s, p, add, code, request_id, microPreparationPolicies } = context;
  fields(p, ["date", "notes", "lines", "expected_revision"]);
  preflight(context);
  requireValue(
    Array.isArray(p.lines) && p.lines.length > 0 && p.lines.length <= 3,
    "Incluya entre uno y tres productos de la jornada.",
  );
  p.lines.forEach((l) => fields(l, ["product_id", "nuclei", "formula_id", "micro_formula_id"]));
  requireValue(
    new Set(p.lines.map((l) => l.product_id)).size === p.lines.length,
    "Producto repetido en jornada.",
  );
  const day = date(p.date);
  const notes = p.notes === undefined || p.notes === "" ? "" : text(p.notes, "Notas");
  const lines = p.lines.map((l) => {
    fields(l, ["product_id", "nuclei", "formula_id", "micro_formula_id"]);
    requireValue(typeof l.nuclei === "string", "Cantidad debe ser decimal explícito.");
    const product = pick(s, "products", l.product_id);
    const family = journeyFamily(product);
    requireValue(
      family && s.products.filter((x) => x.name === product.name).length === 1,
      "Producto comercial no compatible o identidad ambigua.",
    );
    const snapshot = buildProductionProduct(s, "planning", {
      product_id: product.id,
      nuclei_count: l.nuclei,
    });
    requireValue(snapshot.formula_id === l.formula_id, "La macrofórmula cambió; recargue la selección.");
    const micro = pick(s, "microFormulas", l.micro_formula_id);
    requireValue(
      micro.family === family &&
        s.microFormulaHeads.some((h) => h.active_formula_id === micro.id && h.family === family),
      "Microfórmula activa incompatible.",
    );
    requireValue(
      preparationAuthorization(s, micro, microPreparationPolicies),
      "Microfórmula sin autorización privada exacta.",
    );
    return {
      product_id: product.id,
      product_name: product.name,
      family,
      nuclei_hundredths: nucleusHundredths(l.nuclei),
      formula_id: snapshot.formula_id,
      formula_snapshot: snapshot.formula_snapshot,
      micro_formula_id: micro.id,
      micro_formula_snapshot: structuredClone(s.microFormulaLines.filter((x) => x.formula_id === micro.id)),
      planned_weight_grams: perNucleusAmount(
        snapshot.commercial_weight_per_nucleus_snapshot,
        nucleusHundredths(l.nuclei),
      ),
      planned_bags: snapshot.bags_produced,
      macro_estimate: snapshot.formula_snapshot.map((fi) => {
        const ingredient = pick(s, "ingredients", fi.ingredient_id);
        requireValue(ingredient.is_active, "Macroinsumo inactivo.");
        const grams = perNucleusAmount(fi.kg_per_nucleus, nucleusHundredths(l.nuclei));
        return {
          ingredient_id: ingredient.id,
          name: ingredient.name,
          grams,
          price_cents_per_kg: ingredient.current_price_per_kg,
          estimated_cents: roundedProduct(grams, ingredient.current_price_per_kg, 1000),
        };
      }),
      actual_bags: null,
      waste_grams: null,
      final_cost_cents: null,
    };
  });
  const journey = add("productionJourneys", {
    code: code("productionJourneys", "JO"),
    date: day,
    timezone: s.config.timezone,
    notes,
    request_id,
  });
  for (const line of lines) add("productionJourneyLines", { ...line, journey_id: journey.id });
  return journey.id;
}
export function journeyLink(context) {
  const { s, p, add, request_id } = context;
  fields(p, ["line_id", "preparation_id", "nuclei", "expected_revision"]);
  preflight(context);
  const line = pick(s, "productionJourneyLines", p.line_id);
  const prep = pick(s, "microPreparations", p.preparation_id);
  requireValue(prep.family === line.family, "Familia incompatible con el producto.");
  requireValue(!s.microSupersessions.some((x) => x.source_id === prep.id), "Preparación supersedida.");
  const confirmation = s.microConfirmations.find((x) => x.preparation_id === prep.id);
  requireValue(confirmation, "Vincule únicamente núcleos realmente confirmados.");
  requireValue(typeof p.nuclei === "string", "Cantidad debe ser decimal explícito.");
  const nuclei = nucleusHundredths(p.nuclei);
  requireValue(nuclei > 0, "Cantidad vinculada debe ser positiva.");
  const assigned = s.productionJourneyLinks;
  requireValue(
    assigned.filter((x) => x.preparation_id === prep.id).reduce((n, x) => n + x.nuclei_hundredths, 0) +
      nuclei <=
      confirmation.nuclei_hundredths,
    "Cantidad supera los núcleos confirmados disponibles.",
  );
  requireValue(
    assigned.filter((x) => x.line_id === line.id).reduce((n, x) => n + x.nuclei_hundredths, 0) + nuclei <=
      line.nuclei_hundredths,
    "Cantidad supera lo planificado para el producto.",
  );
  add("productionJourneyLinks", {
    line_id: line.id,
    preparation_id: prep.id,
    confirmation_id: confirmation.id,
    nuclei_hundredths: nuclei,
    request_id,
  });
  return line.journey_id;
}
