import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { execFileSync, spawn, spawnSync } from "node:child_process";
import { chmodSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createPrivateDirectory } from "../lib/sqlite/files.mjs";
import {
  initializeDatabase,
  inspectDatabase,
  migrateDatabase,
  verifyDatabase,
} from "../lib/sqlite/migrations.mjs";
import { backupDatabase, restoreDatabase, verifyBackup } from "../lib/sqlite/recovery.mjs";
import { ledgerSql, migrationCatalog, sha256 } from "../lib/sqlite/schema.mjs";
import { openSqliteDatabase } from "../lib/adapters/node-sqlite.mjs";
import { createStore } from "../lib/application-store.mjs";
import { executeCommand } from "../lib/domain.mjs";
import { writePlan } from "../lib/persistence.mjs";
import { adminIdentity, cashCreditScenario, scenarioSession } from "./helpers/regression-scenarios.mjs";

const appRoot = fileURLToPath(new URL("../", import.meta.url));
const cli = join(appRoot, "scripts/sqlite-admin.mjs");
const historicalSql = readFileSync(join(appRoot, "drizzle/0000_nervous_silver_fox.sql"), "utf8");
const catalog = migrationCatalog();

function fixture(t, { historical = false, empty = false } = {}) {
  const root = mkdtempSync(join(tmpdir(), "nutrequine-06-test-"));
  const directory = createPrivateDirectory(join(root, "private"));
  const filename = join(directory, "synthetic.sqlite");
  if (historical || empty) {
    const database = new DatabaseSync(filename);
    try {
      if (historical) database.exec(historicalSql);
    } finally {
      database.close();
    }
    chmodSync(filename, 0o600);
  } else initializeDatabase(filename, { catalog });
  const connections = [];
  t.after(() => {
    for (const connection of connections) if (connection.isOpen) connection.close();
  });
  return {
    root,
    directory,
    filename,
    raw(options = {}) {
      const database = new DatabaseSync(filename, options);
      connections.push(database);
      return database;
    },
  };
}

async function commercialState(filename) {
  const connection = openSqliteDatabase(filename);
  try {
    const store = createStore(() => connection);
    await store.ensureState(adminIdentity);
    const session = scenarioSession(store);
    const ids = await cashCreditScenario(session);
    await session.run("PRODUCTION_SAVE", {
      production_date: "2026-10-14",
      products: [{ product_id: "prod-1", nuclei_count: 1 }],
      confirm: true,
    });
    await session.run("PAYMENT_REVERSE", {
      id: ids.payment,
      reason: "Reversión sintética",
      date: "2026-10-14",
    });
    const item = (await session.state()).saleItems.find((row) => row.sale_id === ids.secondSale);
    await session.run("SALE_CORRECT", {
      id: ids.secondSale,
      reason: "Rectificación sintética",
      items: [
        {
          original_item_id: item.id,
          product_id: "prod-1",
          quantity: 2,
          unit_price: "0.31",
          unit_weight_kg: "17.001",
        },
      ],
    });
    return store.loadState();
  } finally {
    connection.close();
  }
}

function futureCatalog(f, sql = "CREATE INDEX idx_synthetic_future ON audit(id);") {
  const directory = join(f.root, "catalog");
  mkdirSync(join(directory, "meta"), { recursive: true });
  writeFileSync(join(directory, "0000_nervous_silver_fox.sql"), historicalSql);
  writeFileSync(join(directory, "0001_synthetic.sql"), sql);
  writeFileSync(
    join(directory, "meta/_journal.json"),
    JSON.stringify({
      dialect: "sqlite",
      entries: [
        { idx: 0, tag: "0000_nervous_silver_fox" },
        { idx: 1, tag: "0001_synthetic" },
      ],
    }),
  );
  return { directory, catalog: migrationCatalog(directory) };
}

