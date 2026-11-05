import { requireValue, text, pick, scaled, date, roundedProduct } from "../../../shared/domain/core.mjs";

function decimal(value, digits) {
  requireValue(
    typeof value === "string" || typeof value === "number",
    "Cantidad o precio debe ser un número decimal explícito.",
  );
  return scaled(value, digits);
}
function literal(value, label) {
  requireValue(typeof value === "string", `${label} debe ser texto.`);
  return text(value, label);
}
export function microSave({ s, p, add, clock }) {
  const current = p.id ? pick(s, "microIngredients", p.id) : null;
  requireValue(
    (typeof p.operational_id === "number" && Number.isSafeInteger(p.operational_id)) ||
      (typeof p.operational_id === "string" && /^[1-9]\d*$/.test(p.operational_id)),
    "ID operativo inválido.",
  );
  const operationalId = Number(p.operational_id);
  requireValue(
    Number.isSafeInteger(operationalId) &&
      operationalId > 0 &&
      operationalId <= 1000000 &&
      operationalId !== 14,
    "ID operativo inválido; el 14 permanece sin asignar.",
  );
  requireValue(!current || current.operational_id === operationalId, "El ID operativo es permanente.");
  requireValue(
    !s.microIngredients.some((row) => row.id !== current?.id && row.operational_id === operationalId),
    "ID operativo ya utilizado.",
  );
  requireValue(
    typeof p.name === "string" && p.name.length > 0 && p.name.length <= 2000 && p.name.trim().length > 0,
    "Nombre comercial obligatorio (máximo 2000 caracteres).",
  );
  requireValue(typeof p.is_active === "boolean", "Estado inválido.");
  const values = {
    name: p.name,
    operational_id: operationalId,
    unit: "KG",
    is_active: p.is_active,
    known_price_per_kg:
      p.known_price_per_kg == null || p.known_price_per_kg === "" ? null : decimal(p.known_price_per_kg, 2),
  };
  if (current) {
    Object.assign(current, values, { updated_at: clock });
    return current.id;
  }
  return add("microIngredients", values).id;
}
function openingValues(p) {
  requireValue(["REAL", "ESTIMATED"].includes(p.measurement), "Indique cantidad real o estimada.");
  const quantity = decimal(p.quantity_kg, 3);
  const cost = p.unit_cost == null || p.unit_cost === "" ? null : decimal(p.unit_cost, 2);
  return {
    warehouse: "MICROS",
    quantity_grams: quantity,
    unit_cost_cents: cost,
    valuation_cents: cost === null ? null : roundedProduct(quantity, cost, 1000),
    cutoff_date: date(p.cutoff_date),
    measurement: p.measurement,
    source: literal(p.source, "Procedencia"),
    notes: p.notes == null || p.notes === "" ? "" : literal(p.notes, "Observación"),
  };
}
export function microOpen({ s, p, add }) {
  const micro = pick(s, "microIngredients", p.micro_ingredient_id);
  requireValue(micro.is_active, "Microinsumo inactivo.");
  requireValue(
    !s.microOpenings.some((row) => row.micro_ingredient_id === micro.id),
    "El saldo inicial ya fue registrado. Use corrección auditada.",
  );
  return add("microOpenings", { micro_ingredient_id: micro.id, version: 1, ...openingValues(p) }).id;
}
export function microCorrect({ s, p, correction, clock }) {
  const current = pick(s, "microOpenings", p.id);
  requireValue(p.expected_version === current.version, "El saldo cambió. Recargue antes de corregir.");
  const values = openingValues(p);
  requireValue(
    !s.microPurchaseLines.some(
      (line) =>
        line.is_current &&
        line.micro_ingredient_id === current.micro_ingredient_id &&
        s.microPurchases.some(
          (purchase) =>
            purchase.id === line.purchase_id &&
            purchase.status === "CONFIRMED" &&
            purchase.document_date > values.cutoff_date,
        ),
    ),
    "El corte dejaría compras históricas fuera de período. Revise sus vínculos primero.",
  );
  const reason = literal(p.reason, "Motivo de corrección");
  correction(
    "MICRO_OPENING",
    current.id,
    structuredClone(current),
    { ...current, ...values, version: current.version + 1, updated_at: clock },
    reason,
  );
  Object.assign(current, values, { version: current.version + 1, updated_at: clock });
  return current.id;
}
