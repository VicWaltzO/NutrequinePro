import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { chmodSync, cpSync, existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawn, spawnSync } from "node:child_process";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { createLocalServer } from "../server/application.mts";
import { provisionAuthentication } from "../server/provision.mts";
import { readConfig, validateConfig } from "../server/config.mts";
import { sessionCookie } from "../server/http-security.mts";
import { hashPassword, checkPassword } from "../server/passwords.mts";
import { createPrivateDirectory } from "../lib/sqlite/files.mjs";
import { initializeDatabase, inspectDatabase } from "../lib/sqlite/migrations.mjs";
import { openSqliteDatabase } from "../lib/adapters/node-sqlite.mjs";
import { createStore } from "../lib/application-store.mjs";
import { adminIdentity, cashCreditScenario } from "./helpers/regression-scenarios.mjs";

const appRoot = fileURLToPath(new URL("../", import.meta.url));
const secret = () => randomBytes(24).toString("base64url");

async function fixture(t, { historical = true, provision = true } = {}) {
  const root = mkdtempSync(join(tmpdir(), "nutrequine-07-test-"));
  const directory = createPrivateDirectory(join(root, "private"));
  const database = join(directory, "business.sqlite");
  const auth_database = join(directory, "auth.sqlite");
  initializeDatabase(database);
  if (historical) {
    const connection = openSqliteDatabase(database);
    const store = createStore(() => connection);
    await store.ensureState(adminIdentity);
    await store.runCommand(
      { type: "CUSTOMER_SAVE", payload: { name: "Histórico sintético" }, request_id: randomUUID() },
      adminIdentity,
    );
    connection.close();
  }
  const password = secret();
  const id = historical ? adminIdentity.userId : "new-local-admin";
  if (provision)
    await provisionAuthentication(database, auth_database, historical ? "link" : "new", {
      user_id: id,
      name: "Administrador sintético local",
      login: "admin.local",
      password,
    });
  const config = { database, auth_database, port: 0 };
  const running = new Set();
  t.after(async () => {
    for (const app of running) await app.close();
  });
  return {
    root,
    directory,
    database,
    auth_database,
    password,
    id,
    config,
    async start(dependencies) {
      const app = await createLocalServer(config, dependencies);
      const url = await app.start();
      running.add(app);
      return { ...app, url, client: client(url) };
    },
  };
}

function client(url) {
  let cookie = "";
  let csrf = "";
  const call = async (path, { method = "GET", body, headers = {}, raw } = {}) => {
    const response = await fetch(url + path, {
      method,
      headers: {
        ...(cookie ? { cookie } : {}),
        ...(method === "POST"
          ? { origin: url, "content-type": "application/json", "x-csrf-token": csrf }
          : {}),
        ...headers,
      },
      body: raw ?? (body !== undefined ? JSON.stringify(body) : undefined),
    });
    const json = await response.json();
    const setCookie = response.headers.get("set-cookie");
    if (setCookie) cookie = setCookie.split(";")[0];
    if (json.csrf_token) csrf = json.csrf_token;
    return { status: response.status, headers: response.headers, json };
  };
  return {
    call,
    login: (login, password) => call("/api/auth/login", { method: "POST", body: { login, password } }),
    command: async (type, payload, request_id = randomUUID()) => {
      const response = await call("/api/command", { method: "POST", body: { type, payload, request_id } });
      assert.equal(response.status, 200, JSON.stringify(response.json));
      return response.json.result;
    },
    state: async () => {
      const response = await call("/api/state");
      assert.equal(response.status, 200, JSON.stringify(response.json));
      return response.json.state;
    },
    credentials: (user_id, login, password) =>
      call("/api/auth/credentials", { method: "POST", body: { user_id, login, password } }),
    get cookie() {
      return cookie;
    },
    get csrf() {
      return csrf;
    },
  };
}

