import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { executeCommand } from "../lib/domain.mjs";
import { fixture, actor, identity } from "./helpers/receipt-fixture.mjs";
import { createPrivateDirectory } from "../lib/sqlite/files.mjs";
import { initializeDatabase } from "../lib/sqlite/migrations.mjs";
import { openSqliteDatabase } from "../lib/adapters/node-sqlite.mjs";
import { createStore } from "../lib/application-store.mjs";
import { microFormulaRequirement } from "../features/microinsumos/domain/formulas.mjs";
const command = (type, payload) => ({ type, payload, request_id: randomUUID() });
const draft = (family, version, dose = "0.009") =>
  command("MICRO_FORMULA_SAVE", {
    family,
    expected_version: version,
    lines: [{ micro_ingredient_id: "m1", dose_kg: dose }],
  });
const activation = (family, version, id) =>
  command("MICRO_FORMULA_ACTIVATE", { family, expected_version: version, formula_id: id });
const apply = (s, c) => executeCommand(s, c, actor);
test("independiente: activar borrador anterior, otra familia y versión publicada rechaza sin mutar", () => {
  let s = fixture();
  let a = apply(s, draft("ROSADO", 0));
  const old = a.result;
  a = apply(a.state, draft("ROSADO", 1));
  const newer = a.result;
  a = apply(a.state, activation("ROSADO", 2, newer));
  s = a.state;
  const snapshot = structuredClone(s);
  for (const c of [
    activation("ROSADO", 3, old),
    activation("ROSADO", 3, newer),
    activation("VERDE_AMARILLO", 0, newer),
  ])
    assert.throws(() => apply(s, c));
  assert.deepEqual(s, snapshot);
});
test("independiente: fracción 0.01 núcleo no redondea dosis 0.009 y no muta líneas", () => {
  const lines = [{ micro_ingredient_id: "synthetic", dose_grams: 9 }],
    before = structuredClone(lines);
  assert.deepEqual(microFormulaRequirement(lines, "0.01"), [
    { micro_ingredient_id: "synthetic", grams_hundredths: 9 },
  ]);
  assert.deepEqual(lines, before);
  assert.throws(() => microFormulaRequirement(lines, "0.001"));
});
test("independiente SQLite: cambios catálogo conservan histórico y permiten nueva versión sin inactivo", async (t) => {
  const directory = createPrivateDirectory(
    join(mkdtempSync(join(tmpdir(), "nqp24-independent-")), "private"),
  );
  const file = join(directory, "synthetic.sqlite");
  initializeDatabase(file);
  const db = openSqliteDatabase(file);
  t.after(() => db.close());
  const store = createStore(() => db);
  await store.persistState(null, fixture());
  let result = await store.runCommand(draft("ROSADO", 0), identity);
  await store.runCommand(activation("ROSADO", 1, result.result), identity);
  await store.runCommand(
    command("MICRO_SAVE", {
      id: "m1",
      operational_id: 1,
      name: "Nueva etiqueta sintética",
      is_active: false,
    }),
    identity,
  );
  result = await store.runCommand(
    command("MICRO_FORMULA_SAVE", {
      family: "ROSADO",
      expected_version: 2,
      lines: [{ micro_ingredient_id: "m2", dose_kg: "0.011" }],
    }),
    identity,
  );
  await store.runCommand(activation("ROSADO", 3, result.result), identity);
  const s = await store.loadState();
  assert.equal(s.microFormulaLines[0].name_snapshot, "Micro ficticio 1");
  assert.equal(s.microFormulaLines[0].dose_grams, 9);
  assert.equal(s.microFormulaLines[1].micro_ingredient_id, "m2");
});
test("independiente SQLite: replay activación inmutable y CAS de activaciones con único ganador", async (t) => {
  const directory = createPrivateDirectory(
    join(mkdtempSync(join(tmpdir(), "nqp24-independent-race-")), "private"),
  );
  const file = join(directory, "synthetic.sqlite");
  initializeDatabase(file);
  const db = openSqliteDatabase(file),
    db2 = openSqliteDatabase(file);
  t.after(() => {
    db.close();
    db2.close();
  });
  const a = createStore(() => db),
    b = createStore(() => db2);
  await a.persistState(null, fixture());
  const first = await a.runCommand(draft("ROSADO", 0), identity);
  const second = await a.runCommand(draft("ROSADO", 1, "0.013"), identity);
  const cmds = [activation("ROSADO", 2, first.result), activation("ROSADO", 2, second.result)];
  const results = await Promise.allSettled([
    a.runCommand(cmds[0], identity),
    b.runCommand(cmds[1], identity),
  ]);
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  const index = results.findIndex((r) => r.status === "fulfilled"),
    before = await a.loadState();
  await b.runCommand(cmds[index], identity);
  assert.deepEqual(await b.loadState(), before);
});

