import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { needsInitialAdoption, schemaQuery } from "../scripts/local-migration-plan.mjs";

const name = "0000_nervous_silver_fox.sql";
const sql = readFileSync(new URL(`../drizzle/${name}`, import.meta.url), "utf8");

test("base vacía deja que Wrangler aplique la migración inicial", () => {
  assert.equal(
    needsInitialAdoption(
      [{ type: "table", name: "_cf_METADATA", sql: "CREATE TABLE _cf_METADATA (key INTEGER)" }],
      sql,
      [],
      name,
    ),
    false,
  );
});

test("reconoce la importación manual completa sin cambiar sus datos", () => {
  const db = new DatabaseSync(":memory:");
  try {
    db.exec(sql);
    db.prepare("INSERT INTO customers (id, data) VALUES (?, ?)").run(
      "existing",
      '{"name":"Cliente existente"}',
    );
    assert.equal(needsInitialAdoption(db.prepare(schemaQuery).all(), sql, [], name), true);
    assert.equal(
      db.prepare("SELECT data FROM customers WHERE id = ?").get("existing").data,
      '{"name":"Cliente existente"}',
    );
    assert.equal(needsInitialAdoption(db.prepare(schemaQuery).all(), sql, [name], name), false);
  } finally {
    db.close();
  }
});

test("rechaza una importación parcial o columnas distintas sin adoptar la migración", () => {
  const db = new DatabaseSync(":memory:");
  try {
    db.exec("CREATE TABLE settings (id TEXT PRIMARY KEY, data TEXT)");
    assert.throws(
      () => needsInitialAdoption(db.prepare(schemaQuery).all(), sql, [], name),
      /esquema incompleto/,
    );
    db.exec("DROP TABLE settings");
    db.exec(sql);
    db.exec("ALTER TABLE customers ADD COLUMN unexpected TEXT");
    assert.throws(
      () => needsInitialAdoption(db.prepare(schemaQuery).all(), sql, [], name),
      /esquema incompleto/,
    );
  } finally {
    db.close();
  }
});

test("una base con historial continúa con las migraciones posteriores", () => {
  const db = new DatabaseSync(":memory:");
  try {
    db.exec(sql);
    db.exec("ALTER TABLE customers ADD COLUMN future_column TEXT");
    assert.equal(needsInitialAdoption(db.prepare(schemaQuery).all(), sql, [name], name), false);
  } finally {
    db.close();
  }
});

test("la adopción rechaza índices faltantes y no modifica los registros", () => {
  const db = new DatabaseSync(":memory:");
  try {
    db.exec(sql);
    db.prepare("INSERT INTO customers (id, data) VALUES (?, ?)").run(
      "existing",
      '{"name":"Cliente existente"}',
    );
    const index = db
      .prepare(schemaQuery)
      .all()
      .find((row) => row.type === "index");
    assert.ok(index);
    db.exec(`DROP INDEX "${index.name.replaceAll('"', '""')}"`);
    assert.throws(
      () => needsInitialAdoption(db.prepare(schemaQuery).all(), sql, [], name),
      /esquema incompleto/,
    );
    assert.equal(
      db.prepare("SELECT data FROM customers WHERE id = ?").get("existing").data,
      '{"name":"Cliente existente"}',
    );
  } finally {
    db.close();
  }
});
