import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { seedState, executeCommand, TABLES } from "../lib/domain.mjs";
import { createStore } from "../lib/application-store.mjs";
import { initializeDatabase, inspectDatabase } from "../lib/sqlite/migrations.mjs";
import { createPrivateDirectory } from "../lib/sqlite/files.mjs";
import { openSqliteDatabase } from "../lib/adapters/node-sqlite.mjs";
import {
  evaluatePreparation,
  validatePreparationPolicies,
} from "../features/microinsumos/domain/preparations.mjs";

const actor = { id: "independent-admin26", name: "Revisor sintético", role: "ADMIN", is_active: true };
const identity = { userId: actor.id, displayName: actor.name };
const command = (type, payload) => ({ type, payload, request_id: randomUUID() });
function initial() {
  const s = seedState();
  s.users = [actor, { ...actor, id: "independent-operator26", role: "OPERATOR" }];
  s.microIngredients = [1, 2].map((n) => ({
    id: `review-m${n}`,
    operational_id: n,
    name: `Micro sintético revisión ${n}`,
    unit: "KG",
    known_price_per_kg: null,
    is_active: true,
  }));
  s.microOpenings = s.microIngredients.map((m, n) => ({
    id: `review-o${n}`,
    micro_ingredient_id: m.id,
    quantity_grams: 0,
    cutoff_date: "2026-10-01",
    unit_cost_cents: null,
    valuation_cents: null,
    version: 1,
  }));
  return s;
}
function recipe(s, family = "ROSADO", dose = "0.001") {
  const version = s.microFormulaHeads.find((h) => h.family === family)?.version ?? 0;
  const draft = executeCommand(
    s,
    command("MICRO_FORMULA_SAVE", {
      family,
      expected_version: version,
      lines: [{ micro_ingredient_id: "review-m1", dose_kg: dose }],
    }),
    actor,
  );
  return executeCommand(
    draft.state,
    command("MICRO_FORMULA_ACTIVATE", { family, expected_version: version + 1, formula_id: draft.result }),
    actor,
  );
}
function policy(s, id) {
  const f = s.microFormulas.find((row) => row.id === id);
  return {
    formula_id: id,
    family: f.family,
    reference: "REVISION-SINTETICA-26",
    lines: s.microFormulaLines
      .filter((l) => l.formula_id === id)
      .map(({ micro_ingredient_id, dose_grams }) => ({ micro_ingredient_id, dose_grams })),
  };
}
function plan(s, formula_id, extra = {}) {
  return command("MICRO_PREPARATION_CREATE", {
    family: s.microFormulas.find((f) => f.id === formula_id)?.family ?? "ROSADO",
    formula_id,
    nuclei: "0.01",
    date: "2026-11-09",
    expected_revision: s.revision,
    ...extra,
  });
}

test("review26: una centésima de gramo no desaparece y ningún historial cambia", () => {
  const ready = recipe(initial());
  const before = structuredClone(ready.state);
  const next = executeCommand(before, plan(before, ready.result), actor, undefined, {
    microPreparationPolicies: [policy(before, ready.result)],
  });
  const order = next.state.microPreparations[0];
  assert.equal(order.nuclei_hundredths, 1);
  assert.equal(order.status, "PENDING");
  const evaluation = evaluatePreparation(next.state, order, "2026-11-09T00:00:00Z");
  assert.equal(evaluation.items[0].required_hundredths, 1);
  assert.equal(evaluation.items[0].missing_hundredths, 1);
  assert.equal(evaluation.sufficiency, "MISSING");
  for (const table of TABLES.filter((t) => !["microPreparations", "audit"].includes(t)))
    assert.deepEqual(next.state[table], before[table], table);
  assert.deepEqual(ready.state, before);
});

