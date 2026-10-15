import { test } from "node:test";
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { build } from "vite";
import { createHash, randomUUID } from "node:crypto";
import { cpSync, mkdtempSync, readFileSync, realpathSync, renameSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, isAbsolute, sep } from "node:path";
import { localAppFixture, appRoot } from "../helpers/local-app-server.mjs";
import { cashCreditScenario } from "../helpers/regression-scenarios.mjs";
import { createPortal } from "../../integration/portal.mjs";
import { packageModule } from "../../scripts/package-module.mjs";

const prefix = "/modulos/nutrequine/";
const hash = (file) => createHash("sha256").update(readFileSync(file)).digest("hex");
async function portalFor(server, mode) {
  const portal = createPortal({ moduleUrl: server.baseURL, mode, prefix });
  await new Promise((resolve) => portal.listen(0, "127.0.0.1", resolve));
  return { portal, url: `http://127.0.0.1:${portal.address().port}` };
}
async function browserFor(t, server, mode) {
  const { portal, url } = await portalFor(server, mode);
  let browser;
  t.after(async () => {
    try {
      await browser?.close();
    } finally {
      await new Promise((resolve) => portal.close(resolve));
      await server.stop();
    }
  });
  browser = await chromium.launch({
    channel: process.env.REGRESSION_BROWSER_CHANNEL || undefined,
    headless: true,
  });
  const context = await browser.newContext({ serviceWorkers: "block" });
  const errors = [];
  const external = [];
  const failedResources = [];
  const allowed = new Set(mode === "A" ? [url, server.baseURL] : [url]);
  await context.route("**/*", (route) => {
    if (allowed.has(new URL(route.request().url()).origin)) return route.continue();
    external.push(route.request().url());
    return route.abort();
  });
  const page = await context.newPage();
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("requestfailed", (req) =>
    failedResources.push({ url: req.url(), error: req.failure()?.errorText }),
  );
  page.on("response", (response) => {
    if (
      ["script", "stylesheet", "image"].includes(response.request().resourceType()) &&
      response.status() >= 400
    )
      failedResources.push({ url: response.url(), status: response.status() });
  });
  await page.goto(url);
  await page.screenshot({ path: join(server.evidence, `portal-${mode}.png`) });
  await page.getByRole("link", { name: "Abrir Nutrequine Pro" }).click();
  const origin = mode === "A" ? server.baseURL : url;
  const apiRoot = origin + (mode === "A" ? "/" : prefix);
  assert.equal(new URL(page.url()).origin, origin);
  assert.equal(new URL(page.url()).pathname, mode === "A" ? "/" : prefix);
  await page.getByLabel("Usuario", { exact: true }).fill("admin.local");
  await page.getByLabel("Contraseña", { exact: true }).fill(server.password);
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await page.getByRole("heading", { name: "Resumen", exact: true, level: 1 }).waitFor();
  const session = await context.request.get(apiRoot + "api/auth/session");
  assert.equal(session.status(), 200);
  const csrf = (await session.json()).csrf_token;
  async function state() {
    const result = await context.request.get(apiRoot + "api/state");
    assert.equal(result.status(), 200);
    return (await result.json()).state;
  }
  async function run(type, payload, request_id = randomUUID()) {
    const result = await context.request.post(apiRoot + "api/command", {
      headers: { Origin: origin, "X-CSRF-Token": csrf },
      data: { type, payload, request_id },
    });
    assert.equal(result.status(), 200, await result.text());
    return (await result.json()).result;
  }
  return {
    page,
    context,
    origin,
    apiRoot,
    csrf,
    state,
    run,
    errors,
    external,
    failedResources,
    portalUrl: url,
  };
}

test(
  "Integración 12 A: paquete reproducible, portal real, negocio, reinicio y reemplazo de código",
  { timeout: 240000 },
  async (t) => {
    const root = mkdtempSync(join(tmpdir(), "nutrequine-12-release-"));
    const first = join(root, "release-1");
    const second = join(root, "release-2");
    packageModule(first);
    packageModule(second);
    assert.equal(hash(join(first, "MODULE-MANIFEST.json")), hash(join(second, "MODULE-MANIFEST.json")));
    const server = await localAppFixture({ distributionSource: join(first, "app") });
    const browser = await browserFor(t, server, "A");
    const { page, state, run } = browser;
    await page.locator("nav").getByRole("button", { name: "Clientes", exact: true }).click();
    await page.getByRole("button", { name: "Nuevo cliente", exact: true }).click();
    await page.getByRole("dialog").getByLabel("Nombre", { exact: true }).fill("Cliente portal sintético 12");
    await page.getByRole("dialog").getByRole("button", { name: "Guardar", exact: true }).click();
    await page.getByRole("button", { name: "Cliente portal sintético 12", exact: true }).waitFor();
    await cashCreditScenario({ state, run });
    const before = await state();
    const authenticationBefore = before.users;
    const databasePath = realpathSync(server.database);
    await page.screenshot({ path: join(server.evidence, "module-a-customer.png") });
    await server.stop();
    const code = realpathSync(server.distribution);
    const location = relative(realpathSync(server.root), code);
    assert.ok(location && !isAbsolute(location) && location !== ".." && !location.startsWith(".." + sep));
    renameSync(code, code + ".previous");
    cpSync(join(second, "app"), code, { recursive: true, errorOnExist: true, force: false });
    assert.equal(realpathSync(server.database), databasePath);
    await server.start();
    assert.deepEqual(await state(), before);
    assert.deepEqual((await state()).users, authenticationBefore);
    await page.reload();
    await page.getByRole("button", { name: "Cliente portal sintético 12", exact: true }).waitFor();
    await run("CUSTOMER_SAVE", { name: "Cliente posterior a actualización 12" });
    const afterWrite = await state();
    await server.stop();
    await server.start();
    assert.deepEqual(await state(), afterWrite);
    assert.deepEqual(browser.errors, []);
    assert.deepEqual(browser.external, []);
    assert.deepEqual(browser.failedResources, []);
    writeFileSync(
      join(server.evidence, "integration-a.json"),
      JSON.stringify(
        {
          mode: "A",
          passed: true,
          manifest_sha256: hash(join(first, "MODULE-MANIFEST.json")),
          customers: afterWrite.customers.length,
          audit: afterWrite.audit.length,
          externalRequests: browser.external,
          pageErrors: browser.errors,
        },
        null,
        2,
      ),
    );
    console.log("Integration A evidence: " + server.evidence);
  },
);