function runCli(args, script = cli, cwd = appRoot) {
  const result = spawnSync(process.execPath, [script, ...args], {
    cwd,
    windowsHide: true,
    encoding: "utf8",
    timeout: 120000,
    env: { ...process.env, NODE_OPTIONS: "", NODE_PATH: "" },
  });
  if (result.error) throw result.error;
  return { code: result.status, output: JSON.parse(result.status === 0 ? result.stdout : result.stderr) };
}

function concurrentCli(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [cli, ...args], {
      windowsHide: true,
      timeout: 120000,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "";
    let error = "";
    child.stdout.on("data", (chunk) => {
      output += chunk;
    });
    child.stderr.on("data", (chunk) => {
      error += chunk;
    });
    child.once("error", reject);
    child.once("exit", (code) => {
      try {
        resolve({ code, output: JSON.parse(code === 0 ? output : error) });
      } catch (cause) {
        reject(new Error("El proceso administrativo no devolvió un resultado JSON.", { cause }));
      }
    });
  });
}

test("SQLite administración: inicialización explícita y vacía, sin bootstrap ni sobrescritura", (t) => {
  const f = fixture(t);
  const initial = inspectDatabase(f.filename, { catalog });
  assert.equal(initial.status, "managed");
  assert.equal(initial.version, 1);
  assert.equal(initial.tables.length, 28);
  assert.equal(initial.tables.find((table) => table.name === "users").count, 0);
  assert.equal(initial.tables.find((table) => table.name === "settings").count, 0);
  const bytes = readFileSync(f.filename);
  assert.throws(() => initializeDatabase(f.filename), /EEXIST/);
  assert.deepEqual(readFileSync(f.filename), bytes);
  const missing = join(f.directory, "missing.sqlite");
  assert.throws(() => inspectDatabase(missing), /ENOENT/);
  assert.equal(existsSync(missing), false);
  assert.throws(() => initializeDatabase("relative.sqlite"), /absoluta/);
});

test("SQLite administración: un archivo vacío existente requiere selección explícita", (t) => {
  const f = fixture(t, { empty: true });
  assert.equal(inspectDatabase(f.filename, { catalog }).status, "empty");
  assert.throws(() => verifyDatabase(f.filename), /vacía/);
  assert.throws(() => migrateDatabase(f.filename, { catalog }), /initialize-empty/);
  assert.equal(migrateDatabase(f.filename, { catalog, initializeEmpty: true }).version, 1);
});

test("SQLite administración: adopta historia comercial sin repetir CREATE ni regenerar IDs", async (t) => {
  const f = fixture(t, { historical: true });
  const state = await commercialState(f.filename);
  const before = inspectDatabase(f.filename, { catalog });
  assert.equal(before.adoptionRequired, true);
  assert.throws(() => migrateDatabase(f.filename, { catalog }), /adopt/);
  const adopted = migrateDatabase(f.filename, { catalog, adopt: true });
  assert.equal(adopted.applied[0].origin, "adopted");
  assert.deepEqual(
    adopted.tables.filter((table) => table.name !== "nutrequine_migrations"),
    before.tables,
  );
  assert.deepEqual(migrateDatabase(f.filename, { catalog }), adopted);
  const connection = openSqliteDatabase(f.filename);
  try {
    assert.deepEqual(await createStore(() => connection).loadState(), state);
  } finally {
    connection.close();
  }
});

test("SQLite administración: diferencia ledger D1 conocido del nuevo ledger SQLite", (t) => {
  const f = fixture(t, { historical: true });
  const raw = f.raw();
  raw.exec(`CREATE TABLE IF NOT EXISTS d1_migrations(
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    name       TEXT UNIQUE,
    applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
  );`);
  raw.prepare("INSERT INTO d1_migrations(name) VALUES (?)").run(catalog.migrations[0].name);
  const original = raw.prepare("SELECT * FROM d1_migrations").all();
  const adopted = migrateDatabase(f.filename, { catalog, adopt: true });
  assert.deepEqual(adopted.d1Applied, [catalog.migrations[0].name]);
  assert.deepEqual(raw.prepare("SELECT * FROM d1_migrations").all(), original);
  assert.equal(adopted.applied[0].origin, "adopted");
});

