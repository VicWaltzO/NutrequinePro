import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { originalCompanyCatalog, planCompanyCatalog, catalogTables } from "../lib/company-catalog.mjs";
import { emptyState, seedState } from "../lib/seed-state.mjs";
import { writePlan } from "../lib/persistence.mjs";
import { createPrivateDirectory, openAdministration, selectedFile } from "../lib/sqlite/files.mjs";
import { initializeDatabase, inspectDatabase } from "../lib/sqlite/migrations.mjs";
import {
  previewCompanyCatalog,
  saveCatalogPreview,
  applyCompanyCatalog,
} from "../lib/sqlite/company-catalog.mjs";
import { verifyBackup } from "../lib/sqlite/recovery.mjs";
import { cashCreditScenario, productionPayload, regressionFixture } from "./helpers/regression-scenarios.mjs";

const actor = { id: "catalog-admin", name: "Administrador de prueba", role: "ADMIN", is_active: true };

function fixture(t, state = emptyState()) {
  const root = mkdtempSync(join(tmpdir(), "nutrequine-catalog-test-"));
  const directory = createPrivateDirectory(join(root, "private"));
  const filename = join(directory, "business.sqlite");
  initializeDatabase(filename);
  const { database } = openAdministration(filename, { write: true });
  t.after(() => {
    if (database.isOpen) database.close();
  });
  if (!state.users.some((user) => user.id === actor.id)) state.users.push(actor);
  for (const statement of writePlan(null, state)) database.prepare(statement.sql).run(...statement.args);
  const plan = join(directory, "preview.json");
  const backup = join(directory, "before.sqlite");
  return {
    filename,
    database,
    directory,
    plan,
    backup,
    preview: () => saveCatalogPreview(filename, actor.id, plan),
    apply: () => applyCompanyCatalog(filename, plan, backup),
  };
}