test("review26: libro con eventos precede apertura; histórico no aporta disponibilidad", () => {
  const r = recipe(initial(), "VERDE_AMARILLO", "0.251");
  const s = r.state;
  s.microOpenings[0].quantity_grams = 5000;
  s.microPurchases.push({ id: "economic-only", status: "CONFIRMED" });
  s.microPurchaseLines.push({
    id: "economic-only-line",
    purchase_id: "economic-only",
    micro_ingredient_id: "review-m1",
    quantity_grams: 25000,
  });
  s.microLedgers.push({
    id: "current-ledger",
    micro_ingredient_id: "review-m1",
    ledger: { quantity_grams: 2, events: [{ type: "RECEIPT" }] },
  });
  const p = executeCommand(s, plan(s, r.result, { nuclei: "20" }), actor, undefined, {
    microPreparationPolicies: [policy(s, r.result)],
  });
  const e = evaluatePreparation(p.state, p.state.microPreparations[0], "2026-11-09T00:00:00Z");
  assert.deepEqual(
    [
      e.items[0].required_hundredths,
      e.items[0].available_hundredths,
      e.items[0].missing_hundredths,
      e.items[0].stock_source,
    ],
    [502000, 200, 501800, "LEDGER"],
  );
});

test("review26: apertura máxima válida se convierte sin desbordar ni bloquear consulta", () => {
  const r = recipe(initial());
  r.state.microOpenings[0].quantity_grams = 1000000000000;
  const p = executeCommand(r.state, plan(r.state, r.result), actor, undefined, {
    microPreparationPolicies: [policy(r.state, r.result)],
  });
  const e = evaluatePreparation(p.state, p.state.microPreparations[0], "2026-11-09T00:00:00Z");
  assert.equal(e.items[0].available_hundredths, 100000000000000);
  assert.equal(e.items[0].missing_hundredths, 0);
});

test("review26: autorización privada es conjunto exacto y no se admite desde payload", () => {
  const r = recipe(initial());
  const approved = policy(r.state, r.result);
  for (const policies of [
    [],
    [{ ...approved, lines: [] }],
    [{ ...approved, lines: [{ micro_ingredient_id: "review-m1", dose_grams: 2 }] }],
    [{ ...approved, family: "VERDE_AMARILLO" }],
    [{ ...approved, formula_id: "nonexistent" }],
  ]) {
    assert.throws(() =>
      executeCommand(r.state, plan(r.state, r.result), actor, undefined, {
        microPreparationPolicies: policies,
      }),
    );
  }
  assert.throws(() =>
    executeCommand(
      r.state,
      plan(r.state, r.result, { authorization_reference: "forged", microPreparationPolicies: [approved] }),
      actor,
      undefined,
      { microPreparationPolicies: [approved] },
    ),
  );
  assert.throws(() =>
    validatePreparationPolicies([{ ...approved, lines: [...approved.lines, ...approved.lines] }]),
  );
  assert.throws(() => validatePreparationPolicies([approved, approved]));
});

test("review26: dos intenciones compiten sin reservar y conservan receta al cambiar activa", () => {
  const r = recipe(initial(), "ROSADO", "0.251");
  let s = r.state;
  s.microOpenings[0].quantity_grams = 5020;
  const options = { microPreparationPolicies: [policy(s, r.result)] };
  s = executeCommand(s, plan(s, r.result, { nuclei: "20" }), actor, undefined, options).state;
  s = executeCommand(s, plan(s, r.result, { nuclei: "20" }), actor, undefined, options).state;
  assert.equal(s.microPreparations.length, 2);
  assert.equal(s.microOpenings[0].quantity_grams, 5020);
  for (const order of s.microPreparations)
    assert.equal(evaluatePreparation(s, order, "now").sufficiency, "POTENTIALLY_RESUMABLE");
  const next = recipe(s, "ROSADO", "0.811");
  for (const order of next.state.microPreparations) {
    assert.equal(order.formula_id, r.result);
    assert.equal(evaluatePreparation(next.state, order, "later").items[0].required_hundredths, 502000);
  }
  assert.throws(
    () => executeCommand(next.state, plan(next.state, r.result), actor, undefined, options),
    /activa/,
  );
  assert.throws(
    () => executeCommand(next.state, plan(next.state, next.result), actor, undefined, options),
    /política/,
  );
});

