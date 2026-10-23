import { requireValue, positiveInt } from "./core.mjs";

export const PRESENTATION_UNITS = ["BAG", "BOTTLE", "UNIT"];
const labels = {
  BAG: { singular: "saco", plural: "sacos" },
  BOTTLE: { singular: "frasco", plural: "frascos" },
  UNIT: { singular: "unidad", plural: "unidades" },
};

/** Legacy masters retain their stored nominal weight; persisted documents are never rewritten. */
export function productPresentation(product = {}) {
  return {
    presentation_unit: product.presentation_unit ?? "BAG",
    unit_weight_grams: product.unit_weight_grams ?? product.standard_bag_weight_kg ?? 25000,
    weight_policy: product.weight_policy ?? "VARIABLE",
    stock_entry_mode: product.stock_entry_mode ?? "NUCLEUS_PRODUCTION",
  };
}

export function unitLabels(record = {}) {
  return labels[record.presentation_unit_snapshot ?? record.presentation_unit ?? "BAG"] ?? labels.UNIT;
}

/** Historical lines without metadata are bags, irrespective of today's master. */
export function presentationSnapshot(record, historical = false) {
  const presentation = historical
    ? {
        presentation_unit: record.presentation_unit_snapshot ?? "BAG",
        unit_weight_grams: record.unit_weight_grams_snapshot ?? record.unit_weight_kg,
        weight_policy: record.weight_policy_snapshot ?? "VARIABLE",
      }
    : productPresentation(record);
  return {
    presentation_unit_snapshot: presentation.presentation_unit,
    unit_weight_grams_snapshot: presentation.unit_weight_grams,
    weight_policy_snapshot: presentation.weight_policy,
  };
}

export function isNucleusProduct(product) {
  return productPresentation(product).stock_entry_mode === "NUCLEUS_PRODUCTION";
}

export function validatePresentation(presentation) {
  requireValue(PRESENTATION_UNITS.includes(presentation.presentation_unit), "Unidad comercial inválida.");
  positiveInt(presentation.unit_weight_grams, "Contenido neto en gramos");
  requireValue(
    presentation.presentation_unit !== "BAG" || [25000, 50000].includes(presentation.unit_weight_grams),
    "Los sacos deben tener una presentación de 25 kg o 50 kg.",
  );
  requireValue(["FIXED", "VARIABLE"].includes(presentation.weight_policy), "Política de peso inválida.");
  requireValue(
    ["NUCLEUS_PRODUCTION", "DIRECT_STOCK"].includes(presentation.stock_entry_mode),
    "Ingreso al inventario inválido.",
  );
  requireValue(
    presentation.presentation_unit !== "BOTTLE" || presentation.weight_policy === "FIXED",
    "Los frascos requieren peso fijo.",
  );
  requireValue(
    presentation.stock_entry_mode !== "NUCLEUS_PRODUCTION" || presentation.presentation_unit === "BAG",
    "La producción por núcleo requiere presentación en sacos.",
  );
}

export function validateNucleusWeight(product) {
  if (!isNucleusProduct(product)) return;
  const { unit_weight_grams } = productPresentation(product);
  requireValue(
    product.commercial_weight_per_nucleus_kg === product.bags_per_nucleus * unit_weight_grams,
    "El peso comercial por núcleo debe coincidir con los sacos por núcleo y el peso de cada saco.",
  );
}

export function assertUnitWeight(snapshot, weight) {
  requireValue(
    snapshot.weight_policy_snapshot !== "FIXED" || weight === snapshot.unit_weight_grams_snapshot,
    "El peso debe coincidir con el contenido neto fijo por unidad.",
  );
}