async function logged(f) {
  const app = await f.start();
  const response = await app.client.login("admin.local", f.password);
  assert.equal(response.status, 200, JSON.stringify(response.json));
  return app;
}

async function addUser(app, id, role) {
  await app.client.command("USER_SAVE", { id, name: "Usuario sintético " + role, role, is_active: true });
  const password = secret();
  assert.equal((await app.client.credentials(id, "login-" + id, password)).status, 200);
  const account = client(app.url);
  assert.equal((await account.login("login-" + id, password)).status, 200);
  return { ...account, password };
}

test("Node autenticación: scrypt con salts diferentes y sin contraseñas predeterminadas", async () => {
  const password = secret();
  const first = await hashPassword(password);
  const second = await hashPassword(password);
  assert.notEqual(first.salt, second.salt);
  assert.notEqual(first.hash, second.hash);
  assert.equal(await checkPassword(password, first.salt, first.hash), true);
  assert.equal(await checkPassword(secret(), first.salt, first.hash), false);
  await assert.rejects(hashPassword("short"), /15/);
  await assert.rejects(hashPassword("ñ".repeat(600)), /1024/);
});

test("Node provisión: administrador nuevo explícito, sin visitantes ni maestros automáticos", async (t) => {
  const f = await fixture(t, { historical: false });
  const app = await f.start();
  assert.equal((await app.client.call("/api/state")).status, 401);
  assert.equal((await app.client.login("admin.local", f.password)).status, 200);
  const state = await app.client.state();
  assert.equal(state.users.length, 1);
  assert.equal(state.users[0].id, f.id);
  assert.equal(state.users[0].created_by, f.id);
  for (const table of ["products", "customers", "sales", "productions", "audit"])
    assert.equal(state[table].length, 0);
});

test("Node provisión: vinculación histórica conserva IDs, revisiones, snapshots y auditoría", async (t) => {
  const f = await fixture(t, { provision: false });
  const before = inspectDatabase(f.database);
  await assert.rejects(
    provisionAuthentication(f.database, f.auth_database, "new", {
      user_id: "intruder",
      name: "X",
      login: "intruder",
      password: secret(),
    }),
    /registros/,
  );
  const target = join(f.directory, "linked.sqlite");
  await assert.rejects(
    provisionAuthentication(f.database, join(f.directory, "wrong.sqlite"), "link", {
      user_id: "unknown",
      login: "unknown",
      password: secret(),
    }),
    /inexistente/,
  );
  await provisionAuthentication(f.database, target, "link", {
    user_id: f.id,
    login: "admin.local",
    password: f.password,
  });
  assert.deepEqual(inspectDatabase(f.database), before);
  await assert.rejects(
    provisionAuthentication(f.database, target, "link", {
      user_id: f.id,
      login: "admin.local",
      password: f.password,
    }),
    /EEXIST/,
  );
  f.config.auth_database = target;
  const app = await logged(f);
  assert.equal((await app.client.state()).audit[0].created_by, f.id);
});

test("Node arranque: rechaza archivos ausentes, esquemas ajenos, credenciales ausentes y configuración insegura", async (t) => {
  const f = await fixture(t);
  const missing = join(f.directory, "missing.sqlite");
  await assert.rejects(createLocalServer({ ...f.config, database: missing }), /ENOENT/);
  assert.equal(existsSync(missing), false);
  await assert.rejects(createLocalServer({ ...f.config, auth_database: missing }), /ENOENT/);
  const foreign = join(f.directory, "foreign.sqlite");
  const raw = new DatabaseSync(foreign);
  raw.exec("CREATE TABLE unrelated(id)");
  raw.close();
  chmodSync(foreign, 0o600);
  await assert.rejects(createLocalServer({ ...f.config, database: foreign }), /parcial|desconocido/);
  await assert.rejects(createLocalServer({ ...f.config, auth_database: foreign }), /incompatible/);
  const empty = join(f.directory, "unprovisioned.sqlite");
  initializeDatabase(empty);
  await assert.rejects(createLocalServer({ ...f.config, database: empty }), /corresponde/);
  assert.throws(() => validateConfig({ ...f.config, host: "0.0.0.0" }), /desconocida/);
  assert.throws(() => validateConfig(f.config), /puerto/);
  assert.throws(() => validateConfig({ ...f.config, port: 8000, tls_key: "key" }), /TLS/);
  const configPath = join(f.directory, "config.json");
  writeFileSync(configPath, JSON.stringify({ ...f.config, port: 8000 }), { mode: 0o600 });
  assert.equal(readConfig(configPath).port, 8000);
});