test("SQLite administración: bloquea esquemas parciales, objetos extras e historiales ajenos", (t) => {
  for (const mutation of [
    "CREATE TABLE parcial(id TEXT)",
    "CREATE VIEW vista_ajena AS SELECT 1",
    "DROP INDEX idx_sales_customer",
    "UPDATE nutrequine_migrations SET name='unknown.sql'",
    "UPDATE nutrequine_migrations SET sha256='modified'",
  ]) {
    const f = fixture(t);
    f.raw().exec(mutation);
    const bytes = readFileSync(f.filename);
    assert.throws(() => migrateDatabase(f.filename, { catalog }), /desconocido|incompatible|modificada/);
    assert.deepEqual(readFileSync(f.filename), bytes);
  }
});

test("SQLite administración: rechaza ledger vacío y metadatos D1 desconocidos", (t) => {
  const f = fixture(t, { historical: true });
  f.raw().exec(ledgerSql);
  assert.throws(() => migrateDatabase(f.filename, { catalog, adopt: true }), /Ledger SQLite vacío/);
  const other = fixture(t, { historical: true });
  other
    .raw()
    .exec(
      "CREATE TABLE d1_migrations (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE, applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL); INSERT INTO d1_migrations(name) VALUES ('unknown.sql')",
    );
  assert.throws(() => migrateDatabase(other.filename, { catalog, adopt: true }), /Historial D1 desconocido/);
  const malformed = fixture(t, { historical: true });
  malformed.raw().exec("CREATE TABLE d1_migrations(id TEXT, name TEXT, applied_at TEXT)");
  assert.throws(() => inspectDatabase(malformed.filename, { catalog }), /Metadatos D1 desconocidos/);
});

test("SQLite administración: ejecuta solo pendientes y detecta SQL aplicado modificado", async (t) => {
  const f = fixture(t);
  const state = await commercialState(f.filename);
  const future = futureCatalog(f);
  assert.deepEqual(inspectDatabase(f.filename, { catalog: future.catalog }).pending, ["0001_synthetic.sql"]);
  const migrated = migrateDatabase(f.filename, { catalog: future.catalog });
  assert.equal(migrated.applied.length, 2);
  assert.deepEqual(migrateDatabase(f.filename, { catalog: future.catalog }), migrated);
  const connection = openSqliteDatabase(f.filename);
  try {
    assert.deepEqual(await createStore(() => connection).loadState(), state);
  } finally {
    connection.close();
  }
  writeFileSync(
    join(future.directory, "0001_synthetic.sql"),
    future.catalog.migrations[1].sql + "\n-- modificación posterior\n",
  );
  assert.throws(
    () => inspectDatabase(f.filename, { catalog: migrationCatalog(future.directory) }),
    /modificada/,
  );
});

test("SQLite administración: fallo tras escrituras revierte datos, esquema y registro de migración", async (t) => {
  const f = fixture(t);
  const state = await commercialState(f.filename);
  const before = inspectDatabase(f.filename, { catalog });
  const future = futureCatalog(
    f,
    `UPDATE settings SET revision=revision+100;
CREATE INDEX idx_synthetic_failure ON audit(id);
INSERT INTO customer_sites(id,data,customer_id,site_id)
SELECT 'invalid','{"id":"invalid","customer_id":"missing","site_id":"missing"}','missing','missing' FROM settings;`,
  );
  assert.throws(() => migrateDatabase(f.filename, { catalog: future.catalog }), /FOREIGN KEY/);
  assert.deepEqual(inspectDatabase(f.filename, { catalog }), before);
  const connection = openSqliteDatabase(f.filename);
  try {
    assert.deepEqual(await createStore(() => connection).loadState(), state);
  } finally {
    connection.close();
  }
});

