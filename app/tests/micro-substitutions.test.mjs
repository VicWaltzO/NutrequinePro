import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  substitutionFixture,
  apply25,
  actor,
  command,
  plan,
  substitute,
  adopt,
} from "./helpers/substitution-fixture.mjs";
import { identity } from "./helpers/receipt-fixture.mjs";
import { TABLES } from "../lib/domain.mjs";
import { initializeDatabase, inspectDatabase, migrateDatabase } from "../lib/sqlite/migrations.mjs";
import { migrationCatalog } from "../lib/sqlite/schema.mjs";
import { backupDatabase, restoreDatabase } from "../lib/sqlite/recovery.mjs";
import { createPrivateDirectory } from "../lib/sqlite/files.mjs";
import { openSqliteDatabase } from "../lib/adapters/node-sqlite.mjs";
import { createStore } from "../lib/application-store.mjs";
import { CommandConflictError } from "../lib/command-replay.mjs";
import { validateSubstitutionPolicies } from "../features/microinsumos/domain/substitutions.mjs";
test("NQP25 sustituto conserva 0.01g exacto y costo null distinto de cero", () => {
  for (const unknown of [false, true]) {
    const f = substitutionFixture();
    for (const family of ["ROSADO", "VERDE_AMARILLO"]) f.policy.families[family].lines[0].dose_grams = 1;
    f.options.microSubstitutionPolicies = [f.policy];
    const opening = f.s.microOpenings.find((o) => o.micro_ingredient_id === "m3");
    opening.unit_cost_cents = unknown ? null : 0;
    opening.valuation_cents = unknown ? null : 0;
    let s = apply25(f.s, substitute(f.s), f.options).state;
    s = apply25(s, plan(s, { nuclei: "0.01" }), f.options).state;
    const id = s.microPreparations[0].id;
    s = exec(s, "MICRO_ASSIGN", { preparation_id: id, reason: "Precisión" }, f.options).state;
    const finish = () =>
      exec(
        s,
        "MICRO_PREPARATION_CONFIRM",
        { preparation_id: id, nuclei: "0.01", date: "2026-11-12" },
        f.options,
      );
    if (unknown) assert.throws(finish);
    else {
      const result = finish().state;
      assert.equal(result.microIssues.find((i) => i.micro_ingredient_id === "m3").quantity_hundredths, 1);
      assert.deepEqual(result.microConfirmations[0].total_cost_cents, { n: "1", d: "500" });
    }
  }
});
test("NQP25 upgrade0007 y restore sintéticos preservan hashes históricos", async (t) => {
  const dir = join(mkdtempSync(join(tmpdir(), "nqp25-recovery-")), "private");
  createPrivateDirectory(dir);
  const file = join(dir, "business.sqlite");
  const catalog = migrationCatalog();
  const prior = {
    ...catalog,
    migrations: catalog.migrations.slice(0, 8),
    schemas: catalog.schemas.slice(0, 9),
  };
  initializeDatabase(file, { catalog: prior });
  const db = openSqliteDatabase(file);
  t.after(() => db.close());
  const f = substitutionFixture();
  await createStore(() => db, f.options).persistState(null, f.s);
  const before = inspectDatabase(file, { catalog: prior });
  const oldBackup = join(dir, "old.sqlite");
  await backupDatabase(file, oldBackup, { catalog: prior });
  migrateDatabase(file);
  const after = inspectDatabase(file);
  for (const row of before.tables.filter((r) => r.name !== "nutrequine_migrations"))
    assert.deepEqual(
      after.tables.find((r) => r.name === row.name),
      row,
    );
  const store = createStore(() => db, f.options);
  const state = await store.loadState();
  await store.runCommand(substitute(state), identity);
  const backup = join(dir, "new.sqlite"),
    restored = join(dir, "restored.sqlite");
  await backupDatabase(file, backup);
  await restoreDatabase(backup, restored);
  assert.deepEqual(inspectDatabase(restored).tables, inspectDatabase(file).tables);
  const rollback = join(dir, "rollback.sqlite");
  await restoreDatabase(oldBackup, rollback, { catalog: prior });
  assert.equal(inspectDatabase(rollback, { catalog: prior }).version, 8);
});
const exec = (s, type, p, options) =>
  apply25(s, command(type, { ...p, expected_revision: s.revision }), options);

