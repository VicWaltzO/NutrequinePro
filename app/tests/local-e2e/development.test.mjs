import { chromium } from "playwright";
import { test } from "node:test";
import assert from "node:assert/strict";
import { localAppFixture, appRoot } from "../helpers/local-app-server.mjs";

test(
  "Frontend 08 desarrollo: Vite detrás de Fastify conserva Host, Origin, cookie y CSRF",
  { timeout: 150000 },
  async (t) => {
    const server = await localAppFixture({ development: true });
    t.after(server.stop);
    console.log("Development evidence: " + server.evidence);
    const browser = await chromium.launch({
      channel: process.env.REGRESSION_BROWSER_CHANNEL || undefined,
      headless: true,
    });
    t.after(() => browser.close());
    const context = await browser.newContext();
    const page = await context.newPage();
    const errors = [];
    const connections = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("websocket", (socket) => connections.push(socket.url()));
    await page.goto(server.baseURL);
    await page.getByLabel("Usuario", { exact: true }).fill("admin.local");
    await page.getByLabel("Contraseña", { exact: true }).fill(server.password);
    await page.getByRole("button", { name: "Entrar", exact: true }).click();
    await page.getByRole("heading", { name: "Resumen", level: 1, exact: true }).waitFor();
    await page.locator("nav").getByRole("button", { name: "Clientes", exact: true }).click();
    await page.getByRole("button", { name: "Nuevo cliente", exact: true }).click();
    await page.getByRole("dialog").getByLabel("Nombre", { exact: true }).fill("Cliente Vite sintético 08");
    const saved = page.waitForResponse(
      (response) => response.url().endsWith("/api/command") && response.request().method() === "POST",
    );
    await page.getByRole("dialog").getByRole("button", { name: "Guardar", exact: true }).click();
    assert.equal((await saved).status(), 200);
    await page.reload();
    await page.getByRole("button", { name: "Cliente Vite sintético 08", exact: true }).waitFor();
    const privateSource = await context.request.get(
      server.baseURL + "/@fs/" + appRoot.replaceAll("\\", "/") + "server/passwords.mts",
    );
    assert.ok([403, 404].includes(privateSource.status()));
    assert.doesNotMatch(await privateSource.text(), /scrypt-N131072|hashPassword/);
    const foreign = await context.request.post(server.baseURL + "/api/command", {
      headers: { Origin: "https://outside.invalid" },
      data: {},
    });
    assert.equal(foreign.status(), 403);
    assert.ok(
      connections.some((url) => new URL(url).host === new URL(server.baseURL).host),
      "HMR debe usar el mismo puerto protegido",
    );
    assert.deepEqual(errors, []);
  },
);