test("SQLite administración: no acepta saltarse transacciones ni destruir tablas desde migraciones", (t) => {
  const f = fixture(t);
  for (const sql of ["COMMIT;", "PRAGMA foreign_keys=OFF;", "DROP TABLE audit;"])
    assert.throws(() => futureCatalog(f, sql), /authorized/);
  writeFileSync(join(f.root, "catalog/extra.sql"), "SELECT 1");
  assert.throws(() => migrationCatalog(join(f.root, "catalog")), /journal/);
});

test("SQLite administración: verifica FK y coherencia JSON antes de preparar o respaldar", async (t) => {
  const f = fixture(t);
  f.raw({ enableForeignKeyConstraints: false }).exec(
    "INSERT INTO customer_sites(id,data,customer_id,site_id) VALUES ('bad','{}','missing','missing')",
  );
  assert.throws(() => verifyDatabase(f.filename, { catalog }), /foreign_key_check/);
  const backup = join(f.directory, "rejected.sqlite");
  await assert.rejects(backupDatabase(f.filename, backup, { catalog }), /foreign_key_check/);
  assert.equal(existsSync(backup), false);
  const other = fixture(t);
  other.raw().exec("INSERT INTO customers(id,data) VALUES ('x','{\"id\":\"other\"}')");
  assert.throws(() => verifyDatabase(other.filename, { catalog }), /ID JSON/);
});

test("SQLite recuperación: respaldo verificable y restauración exacta de operaciones e historial", async (t) => {
  const f = fixture(t);
  const state = await commercialState(f.filename);
  const originalHash = sha256(readFileSync(f.filename));
  const backup = join(f.directory, "backup.sqlite");
  const restored = join(f.directory, "restored.sqlite");
  const result = await backupDatabase(f.filename, backup, { catalog });
  assert.equal(result.manifest.sha256, sha256(readFileSync(backup)));
  assert.deepEqual(verifyBackup(backup, { catalog }), result.manifest);
  await restoreDatabase(backup, restored, { catalog });
  const connection = openSqliteDatabase(restored);
  try {
    const store = createStore(() => connection);
    assert.deepEqual(await store.loadState(), state);
    const audit = state.audit.find((row) => row.request_id === "portable-credit-application");
    await store.runCommand(
      { type: audit.action, payload: audit.payload, request_id: audit.request_id },
      adminIdentity,
    );
    assert.deepEqual(await store.loadState(), state);
    await store.runCommand(
      { type: "CUSTOMER_SAVE", payload: { name: "Operación recuperada" }, request_id: "restored-new" },
      adminIdentity,
    );
    assert.equal((await store.loadState()).audit.length, state.audit.length + 1);
  } finally {
    connection.close();
  }
  assert.equal(sha256(readFileSync(f.filename)), originalHash);
  assert.equal(runCli(["verify", "--database", restored]).code, 0);
  const newer = futureCatalog(f);
  assert.deepEqual(verifyBackup(backup, { catalog: newer.catalog }), result.manifest);
  const olderRestore = join(f.directory, "older-version.sqlite");
  await restoreDatabase(backup, olderRestore, { catalog: newer.catalog });
  const older = inspectDatabase(olderRestore, { catalog: newer.catalog });
  assert.equal(older.version, 1);
  assert.deepEqual(older.pending, ["0001_synthetic.sql"]);
});

test("SQLite recuperación: no sobrescribe destinos y rechaza hashes o manifiestos alterados", async (t) => {
  const f = fixture(t);
  const backup = join(f.directory, "backup.sqlite");
  await backupDatabase(f.filename, backup, { catalog });
  const bytes = readFileSync(backup);
  await assert.rejects(backupDatabase(f.filename, backup, { catalog }), /Ya existe|EEXIST/);
  await assert.rejects(restoreDatabase(backup, f.filename, { catalog }), /EEXIST/);
  assert.deepEqual(readFileSync(backup), bytes);
  const manifest = JSON.parse(readFileSync(backup + ".manifest.json", "utf8"));
  writeFileSync(backup + ".manifest.json", JSON.stringify({ ...manifest, sha256: "0".repeat(64) }));
  assert.throws(() => verifyBackup(backup, { catalog }), /hash/);
  writeFileSync(
    backup + ".manifest.json",
    JSON.stringify({ ...manifest, snapshot: { ...manifest.snapshot, tables: [] } }),
  );
  assert.throws(() => verifyBackup(backup, { catalog }), /no coincide/);
});

