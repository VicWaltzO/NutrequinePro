import { pick, requireValue, safe, scaled, text } from "../../../shared/domain/core.mjs";
import { journeySummary } from "./journey-view.mjs";
import { millChargeHistory } from "./mill-charge.mjs";

const ENTITY = "MILL_COST_INPUT";
const EMPTY_INPUT = {
  version: null,
  packaging_cents: null,
  packaging_reference: null,
  extras: null,
  reviewed_costs: null,
};
const fields = [
  "line_id",
  "packaging_amount",
  "packaging_reference",
  "extras",
  "reviewed_costs",
  "reason",
  "expected_revision",
];
function fraction(n, d = 1n) {
  requireValue(n >= 0n && d > 0n, "Costo o divisor inválido.");
  const gcd = (a, b) => (b ? gcd(b, a % b) : a);
  const g = gcd(n, d);
  return { n: String(n / g), d: String(d / g) };
}
function plus(a, b) {
  return fraction(BigInt(a.n) * BigInt(b.d) + BigInt(b.n) * BigInt(a.d), BigInt(a.d) * BigInt(b.d));
}
export function roundedCost(value) {
  if (value === null) return null;
  const n = BigInt(value.n);
  const d = BigInt(value.d);
  requireValue(n >= 0n && d > 0n, "Costo inválido.");
  const rounded = (2n * n + d) / (2n * d);
  requireValue(rounded <= BigInt(Number.MAX_SAFE_INTEGER), "Costo fuera de la precisión de presentación.");
  return Number(rounded);
}
export function millCostInputSnapshot(p) {
  requireValue(
    p && typeof p === "object" && !Array.isArray(p) && Object.keys(p).every((k) => fields.includes(k)),
    "Campo de costo no permitido.",
  );
  requireValue(p.reviewed_costs === true, "Revise los costos para evitar duplicaciones.");
  requireValue(Array.isArray(p.extras) && p.extras.length <= 20, "Costos directos inválidos.");
  const packaging_cents = scaled(p.packaging_amount);
  const packaging_reference = text(
    p.packaging_reference,
    "Referencia de envases o confirmación de costo cero",
  );
  const extras = p.extras.map((row) => {
    requireValue(
      row &&
        typeof row === "object" &&
        !Array.isArray(row) &&
        Object.keys(row).every((k) => ["amount", "description", "reference"].includes(k)),
      "Campo de costo directo no permitido.",
    );
    const amount_cents = scaled(row.amount);
    requireValue(amount_cents > 0, "Costo directo debe ser positivo; omita los que no corresponden.");
    return {
      amount_cents,
      description: text(row.description, "Descripción"),
      reference: text(row.reference, "Referencia"),
    };
  });
  // Full replacement, never another expense ledger or an accumulating adjustment.
  safe(extras.reduce((n, row) => safe(n + row.amount_cents), packaging_cents));
  return { version: 1, packaging_cents, packaging_reference, extras, reviewed_costs: true };
}
export function millCostHistory(s, lineId) {
  return s.corrections
    .filter((r) => r.entity_type === ENTITY && r.entity_id === lineId)
    .sort((a, b) => a.code.localeCompare(b.code));
}
export function millCostInputs({ s, p, request_id, correction }) {
  const snapshot = millCostInputSnapshot(p);
  requireValue(
    Number.isSafeInteger(p.expected_revision) && p.expected_revision === s.revision,
    "Los datos cambiaron. Recargue antes de registrar costos.",
  );
  requireValue(
    typeof request_id === "string" && /^[A-Za-z0-9_.:-]{1,100}$/.test(request_id),
    "Identificador de operación inválido.",
  );
  const line = pick(s, "productionJourneyLines", p.line_id);
  requireValue(
    s.millClosures.some((c) => c.line_id === line.id),
    "Cierre el lote antes de registrar costos.",
  );
  const before = millCostHistory(s, line.id).at(-1)?.new_snapshot ?? EMPTY_INPUT;
  return correction(ENTITY, line.id, before, snapshot, text(p.reason, "Motivo")).id;
}
export function millCostSummary(s, lineId) {
  const line = pick(s, "productionJourneyLines", lineId);
  const journey = pick(s, "productionJourneys", line.journey_id);
  const view = journeySummary(s, journey).lines.find((l) => l.id === lineId);
  const closure = view.closure;
  const charge = millChargeHistory(s, lineId).at(-1) ?? null;
  const inputs = millCostHistory(s, lineId).at(-1) ?? null;
  const micro =
    view.confirmed_hundredths === line.nuclei_hundredths
      ? view.links.reduce((total, link) => plus(total, link.cost_cents), fraction(0n))
      : null;
  const macros = charge ? charge.new_snapshot.rows.reduce((n, row) => safe(n + row.actual_charge), 0) : null;
  const service = charge?.new_snapshot.service_cents ?? null;
  const packaging = inputs?.new_snapshot.packaging_cents ?? null;
  const extras = inputs ? inputs.new_snapshot.extras.reduce((n, row) => safe(n + row.amount_cents), 0) : null;
  const complete =
    !!closure &&
    micro !== null &&
    macros !== null &&
    service !== null &&
    packaging !== null &&
    extras !== null;
  const total = complete
    ? plus(micro, fraction(BigInt(macros) + BigInt(service) + BigInt(packaging) + BigInt(extras)))
    : null;
  if (total) roundedCost(total); // Bound the complete amount before it reaches a monetary UI.
  const unit =
    total && closure.actual_bags > 0
      ? fraction(BigInt(total.n), BigInt(total.d) * BigInt(closure.actual_bags))
      : null;
  return {
    basis: "INFORMATIONAL_VARIABLE",
    complete,
    micro,
    macros_cents: macros,
    service_cents: service,
    packaging_cents: packaging,
    extras_cents: extras,
    total,
    unit,
    actual_bags: closure?.actual_bags ?? null,
    charge_id: charge?.id ?? null,
    input_id: inputs?.id ?? null,
  };
}

