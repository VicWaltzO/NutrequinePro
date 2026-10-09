import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { migrationPreparation, localD1 } from "../scripts/local-database.mjs";

const files = ["0000_nervous_silver_fox.sql"];
function schema() {
  const database = new DatabaseSync(":memory:");
  try {
    database.exec(readFileSync(new URL("../drizzle/" + files[0], import.meta.url), "utf8"));
    return database.prepare("SELECT name, sql FROM sqlite_schema WHERE type='table' ORDER BY name").all();
  } finally {
    database.close();
  }
}

test("D1 vacío aplica migración y una base histórica completa se reconoce sin repetirla", () => {
  const initial = schema();
  assert.deepEqual(migrationPreparation([], initial, [], files), { adopt: false, pending: files });
  assert.deepEqual(migrationPreparation(initial, initial, [], files), { adopt: true, pending: [] });
  assert.equal(localD1.binding, "DB");
  assert.equal(localD1.database_id, "00000000-0000-4000-8000-000000000000");
});

test("D1 bloquea esquema parcial o distinto sin planificar escrituras destructivas", () => {
  const initial = schema();
  assert.throws(() => migrationPreparation(initial.slice(1), initial, [], files), /parcial/);
  const changed = initial.map((row) =>
    row.name === "settings" ? { ...row, sql: "CREATE TABLE settings (id text)" } : row,
  );
  assert.throws(() => migrationPreparation(changed, initial, [], files), /desconocido/);
});

test("D1 solo aplica migraciones pendientes y rechaza historiales ajenos o sin esquema", () => {
  const initial = schema();
  assert.deepEqual(migrationPreparation(initial, initial, files, [...files, "0001_future.sql"]), {
    adopt: false,
    pending: ["0001_future.sql"],
  });
  assert.deepEqual(migrationPreparation(initial, initial, files, files), { adopt: false, pending: [] });
  assert.throws(() => migrationPreparation(initial, initial, ["unknown.sql"], files), /historial/);
  assert.throws(() => migrationPreparation([], initial, files, files), /sin esquema/);
});