test("el catálogo empresarial coincide exactamente con los productos, precios y fórmulas de la especificación", () => {
  const catalog = originalCompanyCatalog();
  const specification = readFileSync(
    new URL("../docs/ESPECIFICACION_MAESTRA_MVP.md", import.meta.url),
    "utf8",
  );
  assert.deepEqual(Object.keys(catalog), catalogTables);
  assert.deepEqual(
    catalog.products.map((p) => [
      p.name,
      p.default_sale_price,
      p.standard_bag_weight_kg,
      p.bags_per_nucleus,
      p.commercial_weight_per_nucleus_kg,
      p.is_sellable,
      p.image,
    ]),
    [
      ["Potripregnant", 7300, 25000, 40, 1000000, true, "potripregnant"],
      ["Hi-Performance", 6700, 25000, 40, 1000000, true, "hi-performance"],
      ["Nutrelin Adulto", 6900, 25000, 40, 1000000, true, "nutrelin"],
      ["BASE", 0, 50000, 30, 1500000, false, null],
    ],
  );
  const priceSection = specification
    .split("Precios actuales conocidos:")[1]
    .split("Estos valores son editables.")[0];
  const prices = [...priceSection.matchAll(/^\| ([^|]+) \| ([\d.]+) \|$/gm)].map((m) => [
    m[1],
    Math.round(Number(m[2]) * 100),
  ]);
  assert.deepEqual(
    catalog.ingredients.map((i) => [i.name, i.current_price_per_kg]),
    prices,
  );
  const totals = [];
  for (const [index, formula] of catalog.formulas.entries()) {
    const section = specification.split(`## 8.${index + 1} `)[1].split(/\n(?:## |# )/)[0];
    const quantities = [...section.matchAll(/^\| ([^|]+) \| (\d+) \|$/gm)].map((m) => [
      m[1],
      Number(m[2]) * 1000,
    ]);
    const actual = catalog.formulaIngredients
      .filter((line) => line.formula_id === formula.id)
      .map((line) => [
        catalog.ingredients.find((i) => i.id === line.ingredient_id).name,
        line.kg_per_nucleus,
      ]);
    assert.deepEqual(actual, quantities);
    totals.push(actual.reduce((sum, row) => sum + row[1], 0));
  }
  assert.deepEqual(totals, [988000, 985000, 991000, 1501000]);
  assert.equal(catalog.formulaIngredients.length, 40);
  assert.deepEqual(
    catalog.sites.map((site) => [site.id, site.name]),
    [
      ["site-1", "Lima Polo Club"],
      ["site-2", "Quilmaná"],
      ["site-3", "Club Hípico Villa"],
      ["site-4", "Hipódromo"],
      ["site-5", "Rancho Los Caballos"],
    ],
  );
});

test("vista previa sin escrituras, respaldo exacto, importación atómica e idempotencia en disco", async (t) => {
  const f = fixture(t);
  const before = inspectDatabase(f.filename);
  const preview = f.preview();
  assert.deepEqual(preview.summary, {
    products: 4,
    ingredients: 10,
    sites: 5,
    formulas: 4,
    formulaIngredients: 40,
  });
  assert.deepEqual(inspectDatabase(f.filename), before);
  assert.equal(existsSync(f.backup), false);
  const result = await f.apply();
  assert.equal(result.status, "applied");
  assert.deepEqual(verifyBackup(f.backup).snapshot, before);
  const after = inspectDatabase(f.filename);
  const original = originalCompanyCatalog();
  for (const table of catalogTables) {
    const name = table === "formulaIngredients" ? "formula_ingredients" : table;
    const rows = f.database
      .prepare(`SELECT data FROM ${name} ORDER BY id`)
      .all()
      .map((row) => JSON.parse(row.data));
    assert.deepEqual(
      rows,
      original[table].toSorted((a, b) => a.id.localeCompare(b.id)),
    );
  }
  assert.equal(after.revision, 1);
  for (const table of before.tables.filter(
    (row) =>
      !["products", "ingredients", "sites", "formulas", "formula_ingredients", "audit", "settings"].includes(
        row.name,
      ),
  ))
    assert.deepEqual(
      after.tables.find((row) => row.name === table.name),
      table,
    );
  assert.equal(f.database.prepare("SELECT count(*) AS n FROM audit").get().n, 1);
  assert.equal((await f.apply()).status, "unchanged");
  assert.deepEqual(inspectDatabase(f.filename), after);
  const next = join(f.directory, "second-preview.json");
  saveCatalogPreview(f.filename, actor.id, next);
  const unusedBackup = join(f.directory, "must-not-exist.sqlite");
  assert.equal((await applyCompanyCatalog(f.filename, next, unusedBackup)).status, "unchanged");
  assert.equal(existsSync(unusedBackup), false);
});

test("precios editados, versiones nuevas y líneas parcialmente modificadas permanecen intactos", async (t) => {
  const state = seedState();
  state.products[0].default_sale_price = 9999;
  state.ingredients[0].current_price_per_kg = 321;
  state.formulaIngredients[0].kg_per_nucleus = 123456;
  state.formulas.push({ ...state.formulas[1], id: "admin-formula-v2", version: 2 });
  state.formulaIngredients = state.formulaIngredients.filter((line) => line.id !== "fi-3-1");
  const f = fixture(t, state);
  const before = inspectDatabase(f.filename);
  const preview = f.preview();
  assert.equal(preview.entries.find((row) => row.id === "prod-1").status, "preserved");
  assert.equal(preview.entries.find((row) => row.id === "formula-3-1").status, "preserved");
  assert.equal((await f.apply()).status, "unchanged");
  assert.deepEqual(inspectDatabase(f.filename), before);
});

test("colisiones de nombres e IDs y dependencias ambiguas nunca crean duplicados ni fórmulas parciales", () => {
  const state = emptyState();
  const catalog = originalCompanyCatalog();
  state.products.push({ ...catalog.products[0], id: "admin-product" });
  state.ingredients.push({ ...catalog.ingredients[0], name: "Otro insumo administrado" });
  const plan = planCompanyCatalog(state);
  assert.equal(
    plan.inserts.products.some((row) => row.name === "Potripregnant"),
    false,
  );
  assert.equal(
    plan.inserts.ingredients.some((row) => row.id === "ing-1"),
    false,
  );
  assert.equal(plan.inserts.formulas.length, 0);
  assert.equal(plan.inserts.formulaIngredients.length, 0);
  assert.ok(plan.entries.some((row) => row.status === "conflict"));
});

test("datos operativos, configuración, usuarios e historial preexistentes se conservan byte por byte", async (t) => {
  const state = emptyState();
  state.customers.push({ id: "existing-customer", name: "Cliente de prueba conservado" });
  state.expenses.push({ id: "existing-expense", amount: 17, description: "Registro de prueba conservado" });
  state.audit.push({ id: "existing-audit", action: "EXPENSE_CREATE", payload: { amount: 17 } });
  const f = fixture(t, state);
  const before = f.database.prepare("SELECT id,data FROM audit").all();
  const config = f.database.prepare("SELECT data FROM settings").get().data;
  f.preview();
  await f.apply();
  assert.deepEqual(f.database.prepare("SELECT id,data FROM audit WHERE id='existing-audit'").all(), before);
  assert.equal(f.database.prepare("SELECT data FROM settings").get().data, config);
  assert.equal(f.database.prepare("SELECT data FROM expenses").get().data, JSON.stringify(state.expenses[0]));
  assert.equal(
    f.database.prepare("SELECT data FROM customers").get().data,
    JSON.stringify(state.customers[0]),
  );
});

test("vista previa obsoleta o alterada y destinos de respaldo existentes impiden la escritura", async (t) => {
  const f = fixture(t);
  f.preview();
  const initial = inspectDatabase(f.filename);
  const altered = JSON.parse(readFileSync(f.plan, "utf8"));
  altered.inserts.products[0].default_sale_price = 1;
  writeFileSync(f.plan, JSON.stringify(altered));
  await assert.rejects(f.apply(), /alterada|obsoleta/);
  assert.deepEqual(inspectDatabase(f.filename), initial);
  assert.equal(existsSync(f.backup), false);
  writeFileSync(f.plan, JSON.stringify(previewCompanyCatalog(f.filename, actor.id)));
  selectedFile(f.backup, { create: true });
  await assert.rejects(f.apply(), /EEXIST/);
  assert.deepEqual(inspectDatabase(f.filename), initial);
  f.database.prepare("UPDATE settings SET revision=revision+1 WHERE id='company'").run();
  await assert.rejects(f.apply(), /obsoleta/);
  assert.equal(f.database.prepare("SELECT count(*) AS n FROM products").get().n, 0);
});

test("fallo SQL intermedio hace rollback completo y conserva el respaldo verificado", async (t) => {
  const f = fixture(t);
  f.preview();
  const before = inspectDatabase(f.filename);
  const prepare = DatabaseSync.prototype.prepare;
  const mock = t.mock.method(DatabaseSync.prototype, "prepare", function (sql) {
    const statement = prepare.call(this, sql);
    if (sql.startsWith("INSERT INTO formulas "))
      return {
        run() {
          throw new Error("Fallo SQL inyectado después de insertar maestros");
        },
      };
    return statement;
  });
  await assert.rejects(f.apply(), /Fallo SQL inyectado/);
  mock.mock.restore();
  assert.deepEqual(inspectDatabase(f.filename), before);
  assert.deepEqual(verifyBackup(f.backup).snapshot, before);
});

test("cambios entre respaldo y BEGIN IMMEDIATE se detectan sin importar un plan antiguo", async (t) => {
  const f = fixture(t);
  f.preview();
  const exec = DatabaseSync.prototype.exec;
  let injected = false;
  const mock = t.mock.method(DatabaseSync.prototype, "exec", function (sql) {
    if (sql === "BEGIN IMMEDIATE" && !injected) {
      injected = true;
      f.database.prepare("UPDATE settings SET revision=revision+1 WHERE id='company'").run();
    }
    return exec.call(this, sql);
  });
  await assert.rejects(f.apply(), /obsoleta/);
  mock.mock.restore();
  assert.equal(f.database.prepare("SELECT count(*) AS n FROM products").get().n, 0);
  assert.equal(inspectDatabase(f.filename).revision, 1);
  assert.equal(verifyBackup(f.backup).snapshot.revision, 0);
});

test("ADMIN activo requerido, rutas privadas obligatorias y CLI rechaza opciones ambiguas", async (t) => {
  const f = fixture(t);
  assert.throws(() => previewCompanyCatalog(f.filename, "missing-admin"), /ADMIN/);
  f.database
    .prepare("UPDATE users SET data=? WHERE id=?")
    .run(JSON.stringify({ ...actor, role: "VIEWER" }), actor.id);
  assert.throws(() => f.preview(), /ADMIN/);
  f.database
    .prepare("UPDATE users SET data=? WHERE id=?")
    .run(JSON.stringify({ ...actor, is_active: false }), actor.id);
  assert.throws(() => f.preview(), /ADMIN/);
  assert.throws(() => previewCompanyCatalog("relative.sqlite", actor.id), /absoluta/);
  const child = spawnSync(
    process.execPath,
    ["scripts/company-catalog.mjs", "preview", "--database", f.filename, "--database", f.filename],
    { encoding: "utf8", windowsHide: true },
  );
  assert.equal(child.status, 1);
  assert.match(child.stderr, /repetida/);
});

test("bloqueo SQLite no deja escrituras parciales y permite reintentar el mismo plan", async (t) => {
  const f = fixture(t);
  f.preview();
  f.database.exec("BEGIN IMMEDIATE");
  try {
    await assert.rejects(f.apply(), /locked|busy/i);
    assert.equal(f.database.prepare("SELECT count(*) AS n FROM products").get().n, 0);
  } finally {
    f.database.exec("ROLLBACK");
  }
  assert.equal(verifyBackup(f.backup).snapshot.revision, 0);
  assert.equal(
    (await applyCompanyCatalog(f.filename, f.plan, join(f.directory, "retry.sqlite"))).status,
    "applied",
  );
});

test("recuperar un maestro ausente conserva ventas, pagos, producción, inventario y sus snapshots reales", async (t) => {
  const session = await regressionFixture(t);
  const ids = await cashCreditScenario(session);
  await session.run("PRODUCTION_SAVE", productionPayload());
  await session.run("PAYMENT_REVERSE", {
    id: ids.payment,
    date: "2026-10-15",
    reason: "Reversión exclusivamente de prueba",
  });
  const state = await session.state();
  state.products = state.products.filter((row) => row.id !== "prod-4");
  state.formulas = state.formulas.filter((row) => row.id !== "formula-4-1");
  state.formulaIngredients = state.formulaIngredients.filter((row) => row.formula_id !== "formula-4-1");
  state.sites = state.sites.filter((row) => row.id !== "site-5");
  const f = fixture(t, state);
  const before = inspectDatabase(f.filename);
  f.preview();
  await f.apply();
  const after = inspectDatabase(f.filename);
  for (const table of before.tables.filter(
    (row) =>
      !["products", "sites", "formulas", "formula_ingredients", "audit", "settings"].includes(row.name),
  ))
    assert.deepEqual(
      after.tables.find((row) => row.name === table.name),
      table,
    );
  for (const row of state.audit)
    assert.equal(
      f.database.prepare("SELECT data FROM audit WHERE id=?").get(row.id).data,
      JSON.stringify(row),
    );
  for (const name of ["sales", "payments", "payment_reversals", "productions", "inventory_movements"])
    assert.ok(after.tables.find((row) => row.name === name).count > 0, name);
});