test("independiente SQLite: CAS de cabecera mantiene JSON y columnas concordantes aunque no cambie activa", async (t) => {
  const directory = createPrivateDirectory(
    join(mkdtempSync(join(tmpdir(), "nqp24-independent-head-")), "private"),
  );
  const file = join(directory, "synthetic.sqlite");
  initializeDatabase(file);
  const db = openSqliteDatabase(file);
  t.after(() => db.close());
  const store = createStore(() => db);
  await store.persistState(null, fixture());
  await store.runCommand(draft("ROSADO", 0), identity);
  await assert.rejects(
    db.batch([
      db.prepare(
        "UPDATE micro_formula_heads SET version=version+1, data=json_set(data,'$.version',999) WHERE family='ROSADO'",
      ),
    ]),
  );
});

test("independiente SQLite: dosis en gramos rechaza almacenamiento fraccionario", async (t) => {
  const directory = createPrivateDirectory(
    join(mkdtempSync(join(tmpdir(), "nqp24-independent-dose-")), "private"),
  );
  const file = join(directory, "synthetic.sqlite");
  initializeDatabase(file);
  const db = openSqliteDatabase(file);
  t.after(() => db.close());
  const store = createStore(() => db);
  await store.persistState(null, fixture());
  const saved = await store.runCommand(
    command("MICRO_FORMULA_SAVE", { family: "ROSADO", expected_version: 0, lines: [] }),
    identity,
  );
  const line = {
    id: "fractional-synthetic",
    formula_id: saved.result,
    micro_ingredient_id: "m1",
    dose_grams: 1.5,
  };
  await assert.rejects(
    db.batch([
      db
        .prepare(
          "INSERT INTO micro_formula_lines(id,data,formula_id,micro_ingredient_id,dose_grams) VALUES (?,?,?,?,?)",
        )
        .bind(line.id, JSON.stringify(line), line.formula_id, line.micro_ingredient_id, line.dose_grams),
    ]),
  );
});

test("independiente SQLite: identidad JSON de fórmula coincide con familia y versión SQL", async (t) => {
  const directory = createPrivateDirectory(
    join(mkdtempSync(join(tmpdir(), "nqp24-independent-identity-")), "private"),
  );
  const file = join(directory, "synthetic.sqlite");
  initializeDatabase(file);
  const db = openSqliteDatabase(file);
  t.after(() => db.close());
  const store = createStore(() => db);
  await store.persistState(null, fixture());
  const value = {
    id: "bad-synthetic",
    family: "VERDE_AMARILLO",
    version: 99,
    total_grams: 0,
    published_at: null,
    published_by: null,
  };
  await assert.rejects(
    db.batch([
      db
        .prepare("INSERT INTO micro_formulas(id,data,family,version) VALUES (?,?,?,?)")
        .bind(value.id, JSON.stringify(value), "ROSADO", 1),
    ]),
  );
});
test("independiente SQLite: publicar exige líneas y total concordante", async (t) => {
  const directory = createPrivateDirectory(
    join(mkdtempSync(join(tmpdir(), "nqp24-independent-publication-")), "private"),
  );
  const file = join(directory, "synthetic.sqlite");
  initializeDatabase(file);
  const db = openSqliteDatabase(file);
  t.after(() => db.close());
  const store = createStore(() => db);
  await store.persistState(null, fixture());
  const empty = await store.runCommand(
    command("MICRO_FORMULA_SAVE", { family: "ROSADO", expected_version: 0, lines: [] }),
    identity,
  );
  await assert.rejects(
    db.batch([
      db
        .prepare(
          "UPDATE micro_formulas SET data=json_set(data,'$.published_at','2026-11-09T00:00:00Z','$.published_by','receipt-admin') WHERE id=?",
        )
        .bind(empty.result),
    ]),
  );
  const filled = await store.runCommand(draft("ROSADO", 1), identity);
  // Formula total is immutable after creation. Direct publication should still verify sum independently.
  await assert.rejects(
    db.batch([
      db
        .prepare(
          "INSERT INTO micro_formula_lines(id,data,formula_id,micro_ingredient_id,dose_grams) VALUES (?,?,?,?,?)",
        )
        .bind(
          "extra-synthetic",
          JSON.stringify({
            id: "extra-synthetic",
            formula_id: filled.result,
            micro_ingredient_id: "m2",
            dose_grams: 7,
          }),
          filled.result,
          "m2",
          7,
        ),
      db
        .prepare(
          "UPDATE micro_formulas SET data=json_set(data,'$.published_at','2026-11-09T00:00:00Z','$.published_by','receipt-admin') WHERE id=?",
        )
        .bind(filled.result),
    ]),
  );
});