test("Node HTTP: escenario comercial portable real, idempotencia y persistencia entre reinicios", async (t) => {
  const f = await fixture(t);
  const app = await logged(f);
  assert.equal(app.server.server.address().address, "127.0.0.1");
  const ids = await cashCreditScenario({ run: app.client.command, state: app.client.state });
  const before = await app.client.state();
  assert.equal(before.audit.find((row) => row.entity_id === ids.firstSale).created_by, f.id);
  const cookie = app.client.cookie;
  await app.close();
  const next = await f.start();
  const restored = await next.client.call("/api/state", { headers: { cookie } });
  assert.equal(restored.status, 200);
  assert.deepEqual(restored.json.state, before);
  assert.equal((await next.client.login("admin.local", f.password)).status, 200);
  await next.client.command("CUSTOMER_SAVE", { name: "Después de reinicio" });
});

test("Node sesiones: cookie privada, expiración absoluta, logout efectivo y revocación", async (t) => {
  const f = await fixture(t);
  let now = Date.now();
  const app = await f.start({ clock: () => now });
  const login = await app.client.login("admin.local", f.password);
  assert.match(login.headers.get("set-cookie"), /HttpOnly; SameSite=Strict/);
  assert.doesNotMatch(login.headers.get("set-cookie"), /Secure/);
  assert.equal(login.json.token, undefined);
  const saved = app.client.cookie;
  const raw = new DatabaseSync(f.auth_database);
  assert.equal(
    raw.prepare("SELECT token_hash FROM sessions").get().token_hash.includes(saved.split("=")[1]),
    false,
  );
  assert.equal(raw.prepare("SELECT hash FROM credentials").get().hash.includes(f.password), false);
  raw.close();
  assert.equal((await app.client.call("/api/auth/session")).json.csrf_token, app.client.csrf);
  const logout = await app.client.call("/api/auth/logout", { method: "POST", body: {} });
  assert.equal(logout.status, 200);
  assert.match(logout.headers.get("set-cookie"), /Max-Age=0/);
  assert.equal((await app.client.call("/api/state", { headers: { cookie: saved } })).status, 401);
  await app.client.login("admin.local", f.password);
  assert.equal(
    (await app.client.call("/api/auth/revoke", { method: "POST", body: { user_id: f.id } })).status,
    200,
  );
  assert.equal((await app.client.call("/api/state")).status, 401);
  await app.client.login("admin.local", f.password);
  now += 8 * 60 * 60 * 1000 + 1;
  assert.equal((await app.client.call("/api/state")).status, 401);
  assert.match(sessionCookie("example", "value", true), /; Secure$/);
});

test("Node autenticación: errores uniformes y limitación de intentos persistente entre reinicios", async (t) => {
  const f = await fixture(t);
  const app = await f.start();
  assert.equal((await app.client.login("admin.local", secret())).status, 401);
  assert.equal((await app.client.login("unknown", secret())).json.error, "Credenciales inválidas.");
  for (let count = 0; count < 4; count++)
    assert.equal((await app.client.login("admin.local", secret())).status, 401);
  assert.equal((await app.client.login("admin.local", f.password)).status, 429);
  await app.close();
  const next = await f.start();
  assert.equal((await next.client.login("admin.local", f.password)).status, 429);
});