test("SQLite recuperación: snapshot consistente mientras otro escritor confirma en WAL", async (t) => {
  const f = fixture(t);
  const state = await commercialState(f.filename);
  const writer = f.raw();
  assert.equal(writer.prepare("PRAGMA journal_mode=WAL").get().journal_mode, "wal");
  const large = writer.prepare("INSERT INTO customers(id,data) VALUES (?,?)");
  writer.exec("BEGIN");
  for (let index = 0; index < 100; index++)
    large.run(
      "large-" + index,
      JSON.stringify({
        id: "large-" + index,
        name: "Cliente sintético grande",
        notes: "x".repeat(20000),
        is_active: true,
      }),
    );
  writer.exec("COMMIT");
  const before = inspectDatabase(f.filename, { catalog });
  let written = false;
  const outcome = executeCommand(
    {
      ...state,
      customers: [
        ...state.customers,
        ...writer
          .prepare("SELECT data FROM customers WHERE id LIKE 'large-%'")
          .all()
          .map((row) => JSON.parse(row.data)),
      ],
    },
    { type: "CUSTOMER_SAVE", payload: { name: "Escritor durante backup" } },
    state.users[0],
  );
  const backup = join(f.directory, "wal-backup.sqlite");
  await backupDatabase(f.filename, backup, {
    catalog,
    onProgress() {
      if (written) return;
      writer.exec("BEGIN IMMEDIATE");
      try {
        for (const statement of writePlan(state, outcome.state))
          writer.prepare(statement.sql).run(...statement.args);
        writer.exec("COMMIT");
        written = true;
      } catch (error) {
        writer.exec("ROLLBACK");
        throw error;
      }
    },
  });
  assert.equal(written, true);
  assert.deepEqual(verifyBackup(backup, { catalog }).snapshot, before);
  assert.equal(
    inspectDatabase(f.filename, { catalog }).tables.find((table) => table.name === "customers").count,
    before.tables.find((table) => table.name === "customers").count + 1,
  );
});

test("SQLite recuperación: un fallo de copia conserva original y deja salida sin certificar", async (t) => {
  const f = fixture(t);
  const before = inspectDatabase(f.filename, { catalog });
  const target = join(f.directory, "failed.sqlite");
  await assert.rejects(
    backupDatabase(f.filename, target, {
      catalog,
      onProgress() {
        throw new Error("Fallo sintético de copia");
      },
    }),
    /Fallo sintético/,
  );
  assert.deepEqual(inspectDatabase(f.filename, { catalog }), before);
  assert.equal(existsSync(target), true);
  assert.equal(existsSync(target + ".manifest.json"), false);
  assert.throws(() => verifyBackup(target, { catalog }), /ENOENT/);
});

test("SQLite CLI: adopción concurrente y creación exclusiva entre procesos", async (t) => {
  const f = fixture(t, { historical: true });
  const before = inspectDatabase(f.filename, { catalog });
  const results = await Promise.all(
    [0, 1].map(() => concurrentCli(["migrate", "--database", f.filename, "--apply", "--adopt"])),
  );
  assert.deepEqual(
    results.map((result) => result.code),
    [0, 0],
  );
  const after = inspectDatabase(f.filename, { catalog });
  assert.equal(after.applied.length, 1);
  assert.deepEqual(
    after.tables.filter((table) => table.name !== "nutrequine_migrations"),
    before.tables,
  );
  const target = join(f.directory, "concurrent.sqlite");
  const created = await Promise.all([0, 1].map(() => concurrentCli(["init", "--database", target])));
  assert.equal(created.filter((result) => result.code === 0).length, 1);
  assert.equal(inspectDatabase(target, { catalog }).applied.length, 1);
});

