import { test } from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { fork } from "node:child_process";
import { existsSync, readFileSync, renameSync } from "node:fs";
import { join } from "node:path";
import { openSqliteDatabase } from "../lib/adapters/node-sqlite.mjs";
import { PersistenceBusyError } from "../lib/persistence-errors.mjs";
import { createD1Adapter } from "../lib/adapters/d1.ts";
import { createStore } from "../lib/application-store.mjs";
import { TABLES, SQL_NAMES, executeCommand } from "../lib/domain.mjs";
import { diskFixture, temporaryDataDirectory } from "./helpers/persistence-fixtures.mjs";
import { memoryD1 } from "./helpers/d1-memory.mjs";
import { adminIdentity, scenarioSession, cashCreditScenario } from "./helpers/regression-scenarios.mjs";

function databaseProcess(filename, action) {
  const child = fork(new URL("./helpers/sqlite-process.mjs", import.meta.url), [filename, action], {
    windowsHide: true,
    stdio: ["ignore", "ignore", "inherit", "ipc"],
  });
  const next = () =>
    once(child, "message", { signal: AbortSignal.timeout(30000) }).then(([message]) => message);
  const ready = next();
  return {
    ready,
    request(message) {
      const response = next();
      child.send(message);
      return response;
    },
    async stop() {
      if (child.exitCode !== null) return;
      const exited = once(child, "exit", { signal: AbortSignal.timeout(5000) });
      if (child.connected) child.send({ action: "stop" });
      else child.kill();
      try {
        await exited;
      } catch (error) {
        child.kill();
        throw error;
      }
    },
  };
}

test("SQLite exige apertura explícita, reserva exclusiva y datos fuera de instalación", (t) => {
  const directory = temporaryDataDirectory(t);
  const filename = join(directory, "nueva.sqlite");
  assert.throws(() => openSqliteDatabase(filename), /ENOENT/);
  assert.equal(existsSync(filename), false);
  assert.throws(() => openSqliteDatabase(":memory:", { mode: "create" }), /ruta absoluta/);
  assert.throws(
    () => openSqliteDatabase(join(process.cwd(), "outputs", "no-crear.sqlite"), { mode: "create" }),
    /fuera del directorio/,
  );
  const connection = openSqliteDatabase(filename, { mode: "create" });
  try {
    const before = readFileSync(filename);
    assert.throws(() => openSqliteDatabase(filename, { mode: "create" }), /EEXIST/);
    assert.deepEqual(readFileSync(filename), before);
    assert.throws(() => openSqliteDatabase(filename, { busyTimeoutMs: -1 }), /espera/);
  } finally {
    connection.close();
  }
});

test("SQLite conserva las 27 tablas, índices y relaciones del SQL histórico", async (t) => {
  const f = diskFixture(t);
  const tables = f.database.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
  assert.deepEqual(
    tables.map((row) => row.name).sort(),
    [...Object.values(SQL_NAMES), "settings", "transaction_guards"].sort(),
  );
  assert.equal(tables.length, 27);
  assert.equal(f.database.prepare("PRAGMA foreign_keys").get().foreign_keys, 1);
  assert.equal(f.database.prepare("PRAGMA foreign_key_check").all().length, 0);
  assert.equal(f.database.prepare("PRAGMA integrity_check").get().integrity_check, "ok");
  assert.ok(
    f.database
      .prepare("SELECT name FROM sqlite_master WHERE type='index' AND name='idx_sales_customer'")
      .get(),
  );
  assert.equal(await createStore(() => f.binding).loadState(), null);
});

test("SQLite parametriza valores, conserva bind previo y rechaza pérdida numérica", async (t) => {
  const f = diskFixture(t);
  const statement = f.binding.prepare("SELECT ? AS value, ? AS amount, ? AS optional");
  const dangerous = "Cliente'); DROP TABLE sales; --";
  const first = statement.bind(dangerous, 9007199254740991, null);
  const second = statement.bind("otro", 1, null);
  assert.deepEqual(await f.binding.batch([first, second]), [
    { results: [{ value: dangerous, amount: 9007199254740991, optional: null }] },
    { results: [{ value: "otro", amount: 1, optional: null }] },
  ]);
  assert.throws(() => statement.bind(NaN), /Parámetro/);
  await assert.rejects(
    f.binding.batch([f.binding.prepare("SELECT 9007199254740992 AS unsafe")]),
    /range|rango/i,
  );
  assert.equal(
    (await f.binding.batch([f.binding.prepare("SELECT count(*) AS n FROM sales")]))[0].results[0].n,
    0,
  );
});

test("SQLite revierte una escritura válida seguida de FK o CHECK inválido", async (t) => {
  const f = diskFixture(t);
  const store = createStore(() => f.binding);
  const before = await store.ensureState(adminIdentity);
  const outcome = executeCommand(
    before,
    { type: "CUSTOMER_SAVE", payload: { name: "No persistir" } },
    before.users[0],
  );
  outcome.state.customerSites.push({ id: "invalid", customer_id: outcome.result, site_id: "missing" });
  await assert.rejects(store.persistState(before, outcome.state), /FOREIGN KEY/);
  assert.deepEqual(await store.loadState(), before);
  await assert.rejects(
    f.binding.batch([
      f.binding.prepare("INSERT INTO customers(id,data) VALUES (?,?)").bind("rollback", "{}"),
      f.binding.prepare("INSERT INTO transaction_guards(id,accepted) VALUES (?,?)").bind("guard", 0),
    ]),
    /CHECK/,
  );
  assert.deepEqual(await store.loadState(), before);
});

