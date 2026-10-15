import { test } from "node:test";
import assert from "node:assert/strict";
import { chromium, request } from "playwright";
import { randomBytes, randomUUID, createHash } from "node:crypto";
import { cpSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { platform, release, cpus } from "node:os";
import { DatabaseSync } from "node:sqlite";
import { localAppFixture } from "../helpers/local-app-server.mjs";
import { cashCreditScenario, productionPayload, scenarioDate } from "../helpers/regression-scenarios.mjs";

function summarize(samples) {
  const sorted = [...samples].sort((a, b) => a - b);
  return {
    count: sorted.length,
    min_ms: sorted[0],
    median_ms: sorted[Math.ceil(sorted.length * 0.5) - 1],
    p95_ms: sorted[Math.ceil(sorted.length * 0.95) - 1],
    max_ms: sorted.at(-1),
  };
}

function memorySample(pid) {
  const result =
    process.platform === "win32"
      ? spawnSync(
          join(process.env.SystemRoot, "System32/WindowsPowerShell/v1.0/powershell.exe"),
          [
            "-NoProfile",
            "-NonInteractive",
            "-Command",
            `$p=Get-Process -Id ${pid}; @{rss_bytes=$p.WorkingSet64; peak_rss_bytes=$p.PeakWorkingSet64} | ConvertTo-Json -Compress`,
          ],
          { encoding: "utf8", windowsHide: true, timeout: 15000 },
        )
      : spawnSync("ps", ["-o", "rss=", "-p", String(pid)], { encoding: "utf8", timeout: 15000 });
  assert.equal(result.status, 0, "No se pudo medir memoria del proceso de prueba");
  return process.platform === "win32"
    ? JSON.parse(result.stdout)
    : { rss_bytes: Number(result.stdout.trim()) * 1024 };
}

test(
  "Cierre 11: mediciones locales, concurrencia, teclado y copia consistente de autenticación",
  { timeout: 360000 },
  async (t) => {
    const server = await localAppFixture({ minimalEnvironment: true });
    t.after(server.stop);
    console.log("Final validation evidence: " + server.evidence);
    const metrics = {
      synthetic: true,
      environment: {
        node: process.version,
        sqlite: process.versions.sqlite,
        platform: platform(),
        release: release(),
        cpu: cpus()[0].model,
      },
      startup_ms: server.startDurations,
      runtime_environment:
        "Solo variables estándar de sistema; sin variables del agente, NODE_PATH ni NODE_OPTIONS",
      samples: {},
      memory: [],
      pageErrors: [],
      requestFailures: [],
      externalRequests: [],
      passed: false,
    };
    t.after(() =>
      writeFileSync(join(server.evidence, "final-validation.json"), JSON.stringify(metrics, null, 2)),
    );
    const api = await request.newContext({ baseURL: server.baseURL });
    t.after(() => api.dispose());
    let csrf;
    async function login(client = api, name = "admin.local", password = server.password) {
      const response = await client.post("/api/auth/login", {
        headers: { Origin: server.baseURL },
        data: { login: name, password },
      });
      assert.equal(response.status(), 200);
      return (await response.json()).csrf_token;
    }
    async function timed(name, operation) {
      const start = performance.now();
      const result = await operation();
      (metrics.samples[name] ??= []).push(performance.now() - start);
      return result;
    }
    async function state() {
      const response = await api.get("/api/state");
      assert.equal(response.status(), 200);
      return (await response.json()).state;
    }
    async function command(type, payload, request_id = randomUUID()) {
      return timed("command_" + type, async () => {
        const response = await api.post("/api/command", {
          headers: { Origin: server.baseURL, "X-CSRF-Token": csrf },
          data: { type, payload, request_id },
        });
        assert.equal(response.status(), 200, await response.text());
        return (await response.json()).result;
      });
    }
    csrf = await timed("login", () => login());
    metrics.memory.push({ phase: "authenticated", ...memorySample(server.pid) });
    await cashCreditScenario({ run: command, state });
    await command("PRODUCTION_SAVE", productionPayload());
    const initial = await state();
    for (let index = 0; index < 100; index++)
      await timed("customer_sequential", () =>
        command("CUSTOMER_SAVE", { name: "Carga sintética secuencial " + index }),
      );
    await Promise.all(
      Array.from({ length: 16 }, (_, index) =>
        timed("customer_concurrency_16", () =>
          command("CUSTOMER_SAVE", { name: "Carga sintética simultánea " + index }),
        ),
      ),
    );
    const duplicateId = randomUUID();
    const duplicates = await Promise.all(
      Array.from({ length: 16 }, () =>
        timed("duplicate_concurrency_16", () =>
          command("CUSTOMER_SAVE", { name: "Carga sintética idempotente" }, duplicateId),
        ),
      ),
    );
    assert.equal(new Set(duplicates).size, 1);
    const after = await state();
    assert.equal(after.customers.length, initial.customers.length + 117);
    assert.equal(after.audit.length, initial.audit.length + 117);
    assert.equal(after.audit.filter((row) => row.request_id === duplicateId).length, 1);
    for (let index = 0; index < 20; index++)
      await command("EXPENSE_CREATE", {
        date: scenarioDate,
        category: after.config.expense_categories[0],
        description: "Gasto sintético medido " + index,
        amount: "0.01",
      });
    for (let index = 0; index < 30; index++) await timed("state_sequential", state);
    for (let burst = 0; burst < 4; burst++)
      await Promise.all(Array.from({ length: 8 }, () => timed("state_concurrency_8", state)));
    metrics.memory.push({ phase: "after_load", ...memorySample(server.pid) });

    const beforeLock = await state();
    const lock = new DatabaseSync(server.database);
    const retryId = randomUUID();
    try {
      lock.exec("BEGIN IMMEDIATE");
      const blocked = await timed("sqlite_lock_response", () =>
        api.post("/api/command", {
          headers: { Origin: server.baseURL, "X-CSRF-Token": csrf },
          data: {
            type: "CUSTOMER_SAVE",
            payload: { name: "Reintento sintético medido" },
            request_id: retryId,
          },
        }),
      );
      assert.equal(blocked.status(), 503);
      assert.doesNotMatch(await blocked.text(), /SELECT|SQLITE|Users|stack|constraint/);
    } finally {
      if (lock.isTransaction) lock.exec("ROLLBACK");
      lock.close();
    }
    assert.deepEqual(await state(), beforeLock);
    await command("CUSTOMER_SAVE", { name: "Reintento sintético medido" }, retryId);
    await command("CUSTOMER_SAVE", { name: "Reintento sintético medido" }, retryId);
    assert.equal((await state()).audit.filter((row) => row.request_id === retryId).length, 1);

    const viewerPassword = randomBytes(24).toString("base64url");
    await command("USER_SAVE", { id: "viewer-copy-11", name: "Consulta sintética 11", role: "VIEWER" });
    const credential = await api.post("/api/auth/credentials", {
      headers: { Origin: server.baseURL, "X-CSRF-Token": csrf },
      data: { user_id: "viewer-copy-11", login: "viewer.copy", password: viewerPassword },
    });
    assert.equal(credential.status(), 200);
    const beforeCopy = await state();
    await server.stop();
    for (const suffix of ["-wal", "-shm", "-journal"])
      assert.equal(
        existsSync(server.authDatabase + suffix),
        false,
        "La copia física requiere cierre completo y ausencia de auxiliares",
      );
    const accessCopy = join(server.directory, "access-consistent-copy-11.sqlite");
    const originalHash = createHash("sha256").update(readFileSync(server.authDatabase)).digest("hex");
    await timed("auth_cold_copy", () =>
      cpSync(server.authDatabase, accessCopy, { errorOnExist: true, force: false }),
    );
    assert.equal(createHash("sha256").update(readFileSync(accessCopy)).digest("hex"), originalHash);
    const copied = new DatabaseSync(accessCopy, { readOnly: true });
    try {
      assert.equal(copied.prepare("PRAGMA integrity_check").get().integrity_check, "ok");
      assert.equal(copied.prepare("SELECT count(*) AS n FROM credentials").get().n, 2);
      assert.equal(copied.prepare("SELECT business_file FROM metadata").get().business_file, server.database);
    } finally {
      copied.close();
    }
    const config = JSON.parse(readFileSync(server.configFile, "utf8"));
    config.auth_database = accessCopy;
    writeFileSync(server.configFile, JSON.stringify(config));
    await server.start();
    csrf = await login();
    assert.deepEqual(await state(), beforeCopy);
    const viewer = await request.newContext({ baseURL: server.baseURL });
    try {
      await login(viewer, "viewer.copy", viewerPassword);
      assert.equal((await viewer.get("/api/state")).status(), 200);
    } finally {
      await viewer.dispose();
    }
    assert.equal(createHash("sha256").update(readFileSync(server.authDatabase)).digest("hex"), originalHash);
    metrics.authentication_copy = {
      credentials: 2,
      integrity: "ok",
      original_unchanged: true,
      business_path_binding_preserved: true,
    };

    const browser = await chromium.launch({
      channel: process.env.REGRESSION_BROWSER_CHANNEL || undefined,
      headless: true,
    });
    metrics.browser = browser.version();
    let context;
    let tracing = false;
    t.after(async () => {
      try {
        if (tracing) await context.tracing.stop({ path: join(server.evidence, "final-trace.zip") });
        if (context) await context.close();
      } finally {
        await browser.close();
      }
    });
    context = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
      locale: "es-PE",
      serviceWorkers: "block",
    });
    await context.route("**/*", (route) => {
      if (new URL(route.request().url()).origin === server.baseURL) return route.continue();
      metrics.externalRequests.push(route.request().url());
      return route.abort("blockedbyclient");
    });
    await context.tracing.start({ screenshots: true, snapshots: true });
    tracing = true;
    const page = await context.newPage();
    page.on("pageerror", (error) => metrics.pageErrors.push(error.message));
    page.on("requestfailed", (req) =>
      metrics.requestFailures.push({ url: req.url(), error: req.failure()?.errorText }),
    );
    await timed("browser_initial_login_view", async () => {
      await page.goto(server.baseURL);
      await page.getByLabel("Usuario", { exact: true }).waitFor();
    });
    await page.getByLabel("Usuario", { exact: true }).focus();
    await page.keyboard.type("admin.local");
    await page.keyboard.press("Tab");
    await assert.doesNotReject(() =>
      page.getByLabel("Contraseña", { exact: true }).evaluate((element) => {
        if (document.activeElement !== element) throw new Error("Orden de foco incorrecto");
      }),
    );
    await page.keyboard.type(server.password);
    await page.keyboard.press("Tab");
    assert.equal(
      await page
        .getByRole("button", { name: "Entrar", exact: true })
        .evaluate((element) => document.activeElement === element),
      true,
    );
    await timed("browser_login_to_dashboard", async () => {
      await page.keyboard.press("Enter");
      await page.getByRole("heading", { name: "Resumen", exact: true, level: 1 }).waitFor();
    });
    await page.locator("nav").getByRole("button", { name: "Clientes", exact: true }).focus();
    await page.keyboard.press("Enter");
    await page.getByRole("button", { name: "Nuevo cliente", exact: true }).focus();
    await page.keyboard.press("Enter");
    await page.getByRole("dialog").waitFor();
    assert.equal(await page.evaluate(() => document.activeElement.closest("dialog") !== null), true);
    await page.screenshot({ path: join(server.evidence, "keyboard-dialog-11.png") });
    await page.keyboard.press("Escape");
    assert.equal(await page.getByRole("dialog").count(), 0);
    await page.screenshot({ path: join(server.evidence, "keyboard-return-11.png") });
    assert.deepEqual(metrics.pageErrors, []);
    assert.deepEqual(metrics.requestFailures, []);
    assert.deepEqual(metrics.externalRequests, []);
    metrics.dataset = {
      customers: (await state()).customers.length,
      audit: (await state()).audit.length,
      bytes: readFileSync(server.database).length,
    };
    metrics.memory.push({ phase: "after_browser", ...memorySample(server.pid) });
    metrics.summary = Object.fromEntries(
      Object.entries(metrics.samples).map(([name, values]) => [name, summarize(values)]),
    );
    metrics.passed = true;
  },
);