test("SQLite CLI: funciona aislada sin node_modules, Wrangler, Miniflare ni Sites", async (t) => {
  const f = fixture(t);
  const distribution = join(f.root, "standalone", "app");
  mkdirSync(join(distribution, "scripts"), { recursive: true });
  mkdirSync(join(distribution, "lib"));
  cpSync(join(appRoot, "lib/sqlite"), join(distribution, "lib/sqlite"), { recursive: true });
  cpSync(join(appRoot, "drizzle"), join(distribution, "drizzle"), { recursive: true });
  cpSync(cli, join(distribution, "scripts/sqlite-admin.mjs"));
  writeFileSync(join(distribution, "package.json"), JSON.stringify({ version: "0.1.0" }));
  const script = join(distribution, "scripts/sqlite-admin.mjs");
  const privateDirectory = join(f.root, "cli-private");
  const filename = join(privateDirectory, "independent.sqlite");
  const backup = join(privateDirectory, "independent-backup.sqlite");
  const destination = join(privateDirectory, "independent-restore.sqlite");
  for (const args of [
    ["directory", "--directory", privateDirectory],
    ["init", "--database", filename],
    ["inspect", "--database", filename],
    ["migrate", "--database", filename, "--apply"],
    ["verify", "--database", filename],
    ["backup", "--database", filename, "--destination", backup],
    ["verify-backup", "--backup", backup],
    ["restore", "--backup", backup, "--destination", destination],
    ["verify", "--database", destination],
  ]) {
    const result = runCli(args, script, f.root);
    assert.equal(result.code, 0, JSON.stringify(result.output));
  }
  assert.equal(existsSync(join(dirname(distribution), "node_modules")), false);
  assert.equal(runCli(["migrate", "--database", filename], script, f.root).code, 1);
  assert.equal(runCli(["init"], script, f.root).code, 1);
  assert.equal(runCli(["verify", "--database", destination, "--unknown"], script, f.root).code, 1);
});

test("SQLite administración: bloqueo de preparación conserva datos y permite reintento explícito", (t) => {
  const f = fixture(t, { historical: true });
  const before = inspectDatabase(f.filename, { catalog });
  const lock = f.raw();
  lock.exec("BEGIN IMMEDIATE");
  try {
    assert.throws(
      () => migrateDatabase(f.filename, { catalog, adopt: true, busyTimeoutMs: 20 }),
      /locked|busy/i,
    );
  } finally {
    lock.exec("ROLLBACK");
  }
  assert.deepEqual(inspectDatabase(f.filename, { catalog }), before);
  assert.equal(migrateDatabase(f.filename, { catalog, adopt: true }).applied.length, 1);
});

test("SQLite administración: rechaza permisos amplios de directorio y archivo", (t) => {
  const f = fixture(t);
  const wide = createPrivateDirectory(join(f.root, "wide"));
  if (process.platform === "win32") {
    const icacls = join(process.env.SystemRoot, "System32/icacls.exe");
    execFileSync(icacls, [wide, "/grant", "*S-1-1-0:(OI)(CI)R"], { windowsHide: true, stdio: "pipe" });
    execFileSync(icacls, [f.filename, "/grant", "*S-1-1-0:R"], { windowsHide: true, stdio: "pipe" });
  } else {
    chmodSync(wide, 0o755);
    chmodSync(f.filename, 0o644);
  }
  const target = join(wide, "must-not-create.sqlite");
  assert.throws(() => initializeDatabase(target, { catalog }), /otras identidades|privado/);
  assert.equal(existsSync(target), false);
  assert.throws(() => inspectDatabase(f.filename, { catalog }), /otras identidades|privado/);
});