test("Node permisos: ADMIN, OPERATOR y VIEWER, cambios de rol, desactivación y último administrador", async (t) => {
  const f = await fixture(t);
  const app = await logged(f);
  const viewer = await addUser(app, "reader", "VIEWER");
  assert.equal((await viewer.call("/api/state")).status, 200);
  const before = await app.client.state();
  assert.equal(
    (
      await viewer.call("/api/command", {
        method: "POST",
        body: { type: "CUSTOMER_SAVE", payload: { name: "Forbidden" }, request_id: randomUUID() },
      })
    ).status,
    403,
  );
  assert.deepEqual(await app.client.state(), before);
  assert.equal((await viewer.credentials(f.id, "stolen", secret())).status, 403);
  const operator = await addUser(app, "writer", "OPERATOR");
  const operatorRequest = randomUUID();
  const operatorResult = await operator.command(
    "CUSTOMER_SAVE",
    { name: "Operador permitido" },
    operatorRequest,
  );
  assert.equal(
    (
      await operator.call("/api/command", {
        method: "POST",
        body: { type: "USER_SAVE", payload: { id: "intruder" }, request_id: randomUUID() },
      })
    ).status,
    403,
  );
  await app.client.command("USER_SAVE", { id: "writer", name: "Consulta", role: "VIEWER" });
  assert.equal((await operator.call("/api/state")).status, 401);
  await operator.login("login-writer", operator.password);
  const afterRoleChange = await app.client.state();
  assert.equal(
    await operator.command("CUSTOMER_SAVE", { name: "Operador permitido" }, operatorRequest),
    operatorResult,
  );
  assert.deepEqual(await app.client.state(), afterRoleChange);
  assert.equal(
    (
      await operator.call("/api/command", {
        method: "POST",
        body: { type: "CUSTOMER_SAVE", payload: { name: "Blocked" }, request_id: randomUUID() },
      })
    ).status,
    403,
  );
  await app.client.command("USER_SAVE", { id: "reader", name: "Inactivo", role: "VIEWER", is_active: false });
  assert.equal((await viewer.call("/api/state")).status, 401);
  assert.equal((await viewer.login("login-reader", viewer.password)).status, 401);
  const current = await app.client.state();
  const denied = await app.client.call("/api/command", {
    method: "POST",
    body: {
      type: "USER_SAVE",
      payload: { id: f.id, name: "Last", role: "VIEWER" },
      request_id: randomUUID(),
    },
  });
  assert.equal(denied.status, 422);
  assert.match(denied.json.error, /administrador/);
  assert.deepEqual(await app.client.state(), current);
});

test("Node credenciales: vincula usuarios existentes, rechaza duplicados y revoca sesiones al cambiar contraseña", async (t) => {
  const f = await fixture(t);
  const app = await logged(f);
  const viewer = await addUser(app, "linked", "VIEWER");
  const before = await app.client.state();
  assert.equal((await app.client.credentials("nonexistent", "other", secret())).status, 422);
  assert.equal((await app.client.credentials("linked", "admin.local", secret())).status, 409);
  const nextPassword = secret();
  assert.equal((await app.client.credentials("linked", "login-linked", nextPassword)).status, 200);
  assert.equal((await viewer.call("/api/state")).status, 401);
  assert.equal((await viewer.login("login-linked", viewer.password)).status, 401);
  assert.equal((await viewer.login("login-linked", nextPassword)).status, 200);
  assert.deepEqual(await app.client.state(), before);
});