test(
  "Integración 12 B: recursos prefijados, autenticación real, cookies, CSRF, Host/Origin y comercio",
  { timeout: 240000 },
  async (t) => {
    const root = mkdtempSync(join(tmpdir(), "nutrequine-12-prefix-"));
    const frontend = join(root, "public-client");
    await build({
      configFile: join(appRoot, "client/vite.config.mts"),
      base: prefix,
      build: { outDir: frontend, emptyOutDir: false },
      logLevel: "warn",
    });
    const server = await localAppFixture({ frontendDirectory: frontend });
    const browser = await browserFor(t, server, "B");
    const { page, context, origin, apiRoot, csrf, state, run } = browser;
    assert.equal(await page.locator(".sidebar img").evaluate((image) => image.naturalWidth > 0), true);
    assert.match(await page.locator(".sidebar img").getAttribute("src"), /^\/modulos\/nutrequine\/brand\//);
    assert.equal((await context.request.get(origin + "/api/state")).status(), 404);
    const cookie = (await context.cookies()).find((value) => value.name.startsWith("nutrequine_"));
    assert.equal(cookie.path, prefix + "api");
    assert.equal(cookie.httpOnly, true);
    assert.equal(cookie.sameSite, "Strict");
    const before = await state();
    const command = {
      type: "CUSTOMER_SAVE",
      payload: { name: "No debe existir 12" },
      request_id: randomUUID(),
    };
    for (const [headers, status] of [
      [{ Origin: origin }, 403],
      [{ Origin: "https://outside.invalid", "X-CSRF-Token": csrf }, 403],
      [{ Origin: origin, "X-CSRF-Token": csrf, Host: "outside.invalid" }, 403],
      [{ Origin: origin, "X-CSRF-Token": csrf, "X-User-Id": "ADMIN" }, 400],
    ]) {
      const denied = await context.request.post(apiRoot + "api/command", { headers, data: command });
      assert.equal(denied.status(), status);
    }
    assert.deepEqual(await state(), before);
    for (const file of ["server/config.mts", "database.sqlite", ".env", "../server/passwords.mts"])
      assert.ok([400, 404].includes((await context.request.get(apiRoot + file)).status()), file);
    await cashCreditScenario({ state, run });
    const beforeRestart = await state();
    await server.stop();
    await server.start();
    assert.deepEqual(await state(), beforeRestart);
    await page.reload();
    await page.getByRole("heading", { name: "Resumen", exact: true, level: 1 }).waitFor();
    await page.getByAltText("Logo Nutrequine Pro", { exact: true }).waitFor();
    await page.waitForFunction(() =>
      [...document.images].every((image) => image.complete && image.naturalWidth > 0),
    );
    assert.equal(
      await page
        .getByAltText("Logo Nutrequine Pro", { exact: true })
        .evaluate((image) => image.complete && image.naturalWidth > 0),
      true,
    );
    await page.screenshot({ path: join(server.evidence, "module-b-dashboard.png") });
    await page.locator("nav").getByRole("button", { name: "Configuración", exact: true }).click();
    await page.waitForFunction(() =>
      [...document.images].every((image) => image.complete && image.naturalWidth > 0),
    );
    await page.screenshot({ path: join(server.evidence, "module-b-configuration.png") });
    const logout = await context.request.post(apiRoot + "api/auth/logout", {
      headers: { Origin: origin, "X-CSRF-Token": csrf },
      data: {},
    });
    assert.equal(logout.status(), 200);
    assert.equal((await context.request.get(apiRoot + "api/state")).status(), 401);
    assert.deepEqual(browser.errors, []);
    assert.deepEqual(browser.external, []);
    assert.deepEqual(browser.failedResources, []);
    writeFileSync(
      join(server.evidence, "integration-b.json"),
      JSON.stringify(
        {
          mode: "B",
          passed: true,
          prefix,
          cookiesScoped: true,
          invalidRequestsPreserveState: true,
          externalRequests: browser.external,
          pageErrors: browser.errors,
        },
        null,
        2,
      ),
    );
    console.log("Integration B evidence: " + server.evidence);
  },
);