async function databaseFixture(t) {
  const root = createPrivateDirectory(join(mkdtempSync(join(tmpdir(), "nqp26-review-")), "private"));
  const file = join(root, "synthetic.sqlite");
  initializeDatabase(file);
  const db = openSqliteDatabase(file);
  t.after(() => db.close());
  const base = createStore(() => db);
  await base.persistState(null, initial());
  const draft = await base.runCommand(
    command("MICRO_FORMULA_SAVE", {
      family: "ROSADO",
      expected_version: 0,
      lines: [{ micro_ingredient_id: "review-m1", dose_kg: "0.017" }],
    }),
    identity,
  );
  const active = await base.runCommand(
    command("MICRO_FORMULA_ACTIVATE", { family: "ROSADO", expected_version: 1, formula_id: draft.result }),
    identity,
  );
  const options = { microPreparationPolicies: [policy(active.state, draft.result)] };
  return { root, file, db, id: draft.result, store: createStore(() => db, options), options };
}

test("review26 SQLite: replay canónico, actor distinto, doble conexión y revisión esperada", async (t) => {
  const f = await databaseFixture(t);
  const s = await f.store.loadState();
  const c = plan(s, f.id);
  const first = await f.store.runCommand(c, identity);
  const reordered = { ...c, payload: Object.fromEntries(Object.entries(c.payload).reverse()) };
  assert.equal((await f.store.runCommand(reordered, identity)).result, first.result);
  await assert.rejects(f.store.runCommand({ ...c, payload: { ...c.payload, nuclei: "0.02" } }, identity));
  await assert.rejects(f.store.runCommand(c, { userId: "independent-operator26", displayName: "Otro" }));
  const secondConnection = openSqliteDatabase(f.file);
  t.after(() => secondConnection.close());
  const other = createStore(() => secondConnection, f.options);
  const before = await f.store.loadState();
  const race = await Promise.allSettled([
    f.store.runCommand(plan(before, f.id), identity),
    other.runCommand(plan(before, f.id), identity),
  ]);
  assert.equal(race.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal((await f.store.loadState()).microPreparations.length, 2);
});

test("review26 SQLite: integridad de identidad, estado inmutable y rollback tardío", async (t) => {
  const f = await databaseFixture(t);
  const s = await f.store.loadState();
  await f.store.runCommand(plan(s, f.id), identity);
  const before = await f.store.loadState();
  for (const sql of [
    "UPDATE micro_preparations SET nuclei_hundredths=2",
    "DELETE FROM micro_preparations",
    "UPDATE micro_preparations SET data=json_set(data,'$.status','COMPLETED')",
  ])
    await assert.rejects(f.db.batch([f.db.prepare(sql)]));
  const valid = executeCommand(before, plan(before, f.id), actor, undefined, f.options).state;
  valid.correctionFields.push({
    id: randomUUID(),
    correction_id: "late-invalid-fk",
    field_name: "synthetic",
  });
  await assert.rejects(f.store.persistState(before, valid), /FOREIGN KEY/);
  assert.deepEqual(await f.store.loadState(), before);
  assert.equal(inspectDatabase(f.file).pending.length, 0);
});

test("review26 SQLite: inserciones directas rechazan datos divergentes, estado y fecha inválidos", async (t) => {
  const f = await databaseFixture(t);
  const s = await f.store.loadState();
  const planned = executeCommand(s, plan(s, f.id), actor, undefined, f.options).state.microPreparations.at(
    -1,
  );
  for (const delta of [
    { id: "divergent-json" },
    { status: "COMPLETED" },
    { nuclei_hundredths: 0 },
    { family: "VERDE_AMARILLO" },
    { request_id: "" },
    { created_by: "forged-actor" },
    { date: "2026-02-30" },
    { authorization_reference: "" },
  ]) {
    const row = { ...planned, id: randomUUID(), request_id: randomUUID() };
    const json = { ...row, ...delta };
    await assert.rejects(
      f.db.batch([
        f.db
          .prepare(
            "INSERT INTO micro_preparations(id,data,formula_id,request_id,family,nuclei_hundredths) VALUES (?,?,?,?,?,?)",
          )
          .bind(
            row.id,
            JSON.stringify(json),
            row.formula_id,
            row.request_id,
            row.family,
            row.nuclei_hundredths,
          ),
      ]),
    );
  }
  assert.deepEqual(await f.store.loadState(), s);
});