test("Node seguridad HTTP: Host, Origin, DNS rebinding, CSRF, cookies ambiguas e identidad falsificada", async (t) => {
  const f = await fixture(t);
  const app = await logged(f);
  const before = await app.client.state();
  // fetch/Undici rewrites Host; node:http sends the actual forged wire header.
  for (const host of ["evil.invalid", "localhost:" + new URL(app.url).port, "127.0.0.1.evil.invalid"]) {
    const status = await new Promise((resolve, reject) => {
      const request = httpRequest(
        app.url + "/api/state",
        { headers: { host, cookie: app.client.cookie } },
        (response) => {
          response.resume();
          response.on("end", () => resolve(response.statusCode));
        },
      );
      request.on("error", reject);
      request.end();
    });
    assert.equal(status, 403);
  }
  for (const origin of ["https://evil.invalid", "null"])
    assert.equal((await app.client.call("/api/state", { headers: { origin } })).status, 403);
  for (const identity of ["oai-authenticated-user-id", "x-user-id", "x-authenticated-user-id"])
    assert.equal((await app.client.call("/api/state", { headers: { [identity]: f.id } })).status, 400);
  const anonymous = client(app.url);
  assert.equal((await anonymous.call("/api/state")).status, 401);
  assert.equal((await anonymous.call("/api/auth/credentials", { method: "POST", body: {} })).status, 401);
  for (const headers of [
    { origin: "" },
    { origin: "http://evil.invalid" },
    { "x-csrf-token": "bad" },
    { "x-csrf-token": "" },
    { "sec-fetch-site": "cross-site" },
  ])
    assert.equal(
      (
        await app.client.call("/api/command", {
          method: "POST",
          body: { type: "CUSTOMER_SAVE", payload: { name: "No" }, request_id: randomUUID() },
          headers,
        })
      ).status,
      403,
    );
  assert.equal(
    (
      await app.client.call("/api/state", {
        headers: { cookie: `${app.client.cookie}; ${app.client.cookie}` },
      })
    ).status,
    400,
  );
  const response = await app.client.call("/api/state");
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(response.headers.get("access-control-allow-origin"), null);
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.deepEqual(await app.client.state(), before);
});

test("Node seguridad HTTP: JSON malformado, UTF-8 inválido y límite real de bytes incluso por chunks", async (t) => {
  const f = await fixture(t);
  const app = await logged(f);
  const before = await app.client.state();
  assert.equal((await app.client.call("/api/command", { method: "POST", raw: "{" })).status, 400);
  assert.equal((await app.client.call("/api/command", { method: "POST", raw: "null" })).status, 400);
  assert.equal(
    (await app.client.call("/api/command", { method: "POST", raw: Buffer.from([0xff]) })).status,
    400,
  );
  assert.equal(
    (
      await app.client.call("/api/command", {
        method: "POST",
        body: {},
        headers: { "content-type": "text/plain" },
      })
    ).status,
    415,
  );
  const bytes = JSON.stringify({ payload: "ñ".repeat(130000) });
  assert.ok(bytes.length < 250000);
  assert.ok(Buffer.byteLength(bytes) > 250000);
  assert.equal((await app.client.call("/api/command", { method: "POST", raw: bytes })).status, 413);
  const result = await new Promise((resolve, reject) => {
    const request = httpRequest(
      app.url + "/api/command",
      {
        method: "POST",
        headers: {
          origin: app.url,
          "content-type": "application/json",
          cookie: app.client.cookie,
          "x-csrf-token": app.client.csrf,
          "transfer-encoding": "chunked",
        },
      },
      (response) => {
        response.resume();
        response.on("end", () => resolve(response.statusCode));
      },
    );
    request.on("error", reject);
    request.write(bytes.slice(0, 80000));
    request.end(bytes.slice(80000));
  });
  assert.equal(result, 413);
  const invalid = await app.client.call("/api/command", {
    method: "POST",
    body: { type: "CUSTOMER_SAVE", payload: {}, request_id: randomUUID() },
  });
  assert.equal(invalid.status, 422);
  assert.deepEqual(await app.client.state(), before);
});

