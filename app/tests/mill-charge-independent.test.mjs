import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ready, apply, closeCommand, actor } from "./helpers/mill-fixture.mjs";
import { millChargeSnapshot, assertMillChargeIntegrity } from "../features/produccion/domain/mill-charge.mjs";
import { createStore } from "../lib/application-store.mjs";
import { openSqliteDatabase } from "../lib/adapters/node-sqlite.mjs";
import { initializeDatabase } from "../lib/sqlite/migrations.mjs";
import { createPrivateDirectory } from "../lib/sqlite/files.mjs";
const closed = () => {
  const f = ready(["1"]);
  f.s = apply(f.s, closeCommand(f.s, 38), f.options).state;
  return f;
};
const cmd = (s, mode = "ACTUAL", changes = []) => ({
  type: "MILL_RECONCILE",
  request_id: crypto.randomUUID(),
  payload: {
    line_id: s.productionJourneyLines[0].id,
    mode,
    changes,
    reason: "Revision independiente sintetica",
    expected_revision: s.revision,
  },
});

test("independiente: servicio sobre encargo, copia teorica y hechos fisicos intactos", () => {
  const f = closed();
  const line = f.s.productionJourneyLines[0];
  const i = line.macro_estimate[0];
  assert.equal(millChargeSnapshot(line).service_cents, 25000);
  assert.equal(millChargeSnapshot({ ...line, planned_weight_grams: 1500000 }).service_cents, 37500);
  const out = apply(
    f.s,
    cmd(f.s, "ACTUAL", [{ ingredient_id: i.ingredient_id, quantity_kg: "3.125", price_per_kg: "2.34" }]),
    f.options,
  ).state;
  assert.equal(out.corrections.at(-1).new_snapshot.rows[0].actual_charge, 731);
  for (const key of [
    "productionJourneyLines",
    "millClosures",
    "inventoryMovements",
    "expenses",
    "payments",
    "productionCosts",
    "microIssues",
  ])
    assert.deepEqual(out[key], f.s[key], key);
  assert.doesNotThrow(() => assertMillChargeIntegrity(f.s, out));
});

test("independiente: CAS, VIEWER, claves extra y ajustes teoricos rechazados", () => {
  const f = closed();
  const c = cmd(f.s);
  c.payload.expected_revision--;
  assert.throws(() => apply(f.s, c, f.options));
  assert.throws(() => apply(f.s, cmd(f.s), f.options, { ...actor, role: "VIEWER" }));
  const bad = cmd(f.s);
  bad.payload.service_cents = 1;
  assert.throws(() => apply(f.s, bad, f.options));
  assert.throws(() =>
    apply(
      f.s,
      cmd(f.s, "THEORETICAL", [
        { ingredient_id: f.s.productionJourneyLines[0].macro_estimate[0].ingredient_id, quantity_kg: "2" },
      ]),
      f.options,
    ),
  );
});

test("independiente: SQLite snapshot y replay exacto sin duplicados", async (t) => {
  const f = closed();
  const dir = createPrivateDirectory(join(mkdtempSync(join(tmpdir(), "nqp32-independent-")), "private"));
  const file = join(dir, "synthetic.sqlite");
  initializeDatabase(file);
  const db = openSqliteDatabase(file);
  t.after(() => db.close());
  const store = createStore(() => db, f.options);
  await store.persistState(null, f.s);
  const c = cmd(f.s);
  const result = await store.runCommand(c, { userId: actor.id });
  assert.deepEqual(await store.runCommand(c, { userId: actor.id }), result);
  const s = await store.loadState();
  assert.equal(s.corrections.filter((x) => x.entity_type === "MILL_CHARGE").length, 1);
  assert.deepEqual(s.expenses, f.s.expenses);
  const tampered = structuredClone(s);
  tampered.corrections.at(-1).new_snapshot.actual_cents++;
  await assert.rejects(store.persistState(null, tampered));
});

test("independiente: importacion rechaza auditoria cuyo payload contradice snapshot", () => {
  const f = closed();
  const out = apply(f.s, cmd(f.s), f.options).state;
  const audit = out.audit.at(-1);
  audit.payload.line_id = "otro-lote";
  audit.payload.mode = "THEORETICAL";
  audit.payload.reason = "Motivo contradictorio";
  assert.throws(() => assertMillChargeIntegrity(null, out));
});

test("independiente: legacy cambiar descuento conserva coherencia de desglose", () => {
  const f = closed();
  f.s.productions.push({ id: "legacy", status: "CONFIRMED" });
  f.s.productionIngredients.push({
    id: "legacy-ing",
    production_id: "legacy",
    ingredient_id: "ing-1",
    total_kg: 1000,
    historical_price_per_kg: 200,
    theoretical_gross_cost: 200,
    discount_amount: 0,
    theoretical_net_cost: 200,
    actual_charge: null,
    is_paid: false,
  });
  const run = (s, row) =>
    apply(
      s,
      {
        type: "PRODUCTION_RECONCILE",
        payload: {
          id: "legacy",
          reason: "Revision independiente",
          ingredients: [{ id: "legacy-ing", ...row }],
        },
      },
      f.options,
    ).state;
  const billed = run(f.s, {
    quantity_kg: "1",
    price_per_kg: "3",
    discount_amount: "0",
    actual_charge: "3",
  });
  const changed = run(billed, { discount_amount: "1", actual_charge: "3" }).productionIngredients.at(-1);
  assert.ok(
    changed.charged_grams === undefined ||
      Math.round((changed.charged_grams * changed.charged_price_cents_per_kg) / 1000) -
        changed.discount_amount ===
        changed.actual_charge,
  );
});