export function assertMillCostIntegrity(before, s) {
  const records = s.corrections
    .filter((r) => r.entity_type === ENTITY)
    .sort((a, b) => a.code.localeCompare(b.code));
  for (const old of before?.corrections.filter((r) => r.entity_type === ENTITY) ?? []) {
    requireValue(
      JSON.stringify(records.find((r) => r.id === old.id)) === JSON.stringify(old),
      "Documento de costo inmutable.",
    );
    const audit = before.audit.find((a) => a.action === "MILL_COST_INPUT" && a.entity_id === old.id);
    requireValue(
      audit && JSON.stringify(s.audit.find((a) => a.id === audit.id)) === JSON.stringify(audit),
      "Auditoría de costo inmutable.",
    );
  }
  const previous = new Map();
  for (const record of records) {
    pick(s, "productionJourneyLines", record.entity_id);
    requireValue(
      s.millClosures.some((c) => c.line_id === record.entity_id),
      "Documento de costo sin cierre.",
    );
    const audits = s.audit.filter((a) => a.action === "MILL_COST_INPUT" && a.entity_id === record.id);
    requireValue(audits.length === 1, "Falta auditoría única de costo.");
    const audit = audits[0];
    const p = audit.payload;
    requireValue(
      p &&
        p.line_id === record.entity_id &&
        ["ADMIN", "OPERATOR"].includes(audit.actor_role) &&
        audit.created_by === record.created_by &&
        audit.created_at === record.created_at &&
        typeof audit.request_id === "string" &&
        /^[A-Za-z0-9_.:-]{1,100}$/.test(audit.request_id) &&
        Number.isSafeInteger(p.expected_revision) &&
        p.expected_revision < s.revision &&
        text(p.reason, "Motivo") === record.reason,
      "Auditoría de costo inválida.",
    );
    requireValue(
      JSON.stringify(millCostInputSnapshot(p)) === JSON.stringify(record.new_snapshot),
      "Desglose de costo inválido.",
    );
    requireValue(
      JSON.stringify(record.old_snapshot) === JSON.stringify(previous.get(record.entity_id) ?? EMPTY_INPUT),
      "Historial de costos incompleto.",
    );
    requireValue(
      s.audit.filter((a) => a.request_id === audit.request_id).length === 1,
      "Identificador de costo duplicado.",
    );
    previous.set(record.entity_id, record.new_snapshot);
  }
  requireValue(
    s.audit
      .filter((a) => a.action === "MILL_COST_INPUT")
      .every((a) => records.some((r) => r.id === a.entity_id)),
    "Auditoría de costo sin documento.",
  );
}