test("Node concurrencia: misma operación crea una sola auditoría y escritores distintos no pierden registros", async (t) => {
  const f = await fixture(t);
  const app = await logged(f);
  const before = await app.client.state();
  const id = randomUUID();
  const results = await Promise.all(
    [0, 1, 2].map(() => app.client.command("CUSTOMER_SAVE", { name: "Una operación" }, id)),
  );
  assert.equal(new Set(results).size, 1);
  await Promise.all(
    Array.from({ length: 6 }, (_, index) =>
      app.client.command("CUSTOMER_SAVE", { name: "Concurrente " + index }),
    ),
  );
  const after = await app.client.state();
  assert.equal(after.revision, before.revision + 7);
  assert.equal(after.customers.length, before.customers.length + 7);
  assert.equal(after.audit.filter((row) => row.request_id === id).length, 1);
});

test("Node SQLite: lock devuelve error seguro sin efectos y el mismo request_id permite reintento", async (t) => {
  const f = await fixture(t);
  const app = await logged(f);
  const before = await app.client.state();
  const lock = new DatabaseSync(f.database);
  lock.exec("BEGIN IMMEDIATE");
  const id = randomUUID();
  try {
    const blocked = await app.client.call("/api/command", {
      method: "POST",
      body: { type: "CUSTOMER_SAVE", payload: { name: "Retry" }, request_id: id },
    });
    assert.equal(blocked.status, 503);
    assert.doesNotMatch(JSON.stringify(blocked.json), /SELECT|SQLITE|sqlite|Users|stack|constraint/);
  } finally {
    lock.exec("ROLLBACK");
    lock.close();
  }
  assert.deepEqual(await app.client.state(), before);
  await app.client.command("CUSTOMER_SAVE", { name: "Retry" }, id);
});

test("Node SQLite: revisión obsoleta entre servidores rechaza sin sobrescritura", async (t) => {
  const f = await fixture(t);
  const first = await logged(f);
  const second = await f.start();
  await second.client.login("admin.local", f.password);
  // Both HTTP requests read the same revision before their asynchronous store batches complete.
  const responses = await Promise.all(
    [first, second].map((app, index) =>
      app.client.call("/api/command", {
        method: "POST",
        body: { type: "CUSTOMER_SAVE", payload: { name: "Servidor " + index }, request_id: randomUUID() },
      }),
    ),
  );
  assert.ok(responses.every((response) => [200, 422].includes(response.status)));
  const state = await first.client.state();
  assert.equal(
    state.customers.filter((row) => row.name.startsWith("Servidor ")).length,
    responses.filter((response) => response.status === 200).length,
  );
  // Revision CAS itself is deterministically exercised with a stale snapshot through the same adapter.
  const connection = openSqliteDatabase(f.database);
  const store = createStore(() => connection);
  const stale = await store.loadState();
  await first.client.command("CUSTOMER_SAVE", { name: "Nueva revisión" });
  await assert.rejects(
    store.persistState(stale, { ...stale, revision: stale.revision + 1 }),
    /Otra operación/,
  );
  connection.close();
});

test("Node SQLite: quitar settings externamente no activa bootstrap heredado vía HTTP", async (t) => {
  const f = await fixture(t);
  const app = await logged(f);
  const raw = new DatabaseSync(f.database);
  raw.exec("DELETE FROM settings WHERE id='company'");
  raw.close();
  assert.equal((await app.client.call("/api/state")).status, 503);
  assert.equal(
    (
      await app.client.call("/api/command", {
        method: "POST",
        body: { type: "CUSTOMER_SAVE", payload: { name: "Forbidden" }, request_id: randomUUID() },
      })
    ).status,
    503,
  );
  const check = new DatabaseSync(f.database);
  assert.equal(check.prepare("SELECT count(*) AS n FROM settings").get().n, 0);
  check.close();
});

