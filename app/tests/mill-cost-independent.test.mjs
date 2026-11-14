import { test } from "node:test";
import assert from "node:assert/strict";
import { ready, apply, closeCommand, actor } from "./helpers/mill-fixture.mjs";
import { millCostSummary, assertMillCostIntegrity } from "../features/produccion/domain/mill-cost.mjs";
const summary = (s) => millCostSummary(s, s.productionJourneyLines[0].id);
const recon = (s, changes = []) => ({
  type: "MILL_RECONCILE",
  request_id: crypto.randomUUID(),
  payload: {
    line_id: s.productionJourneyLines[0].id,
    mode: "ACTUAL",
    changes,
    reason: "Prueba independiente",
    expected_revision: s.revision,
  },
});
const costs = (s, amount = "0") => ({
  type: "MILL_COST_INPUT",
  request_id: crypto.randomUUID(),
  payload: {
    line_id: s.productionJourneyLines[0].id,
    packaging_amount: amount,
    packaging_reference: "Referencia independiente",
    extras: [],
    reviewed_costs: true,
    reason: "Prueba independiente",
    expected_revision: s.revision,
  },
});
function setup(reconcile = true) {
  const f = ready(["1"]);
  f.s = apply(f.s, closeCommand(f.s), f.options).state;
  if (reconcile) f.s = apply(f.s, recon(f.s), f.options).state;
  return f;
}
test("independiente: desconocido permanece pendiente y cero explicito", () => {
  const f = setup(false);
  f.s = apply(f.s, costs(f.s), f.options).state;
  assert.equal(summary(f.s).packaging_cents, 0);
  assert.equal(summary(f.s).total, null);
  f.s = apply(f.s, recon(f.s), f.options).state;
  assert.ok(summary(f.s).total);
});
test("independiente: precision, historicos, importacion y rol", () => {
  const f = setup(),
    before = structuredClone(f.s);
  f.s = apply(f.s, costs(f.s, "0.01"), f.options).state;
  const a = summary(f.s);
  assert.equal(a.packaging_cents, 1);
  assert.equal(BigInt(a.unit.n) * BigInt(a.total.d) * 39n, BigInt(a.total.n) * BigInt(a.unit.d));
  for (const table of [
    "expenses",
    "payments",
    "inventoryMovements",
    "microIssues",
    "microConfirmations",
    "productionCosts",
    "millClosures",
  ])
    assert.deepEqual(f.s[table], before[table]);
  assert.throws(() => apply(f.s, costs(f.s), f.options, { ...actor, role: "VIEWER" }));
  assertMillCostIntegrity(null, f.s);
  const changed = structuredClone(f.s);
  changed.corrections.at(-1).reason = "Alterado";
  assert.throws(() => assertMillCostIntegrity(f.s, changed), /inmutable/);
  assert.throws(() => assertMillCostIntegrity(null, changed));
});
test("independiente: limite aceptado conserva total exacto", () => {
  const f = setup();
  f.s = apply(f.s, costs(f.s), f.options).state;
  const original = summary(f.s).total;
  f.s = apply(f.s, costs(f.s, "10000000000"), f.options).state;
  assert.doesNotThrow(() => assertMillCostIntegrity(null, f.s));
  const result = summary(f.s);
  assert.equal(
    BigInt(result.total.n) * BigInt(original.d),
    (BigInt(original.n) + 1000000000000n * BigInt(original.d)) * BigInt(result.total.d),
  );
});
test("independiente: conciliacion posterior conserva total exacto sobre limite individual", () => {
  const f = setup();
  f.s = apply(f.s, costs(f.s), f.options).state;
  const current = summary(f.s);
  const roundedUp = (BigInt(current.total.n) + BigInt(current.total.d) - 1n) / BigInt(current.total.d);
  const packaging = 1000000000000n - roundedUp - 100n;
  f.s = apply(
    f.s,
    costs(f.s, `${packaging / 100n}.${String(packaging % 100n).padStart(2, "0")}`),
    f.options,
  ).state;
  const previous = summary(f.s);
  const oldRow = f.s.corrections.filter((r) => r.entity_type === "MILL_CHARGE").at(-1).new_snapshot.rows[0];
  f.s = apply(
    f.s,
    recon(f.s, [
      {
        ingredient_id: f.s.productionJourneyLines[0].macro_estimate[0].ingredient_id,
        quantity_kg: "2",
        price_per_kg: "9999999",
      },
    ]),
    f.options,
  ).state;
  assert.doesNotThrow(() => assertMillCostIntegrity(null, f.s));
  const result = summary(f.s);
  const delta = 1999999800n - BigInt(oldRow.actual_charge);
  assert.equal(
    BigInt(result.total.n) * BigInt(previous.total.d),
    (BigInt(previous.total.n) + delta * BigInt(previous.total.d)) * BigInt(result.total.d),
  );
  assert.ok(BigInt(result.total.n) > 1000000000000n * BigInt(result.total.d));
});