test("NQP25 dos familias nuevas, aprobación exacta, OPERATOR y cero consumos implícitos", () => {
  const { s, options } = substitutionFixture();
  const old = structuredClone(s);
  const n = apply25(s, substitute(s), options, { ...actor, role: "OPERATOR" }).state;
  assert.equal(n.microFormulas.length, 4);
  assert.equal(n.microSubstitutions.length, 1);
  assert.deepEqual(n.microFormulas.slice(0, 2), s.microFormulas);
  assert.deepEqual(n.microFormulaLines.slice(0, 4), s.microFormulaLines);
  for (const family of ["ROSADO", "VERDE_AMARILLO"]) {
    const id = n.microFormulaHeads.find((h) => h.family === family).active_formula_id;
    assert.equal(
      n.microFormulaLines.find((l) => l.formula_id === id && l.micro_ingredient_id === "m3").dose_grams,
      family === "ROSADO" ? 137 : 71,
    );
  }
  for (const table of TABLES.filter(
    (t) =>
      !["microFormulas", "microFormulaHeads", "microFormulaLines", "microSubstitutions", "audit"].includes(t),
  ))
    assert.deepEqual(n[table], old[table], table);
  assert.throws(() => apply25(n, substitute(n), options), /ya fue/);
});
test("NQP25 sin aprobación, dosis inválidas, identidades, inactivos, VIEWER y revisión obsoleta", () => {
  const { s, options, policy } = substitutionFixture();
  assert.throws(() => apply25(s, substitute(s), {}), /sin autorización/);
  assert.throws(() => apply25(s, substitute(s), options, { ...actor, role: "VIEWER" }), /consultar/);
  for (const change of [
    (p) => (p.to_ingredient_id = p.from_ingredient_id),
    (p) => delete p.families.ROSADO,
    (p) => (p.families.ROSADO.lines[0].dose_grams = 0),
    (p) => (p.families.ROSADO.lines[0].dose_grams = 0.1),
  ]) {
    const p = structuredClone(policy);
    change(p);
    assert.throws(() => validateSubstitutionPolicies([p]));
  }
  const altered = structuredClone(options);
  altered.microSubstitutionPolicies[0].families.ROSADO.lines[1].dose_grams = 2;
  assert.throws(() => apply25(s, substitute(s), altered), /otros ingredientes/);
  const inactive = structuredClone(s);
  inactive.microIngredients.find((m) => m.id === "m3").is_active = false;
  assert.throws(() => apply25(inactive, substitute(inactive), options), /inactivo/);
  const c = substitute(s);
  c.payload.expected_revision--;
  assert.throws(() => apply25(s, c, options), /cambiaron/);
});
test("NQP25 consumo mixto10+10 con dos ISSUE y costos históricos inmutables", () => {
  const { s: initial, options } = substitutionFixture();
  let s = apply25(initial, plan(initial), options).state;
  const a = s.microPreparations[0].id;
  s = exec(
    s,
    "MICRO_GROUP_LINK",
    { preparation_id: a, group_reference: "TANDA-25", reason: "Grupo A" },
    options,
  ).state;
  s = exec(s, "MICRO_ASSIGN", { preparation_id: a, reason: "A" }, options).state;
  s = exec(
    s,
    "MICRO_PREPARATION_CONFIRM",
    { preparation_id: a, nuclei: "10", date: "2026-11-12" },
    options,
  ).state;
  const history = JSON.stringify([s.microConfirmations, s.microIssues]);
  s = apply25(s, substitute(s), options).state;
  s = apply25(s, plan(s, { nuclei: "10" }), options).state;
  const b = s.microPreparations.at(-1).id;
  s = exec(
    s,
    "MICRO_GROUP_LINK",
    { preparation_id: b, group_reference: "TANDA-25", reason: "Grupo B" },
    options,
  ).state;
  s = exec(s, "MICRO_ASSIGN", { preparation_id: b, reason: "B" }, options).state;
  s = exec(
    s,
    "MICRO_PREPARATION_CONFIRM",
    { preparation_id: b, nuclei: "10", date: "2026-11-12" },
    options,
  ).state;
  assert.equal(s.microIssues.find((i) => i.micro_ingredient_id === "m1").quantity_hundredths, 300000);
  assert.equal(s.microIssues.find((i) => i.micro_ingredient_id === "m3").quantity_hundredths, 137000);
  assert.deepEqual(s.microConfirmations[0].total_cost_cents, { n: "602", d: "1" });
  assert.deepEqual(s.microConfirmations[1].total_cost_cents, { n: "687", d: "1" });
  assert.equal(JSON.stringify([s.microConfirmations.slice(0, 1), s.microIssues.slice(0, 2)]), history);
  assert.equal(s.microPreparationGroups.filter((g) => g.group_reference === "TANDA-25").length, 2);
  assert.throws(
    () =>
      exec(s, "MICRO_PREPARATION_CONFIRM", { preparation_id: a, nuclei: "10", date: "2026-11-12" }, options),
    /cerrada/,
  );
  assert.throws(() => apply25(s, adopt(s, a), options), /cerrada/);
});
test("NQP25 pendiente requiere consentimiento; libera una vez y original no ejecutable", () => {
  const { s: initial, options } = substitutionFixture();
  let s = apply25(initial, plan(initial), options).state;
  const a = s.microPreparations[0].id;
  s = exec(s, "MICRO_ASSIGN", { preparation_id: a, reason: "A" }, options).state;
  s = apply25(s, substitute(s), options).state;
  const original = JSON.stringify(s.microPreparations[0]);
  assert.throws(() => apply25(s, adopt(s, a, { consent: false }), options), /consentimiento/);
  assert.equal(s.microPreparations.length, 1);
  s = apply25(s, adopt(s, a), options, { ...actor, role: "OPERATOR" }).state;
  assert.equal(JSON.stringify(s.microPreparations[0]), original);
  assert.equal(s.microPreparations.length, 2);
  assert.equal(s.microAssignmentReversals.length, 1);
  assert.equal(s.microIssues.length, 0);
  assert.throws(
    () => exec(s, "MICRO_ASSIGN", { preparation_id: a, reason: "doble" }, options),
    /supersedida/,
  );
  assert.throws(
    () =>
      exec(s, "MICRO_PREPARATION_CONFIRM", { preparation_id: a, nuclei: "10", date: "2026-11-12" }, options),
    /supersedida/,
  );
  assert.throws(() => apply25(s, adopt(s, a), options), /supersedida/);
  const b = s.microSupersessions[0].target_id;
  s = exec(s, "MICRO_ASSIGN", { preparation_id: b, reason: "Sucesora" }, options).state;
  assert.equal(s.microAssignmentReversals.length, 1);
});
test("NQP25 SQLite atómico, CAS dos conexiones, replay actor/payload, SQL inmutable", async (t) => {
  const dir = join(mkdtempSync(join(tmpdir(), "nqp25-")), "private");
  createPrivateDirectory(dir);
  const file = join(dir, "business.sqlite");
  initializeDatabase(file);
  const db = openSqliteDatabase(file);
  t.after(() => db.close());
  const f = substitutionFixture();
  const store = createStore(() => db, f.options);
  f.s.users.push({
    ...actor,
    id: "second-operator-25",
    name: "Segundo operador sintético",
    role: "OPERATOR",
  });
  await store.persistState(null, f.s);
  const other = openSqliteDatabase(file);
  t.after(() => other.close());
  const store2 = createStore(() => other, f.options);
  const cmd = substitute(f.s);
  const before = await store2.loadState();
  const winner = await store.runCommand(cmd, identity);
  await assert.rejects(
    () => store2.persistState(before, apply25(before, substitute(before), f.options).state),
    /operación|guard/,
  );
  const replay = await store.runCommand(cmd, identity);
  assert.equal(replay.result, winner.result);
  await assert.rejects(
    () => store.runCommand(cmd, { userId: "second-operator-25", displayName: "Segundo operador sintético" }),
    (error) => error instanceof CommandConflictError,
  );
  await assert.rejects(
    () => store.runCommand({ ...cmd, payload: { ...cmd.payload, reason: "otro" } }, identity),
    /identificador/,
  );
  await assert.rejects(() => db.batch([db.prepare("UPDATE micro_substitutions SET data=data")]), /Immutable/);
  const c = plan(winner.state);
  const order = await store.runCommand(c, identity);
  assert.equal(order.state.microPreparations.length, 1);
  const bad = structuredClone(order.state);
  bad.microPreparationGroups.push({
    id: "bad",
    preparation_id: "absent",
    group_reference: "X",
    reason: "test",
    created_by: actor.id,
    created_at: "now",
    request_id: "bad",
  });
  bad.revision++;
  await assert.rejects(() => store.persistState(order.state, bad));
  assert.equal((await store.loadState()).revision, order.state.revision);
  assert.equal(inspectDatabase(file).status, "managed");
});