test("Node CLI administrativa: entradas privadas por stdin, autorización histórica y destinos exclusivos", async (t) => {
  const f = await fixture(t, { historical: false, provision: false });
  const cli = join(appRoot, "server/admin.mts");
  const invoke = (args, input) =>
    spawnSync(process.execPath, [cli, ...args], {
      input: JSON.stringify(input),
      encoding: "utf8",
      windowsHide: true,
      timeout: 30000,
    });
  const input = { user_id: f.id, name: "Admin CLI sintético", login: "admin.local", password: f.password };
  const result = invoke(
    ["--database", f.database, "--auth-database", f.auth_database, "--mode", "new"],
    input,
  );
  assert.equal(result.status, 0, result.stderr);
  assert.doesNotMatch(result.stdout + result.stderr, new RegExp(f.password));
  const app = await logged(f);
  await app.close();
  const link = invoke(
    ["--database", f.database, "--auth-database", join(f.directory, "unauthorized.sqlite"), "--mode", "link"],
    input,
  );
  assert.equal(link.status, 1);
  assert.equal(existsSync(join(f.directory, "unauthorized.sqlite")), false);
});

test("Node autonomía: distribución compilada aislada, Internet denegado al proceso, sesiones y operaciones entre procesos", async (t) => {
  const f = await fixture(t);
  const built = spawnSync(process.execPath, [join(appRoot, "scripts/build-node.mjs")], {
    cwd: appRoot,
    encoding: "utf8",
    windowsHide: true,
    timeout: 120000,
  });
  assert.equal(built.status, 0, built.stdout + built.stderr);
  const distribution = join(f.root, "standalone", "app");
  cpSync(join(appRoot, "dist-node"), distribution, { recursive: true });
  for (const forbidden of ["wrangler", "vinext", "miniflare", "@cloudflare"])
    assert.equal(existsSync(join(distribution, "node_modules", forbidden)), false);
  const configFile = join(f.directory, "offline-config.json");
  const launch = async () => {
    const child = spawn(
      process.execPath,
      [
        "--import",
        pathToFileURL(join(appRoot, "tests/helpers/deny-external-network.mjs")).href,
        join(distribution, "server/main.mjs"),
        "--config",
        configFile,
      ],
      {
        cwd: f.root,
        windowsHide: true,
        stdio: ["ignore", "pipe", "pipe"],
        env: { ...process.env, NODE_OPTIONS: "", NODE_PATH: "" },
      },
    );
    let stdout = "";
    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    t.after(() => {
      if (child.exitCode === null) child.kill();
    });
    const address = await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("Backend no inició: " + stdout + stderr)), 30000);
      child.once("error", reject);
      child.once("exit", (code) => {
        clearTimeout(timeout);
        reject(new Error("Backend terminó " + code + ": " + stderr));
      });
      child.stdout.on("data", (chunk) => {
        stdout += chunk;
        const line = stdout.split(/\r?\n/).find((item) => item.startsWith('{"event":"LISTENING"'));
        if (line) {
          clearTimeout(timeout);
          resolve(JSON.parse(line).address);
        }
      });
    });
    assert.match(stdout, /TEST_NETWORK_GUARD_ACTIVE/);
    return { child, address };
  };
  // Reserve a loopback port only to select a valid explicit CLI configuration.
  const reservation = await f.start();
  const port = Number(new URL(reservation.url).port);
  await reservation.close();
  writeFileSync(configFile, JSON.stringify({ ...f.config, port }), { mode: 0o600 });
  const first = await launch();
  const offline = client(first.address);
  assert.equal((await offline.login("admin.local", f.password)).status, 200);
  await cashCreditScenario({ run: offline.command, state: offline.state });
  const before = await offline.state();
  const savedCookie = offline.cookie;
  first.child.kill();
  await new Promise((resolve) => first.child.once("exit", resolve));
  const second = await launch();
  const reopened = await client(second.address).call("/api/state", { headers: { cookie: savedCookie } });
  assert.equal(reopened.status, 200);
  assert.deepEqual(reopened.json.state, before);
});