test("SQLite mantiene control exclusivo del batch y se recupera tras errores SQL", async (t) => {
  const f = diskFixture(t);
  for (const sql of [
    "COMMIT",
    "SAVEPOINT externo",
    "PRAGMA foreign_keys = OFF",
    "ATTACH DATABASE ':memory:' AS externa",
    "SELECT 1; DELETE FROM customers",
    "SELECT missing FROM customers",
  ]) {
    await assert.rejects(
      f.binding.batch([
        f.binding.prepare("INSERT INTO customers(id,data) VALUES (?,?)").bind("rollback", "{}"),
        f.binding.prepare(sql),
      ]),
    );
    assert.equal(f.database.prepare("SELECT count(*) AS n FROM customers").get().n, 0);
  }
  assert.deepEqual(await f.binding.batch([]), []);
  assert.equal((await f.binding.batch([f.binding.prepare("SELECT 1 AS n")]))[0].results[0].n, 1);
});

test("adaptadores rechazan sentencias ajenas sin ejecutar escrituras", async (t) => {
  const f = diskFixture(t);
  const other = openSqliteDatabase(f.filename);
  const d1 = memoryD1();
  try {
    const first = createD1Adapter(d1.binding);
    const second = createD1Adapter(d1.binding);
    await assert.rejects(first.batch([second.prepare("SELECT 1")]), /otra conexión/);
    await assert.rejects(f.binding.batch([other.prepare("SELECT 1")]), /otra conexión/);
    await assert.rejects(first.batch([f.binding.prepare("SELECT 1")]), /otra conexión/);
    assert.deepEqual(await first.batch([]), []);
  } finally {
    other.close();
    d1.close();
  }
});

test("SQLite cierra y reabre preservando JSON, IDs, revisión e idempotencia", async (t) => {
  const f = diskFixture(t);
  const store = createStore(() => f.binding);
  await store.ensureState(adminIdentity);
  await cashCreditScenario(scenarioSession(store));
  const before = await store.loadState();
  f.close();
  const renamed = join(f.filename, "..", "Base sintética #%.sqlite");
  renameSync(f.filename, renamed);
  const reopened = openSqliteDatabase(renamed);
  try {
    const persistent = createStore(() => reopened);
    assert.deepEqual(await persistent.loadState(), before);
    const audit = before.audit.find((row) => row.request_id === "portable-credit-application");
    await persistent.runCommand(
      { type: audit.action, payload: audit.payload, request_id: audit.request_id },
      adminIdentity,
    );
    assert.deepEqual(await persistent.loadState(), before);
    assert.equal(
      TABLES.every((table) => Array.isArray(before[table])),
      true,
    );
  } finally {
    reopened.close();
  }
  await assert.rejects(f.binding.batch([]), /cerrada/);
});

test("un proceso Node nuevo recupera exactamente el estado confirmado en disco", async (t) => {
  const f = diskFixture(t);
  const store = createStore(() => f.binding);
  await store.ensureState(adminIdentity);
  await cashCreditScenario(scenarioSession(store));
  const expected = await store.loadState();
  f.close();
  const process = databaseProcess(f.filename, "read");
  try {
    const message = await process.ready;
    assert.deepEqual(message.state, expected);
  } finally {
    await process.stop();
  }
});

test("dos procesos con la misma revisión guardan solo uno y el perdedor puede reintentar", async (t) => {
  const f = diskFixture(t);
  const store = createStore(() => f.binding);
  await store.ensureState(adminIdentity);
  const workers = [databaseProcess(f.filename, "write"), databaseProcess(f.filename, "write")];
  try {
    const snapshots = await Promise.all(workers.map((worker) => worker.ready));
    assert.deepEqual(snapshots[0].state, snapshots[1].state);
    const commands = [0, 1].map((index) => ({
      type: "CUSTOMER_SAVE",
      payload: { name: "Proceso " + index },
      request_id: "process-" + index,
    }));
    const results = await Promise.all(
      workers.map((worker, index) => worker.request({ action: "write", command: commands[index] })),
    );
    assert.equal(results.filter((result) => result.saved).length, 1);
    const loser = results.findIndex((result) => !result.saved);
    assert.match(results[loser].error, /Otra operación/);
    const committed = await store.loadState();
    assert.equal(committed.customers.length, 1);
    assert.equal(committed.audit.length, 1);
    await store.runCommand(commands[loser], adminIdentity);
    const after = await store.loadState();
    assert.equal(after.customers.length, 2);
    assert.equal(after.audit.length, 2);
    assert.equal(f.database.prepare("SELECT count(*) AS n FROM transaction_guards").get().n, 0);
  } finally {
    await Promise.all(workers.map((worker) => worker.stop()));
  }
});

test("bloqueo de otro proceso produce error recuperable, sin pérdida ni reintento automático", async (t) => {
  const f = diskFixture(t);
  const store = createStore(() => f.binding);
  const before = await store.ensureState(adminIdentity);
  const lock = databaseProcess(f.filename, "lock");
  const command = {
    type: "CUSTOMER_SAVE",
    payload: { name: "Después del bloqueo" },
    request_id: "locked-request",
  };
  try {
    assert.equal((await lock.ready).ready, true);
    await assert.rejects(store.runCommand(command, adminIdentity), (error) => {
      assert.ok(error instanceof PersistenceBusyError);
      assert.equal(error.code, "PERSISTENCE_BUSY");
      return true;
    });
    assert.deepEqual(await store.loadState(), before);
  } finally {
    await lock.stop();
  }
  await store.runCommand(command, adminIdentity);
  await store.runCommand(command, adminIdentity);
  assert.equal((await store.loadState()).audit.length, 1);
});
