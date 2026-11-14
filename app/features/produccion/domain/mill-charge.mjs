import { pick, requireValue, roundedProduct, safe, scaled, sum, text } from "../../../shared/domain/core.mjs";

// Billing quantities are independent of the physical recipe and its inventory consumption.
export function chargedMacro(grams, price, quantityKg, priceSoles) {
  const actual_grams = quantityKg === undefined ? grams : scaled(quantityKg, 3);
  const actual_price_cents_per_kg = priceSoles === undefined ? price : scaled(priceSoles);
  return {
    actual_grams,
    actual_price_cents_per_kg,
    actual_charge: roundedProduct(actual_grams, actual_price_cents_per_kg, 1000),
  };
}

export function millChargeSnapshot(line, mode = "THEORETICAL", changes = []) {
  requireValue(["THEORETICAL", "ACTUAL"].includes(mode), "Modalidad de cobro inválida.");
  requireValue(Array.isArray(changes), "Desglose de cobro inválido.");
  for (const row of changes) {
    requireValue(
      row &&
        typeof row === "object" &&
        !Array.isArray(row) &&
        Object.keys(row).every((k) => ["ingredient_id", "quantity_kg", "price_per_kg"].includes(k)),
      "Campo de cobro no permitido.",
    );
    requireValue(
      line.macro_estimate.some((m) => m.ingredient_id === row.ingredient_id),
      "Insumo ajeno al lote.",
    );
    requireValue(mode === "ACTUAL", "El cobro teórico no admite ajustes.");
  }
  requireValue(new Set(changes.map((r) => r.ingredient_id)).size === changes.length, "Insumo repetido.");
  const rows = line.macro_estimate.map((m) => {
    const input = changes.find((r) => r.ingredient_id === m.ingredient_id) ?? {};
    const actual = chargedMacro(m.grams, m.price_cents_per_kg, input.quantity_kg, input.price_per_kg);
    return {
      ingredient_id: m.ingredient_id,
      name: m.name,
      theoretical_grams: m.grams,
      theoretical_price_cents_per_kg: m.price_cents_per_kg,
      theoretical_charge: m.estimated_cents,
      ...actual,
      difference: safe(actual.actual_charge - m.estimated_cents),
    };
  });
  const service_cents = roundedProduct(line.planned_weight_grams, 25000, 1000000);
  const theoretical_cents = safe(sum(rows, (r) => r.theoretical_charge) + service_cents);
  const actual_cents = safe(sum(rows, (r) => r.actual_charge) + service_cents);
  return {
    mode,
    base_weight_grams: line.planned_weight_grams,
    service_rate_cents_per_tonne: 25000,
    service_cents,
    rows,
    theoretical_cents,
    actual_cents,
    difference_cents: safe(actual_cents - theoretical_cents),
  };
}

export function millChargeHistory(s, lineId) {
  return s.corrections
    .filter((r) => r.entity_type === "MILL_CHARGE" && r.entity_id === lineId)
    .sort((a, b) => a.code.localeCompare(b.code));
}

export function millReconcile({ s, p, request_id, correction }) {
  requireValue(["THEORETICAL", "ACTUAL"].includes(p.mode), "Modalidad de cobro inválida.");
  requireValue(
    Object.keys(p).every((k) => ["line_id", "mode", "changes", "reason", "expected_revision"].includes(k)),
    "Campo de conciliación no permitido.",
  );
  requireValue(
    Number.isSafeInteger(p.expected_revision) && p.expected_revision === s.revision,
    "Los datos cambiaron. Recargue antes de conciliar.",
  );
  requireValue(
    typeof request_id === "string" && /^[A-Za-z0-9_.:-]{1,100}$/.test(request_id),
    "Identificador de operación inválido.",
  );
  const line = pick(s, "productionJourneyLines", p.line_id);
  requireValue(
    s.millClosures.some((c) => c.line_id === line.id),
    "Cierre el lote antes de conciliar.",
  );
  const before = millChargeHistory(s, line.id).at(-1)?.new_snapshot ?? millChargeSnapshot(line);
  const snapshot = millChargeSnapshot(line, p.mode, p.changes ?? []);
  const record = correction("MILL_CHARGE", line.id, before, snapshot, text(p.reason, "Motivo"));
  return record.id;
}

// Covers both incremental writes and initial/imported snapshots without another monetary ledger.
export function assertMillChargeIntegrity(before, s) {
  const records = s.corrections
    .filter((r) => r.entity_type === "MILL_CHARGE")
    .sort((a, b) => a.code.localeCompare(b.code));
  for (const old of before?.corrections.filter((r) => r.entity_type === "MILL_CHARGE") ?? []) {
    requireValue(
      JSON.stringify(records.find((r) => r.id === old.id)) === JSON.stringify(old),
      "Conciliación del molino inmutable.",
    );
    const oldAudit = before.audit.find((a) => a.action === "MILL_RECONCILE" && a.entity_id === old.id);
    requireValue(
      oldAudit && JSON.stringify(s.audit.find((a) => a.id === oldAudit.id)) === JSON.stringify(oldAudit),
      "Auditoría de conciliación inmutable.",
    );
  }
  const previous = new Map();
  for (const record of records) {
    const line = pick(s, "productionJourneyLines", record.entity_id);
    requireValue(
      s.millClosures.some((c) => c.line_id === line.id),
      "Conciliación sin cierre.",
    );
    const value = record.new_snapshot;
    const changes =
      value.mode === "ACTUAL"
        ? value.rows.map((r) => ({
            ingredient_id: r.ingredient_id,
            quantity_kg: r.actual_grams / 1000,
            price_per_kg: r.actual_price_cents_per_kg / 100,
          }))
        : [];
    requireValue(
      JSON.stringify(value) === JSON.stringify(millChargeSnapshot(line, value.mode, changes)),
      "Desglose de conciliación inválido.",
    );
    requireValue(
      JSON.stringify(record.old_snapshot) ===
        JSON.stringify(previous.get(line.id) ?? millChargeSnapshot(line)),
      "Historial de conciliación incompleto.",
    );
    const audits = s.audit.filter((a) => a.action === "MILL_RECONCILE" && a.entity_id === record.id);
    requireValue(audits.length === 1, "Falta auditoría única de conciliación.");
    const audit = audits[0];
    const payload = audit.payload;
    requireValue(
      audit.created_by === record.created_by &&
        audit.created_at === record.created_at &&
        ["ADMIN", "OPERATOR"].includes(audit.actor_role) &&
        typeof audit.request_id === "string" &&
        /^[A-Za-z0-9_.:-]{1,100}$/.test(audit.request_id) &&
        payload &&
        payload.line_id === line.id &&
        ["THEORETICAL", "ACTUAL"].includes(payload.mode) &&
        Object.keys(payload).every((k) =>
          ["line_id", "mode", "changes", "reason", "expected_revision"].includes(k),
        ) &&
        Number.isSafeInteger(payload.expected_revision) &&
        payload.expected_revision < s.revision &&
        text(payload.reason, "Motivo") === record.reason &&
        JSON.stringify(millChargeSnapshot(line, payload.mode, payload.changes ?? [])) ===
          JSON.stringify(value),
      "Contrato de auditoría de conciliación inválido.",
    );
    requireValue(
      s.audit.filter((a) => a.request_id === audit.request_id).length === 1,
      "Identificador de conciliación duplicado.",
    );
    previous.set(line.id, value);
  }
  requireValue(
    s.audit
      .filter((a) => a.action === "MILL_RECONCILE")
      .every((a) => records.some((r) => r.id === a.entity_id)),
    "Auditoría de conciliación sin registro.",
  );
}