test("Node acceso administrativo: otro ADMIN sin credencial no permite retirar el último acceso local", async (t) => {
  const f = await fixture(t);
  const app = await logged(f);
  await app.client.command("USER_SAVE", {
    id: "unlinked-admin",
    name: "Admin sin credenciales",
    role: "ADMIN",
  });
  const before = await app.client.state();
  const response = await app.client.call("/api/command", {
    method: "POST",
    body: {
      type: "USER_SAVE",
      payload: { id: f.id, name: "Retirar", role: "VIEWER" },
      request_id: randomUUID(),
    },
  });
  assert.equal(response.status, 422);
  assert.match(response.json.error, /último acceso/);
  assert.deepEqual(await app.client.state(), before);
  const password = secret();
  assert.equal((await app.client.credentials("unlinked-admin", "other-admin", password)).status, 200);
  await app.client.command("USER_SAVE", { id: f.id, name: "Consulta", role: "VIEWER" });
  assert.equal((await app.client.call("/api/state")).status, 401);
  const other = client(app.url);
  assert.equal((await other.login("other-admin", password)).status, 200);
});

test("Node sesiones: cambios externos de rol y actividad invalidan el acceso sin confiar en la cookie", async (t) => {
  const f = await fixture(t);
  const app = await logged(f);
  const viewer = await addUser(app, "external", "VIEWER");
  const raw = new DatabaseSync(f.database);
  try {
    const user = JSON.parse(raw.prepare("SELECT data FROM users WHERE id='external'").get().data);
    user.role = "OPERATOR";
    raw.prepare("UPDATE users SET data=? WHERE id='external'").run(JSON.stringify(user));
    assert.equal((await viewer.call("/api/state")).status, 403);
    assert.equal((await viewer.call("/api/state")).status, 401);
    assert.equal((await viewer.login("login-external", viewer.password)).status, 200);
    user.is_active = false;
    raw.prepare("UPDATE users SET data=? WHERE id='external'").run(JSON.stringify(user));
    assert.equal((await viewer.call("/api/state")).status, 403);
  } finally {
    raw.close();
  }
});

test("Node HTTPS: TLS real con certificado sintético, Origin exacto y cookie Secure", async (t) => {
  const f = await fixture(t);
  const key = join(f.directory, "synthetic.key");
  const certificate = join(f.directory, "synthetic.pem");
  const generated = spawnSync(
    "openssl",
    [
      "req",
      "-x509",
      "-newkey",
      "rsa:2048",
      "-nodes",
      "-keyout",
      key,
      "-out",
      certificate,
      "-days",
      "1",
      "-subj",
      "/CN=localhost",
      "-addext",
      "subjectAltName=IP:127.0.0.1",
    ],
    { encoding: "utf8", windowsHide: true, timeout: 30000 },
  );
  if (generated.error?.code === "ENOENT") {
    t.skip("Se requiere OpenSSL únicamente para generar el certificado sintético del test TLS.");
    return;
  }
  assert.equal(generated.status, 0, generated.stderr);
  chmodSync(key, 0o600);
  chmodSync(certificate, 0o600);
  f.config.tls_key = key;
  f.config.tls_certificate = certificate;
  const app = await f.start();
  assert.match(app.url, /^https:\/\/127\.0\.0\.1:/);
  const body = JSON.stringify({ login: "admin.local", password: f.password });
  const result = await new Promise((resolve, reject) => {
    const request = httpsRequest(
      app.url + "/api/auth/login",
      {
        method: "POST",
        ca: readFileSync(certificate),
        headers: {
          origin: app.url,
          "content-type": "application/json",
          "content-length": Buffer.byteLength(body),
        },
      },
      (response) => {
        response.resume();
        response.on("end", () =>
          resolve({ status: response.statusCode, cookie: response.headers["set-cookie"]?.[0] }),
        );
      },
    );
    request.on("error", reject);
    request.end(body);
  });
  assert.equal(result.status, 200);
  assert.match(result.cookie, /; Secure$/);
});
