import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { chromium, expect } from "playwright/test";
import { localAppFixture } from "../helpers/local-app-server.mjs";
import { documentScenario } from "../helpers/document-scenario.mjs";

test(
  "PDF offline instalado: cuatro descargas, estados de interfaz, permisos y lectura sin efectos",
  { timeout: 300000 },
  async (t) => {
    const server = await localAppFixture({ development: process.env.UI_REVIEW_DEV === "1" });
    t.after(server.stop);
    const browser = await chromium.launch({ channel: process.env.REGRESSION_BROWSER_CHANNEL || undefined });
    t.after(() => browser.close());
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: "es-PE" });
    const external = [];
    await context.route("**/*", (route) => {
      if (new URL(route.request().url()).origin === server.baseURL) return route.continue();
      external.push(route.request().url());
      return route.abort();
    });
    assert.equal(
      (await context.request.get(server.baseURL + "/api/documents/balance/2026-10.pdf")).status(),
      401,
    );
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(server.baseURL);
    await page.getByLabel("Usuario", { exact: true }).fill("admin.local");
    await page.getByLabel("Contraseña", { exact: true }).fill(server.password);
    await page.getByRole("button", { name: "Entrar", exact: true }).click();
    await expect(page.locator(".sidebar-footer")).toBeVisible();
    const session = await (await context.request.get(server.baseURL + "/api/auth/session")).json();
    const run = async (type, payload, requestId = randomUUID()) => {
      const response = await context.request.post(server.baseURL + "/api/command", {
        headers: { Origin: server.baseURL, "X-CSRF-Token": session.csrf_token },
        data: { type, payload, request_id: requestId },
      });
      const body = await response.json();
      assert.equal(response.status(), 200, body.error ?? type);
      return body.result;
    };
    const state = async () => (await (await context.request.get(server.baseURL + "/api/state")).json()).state;
    const ids = await documentScenario({ run, state });
    const before = await state();
    const production = before.productions.find((row) => row.id === ids.planned);
    const sale = before.sales.find((row) => row.id === ids.secondSale);
    const customer = before.customers.find((row) => row.id === ids.customer);
    await page.reload();
    await expect(page.locator(".sidebar-footer")).toBeVisible();
    const capture = async (name) => {
      await page.evaluate(async () => {
        await document.fonts.ready;
        await Promise.all(
          document
            .getAnimations()
            .filter((animation) => animation.effect?.getTiming().iterations !== Infinity)
            .map((animation) => animation.finished.catch(() => {})),
        );
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      });
      await page.screenshot({
        path: join(server.evidence, name + ".png"),
        fullPage: !(await dialog.isVisible()),
      });
      if (name.includes("-mobile-")) {
        const heights = await page
          .locator(".pdf-download button:visible")
          .evaluateAll((buttons) => buttons.map((button) => button.getBoundingClientRect().height));
        assert.ok(
          heights.every((height) => height >= 44),
          "Objetivos PDF de al menos 44px en móvil",
        );
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      }
    };
    const go = async (hash) => {
      await page.evaluate((value) => {
        location.hash = value;
      }, hash);
    };
    const dialog = page.getByRole("dialog");
    const download = async (button, filename) => {
      const pending = page.waitForEvent("download");
      await button.click();
      const file = await pending;
      assert.equal(await file.failure(), null);
      assert.match(file.suggestedFilename(), filename);
      const target = join(server.evidence, file.suggestedFilename());
      await file.saveAs(target);
      assert.equal(readFileSync(target).subarray(0, 5).toString(), "%PDF-");
      await expect(button.locator("..").getByRole("status")).toHaveText("PDF descargado.");
    };
    await go("productions/draft");
    await download(
      page.getByRole("button", { name: "Exportar lote PDF", exact: true }).first(),
      /^NUTREQUINE_Lote_PR-\d+_\d{4}-\d{2}-\d{2}\.pdf$/,
    );
    await page.getByRole("button", { name: production.code, exact: true }).click();
    await download(
      dialog.getByRole("button", { name: "Exportar lote PDF", exact: true }),
      /^NUTREQUINE_Lote_/,
    );
    await capture("production-desktop-light");
    await dialog.getByRole("button", { name: "Cerrar", exact: true }).click();
    await go("sales");
    await page.getByRole("button", { name: sale.code, exact: true }).click();
    const saleButton = dialog.getByRole("button", { name: "Descargar nota de venta PDF", exact: true });
    let release;
    const gate = new Promise((resolve) => {
      release = resolve;
    });
    await page.route("**/api/documents/sale/*.pdf", async (route) => {
      await gate;
      await route.continue();
    });
    const pending = page.waitForEvent("download");
    await saleButton.click();
    await expect(dialog.getByRole("button", { name: "Generando PDF…", exact: true })).toBeDisabled();
    await capture("sale-busy-desktop-light");
    release();
    await pending;
    await page.unroute("**/api/documents/sale/*.pdf");
    await expect(saleButton).toBeEnabled();
    const neighbor = dialog.getByRole("button", { name: "Registrar pago", exact: true });
    const neighborHeight = (await neighbor.boundingBox()).height;
    await page.route("**/api/documents/sale/*.pdf", (route) =>
      route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ error: "No se pudo generar el PDF. Vuelva a intentar." }),
      }),
    );
    await saleButton.click();
    await expect(dialog.getByRole("alert")).toContainText("Vuelva a intentar");
    assert.equal(
      (await neighbor.boundingBox()).height,
      neighborHeight,
      "El mensaje no estira los botones vecinos",
    );
    await capture("sale-error-desktop-light");
    await page.unroute("**/api/documents/sale/*.pdf");
    await download(saleButton, /^NUTREQUINE_Venta_/);
    await capture("sale-desktop-light");
    await dialog.getByRole("button", { name: "Cerrar", exact: true }).click();
    await go("customers");
    await page.getByRole("button", { name: customer.name, exact: true }).click();
    await dialog.getByLabel("Desde", { exact: true }).fill("2026-10-01");
    await dialog.getByLabel("Hasta", { exact: true }).fill("2026-10-31");
    await download(
      dialog.getByRole("button", { name: "Exportar historial PDF", exact: true }),
      /^NUTREQUINE_Cliente_.*_Historial_/,
    );
    await capture("customer-desktop-light");
    await dialog.getByRole("button", { name: "Cerrar", exact: true }).click();
    await go("balance");
    await page.getByLabel("Mes del PDF", { exact: true }).fill("2026-10");
    await expect(page.getByLabel("Exportación del balance mensual")).toContainText(
      "2026-10-01 al 2026-10-31",
    );
    await download(
      page.getByRole("button", { name: "Exportar balance mensual PDF", exact: true }),
      /^NUTREQUINE_Balance_2026-10\.pdf$/,
    );
    await capture("balance-desktop-light");
    for (const theme of ["light", "dark"]) {
      if ((await page.locator("html").getAttribute("data-theme")) !== theme)
        await page
          .getByRole("button", {
            name: theme === "dark" ? "Activar modo oscuro" : "Activar modo claro",
            exact: true,
          })
          .click();
      for (const viewport of [
        { width: 1440, height: 1000 },
        { width: 390, height: 844 },
      ]) {
        await page.setViewportSize(viewport);
        const size = viewport.width === 390 ? "mobile" : "desktop";
        await capture(`balance-${size}-${theme}`);
        await go("productions/draft");
        await page.getByRole("button", { name: production.code, exact: true }).click();
        await capture(`production-${size}-${theme}`);
        await dialog.getByRole("button", { name: "Cerrar", exact: true }).click();
        await go("sales");
        await page.getByRole("button", { name: sale.code, exact: true }).click();
        await capture(`sale-${size}-${theme}`);
        await dialog.getByRole("button", { name: "Cerrar", exact: true }).click();
        await go("customers");
        await page.getByRole("button", { name: customer.name, exact: true }).click();
        await capture(`customer-${size}-${theme}`);
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
        await dialog.getByRole("button", { name: "Cerrar", exact: true }).click();
        await go("balance");
      }
    }
    assert.deepEqual(await state(), before, "Las descargas no alteran revisión, inventario ni auditoría");
    for (const [path, status] of [
      ["sale/missing.pdf", 404],
      ["constructor/missing.pdf", 404],
      ["balance/2026-13.pdf", 422],
      ["balance/2026-10.pdf?total=1", 422],
      [`customer/${ids.customer}.pdf?from=2026-10-31&to=2026-10-01`, 422],
      [`customer/${ids.customer}.pdf?from=a&from=b`, 422],
    ]) {
      assert.equal(
        (await context.request.get(server.baseURL + "/api/documents/" + path)).status(),
        status,
        path,
      );
    }
    for (const role of ["VIEWER", "OPERATOR"]) {
      const user = "document-" + role;
      const password = randomUUID() + randomUUID();
      await run("USER_SAVE", { id: user, name: role + " sintético", role });
      assert.equal(
        (
          await context.request.post(server.baseURL + "/api/auth/credentials", {
            headers: { Origin: server.baseURL, "X-CSRF-Token": session.csrf_token },
            data: { user_id: user, login: user, password },
          })
        ).status(),
        200,
      );
      const account = await browser.newContext();
      await account.request.post(server.baseURL + "/api/auth/login", {
        headers: { Origin: server.baseURL },
        data: { login: user, password },
      });
      const snapshot = await state();
      for (const [kind, id] of [
        ["production", ids.planned],
        ["sale", ids.firstSale],
        ["sale", ids.cancelled],
        ["customer", ids.customer],
        ["balance", "2026-10"],
      ]) {
        const response = await account.request.get(`${server.baseURL}/api/documents/${kind}/${id}.pdf`);
        assert.equal(
          response.status(),
          200,
          role + ": " + (await response.text().then((text) => text.slice(0, 10))),
        );
        assert.match(response.headers()["content-type"], /application\/pdf/);
      }
      assert.deepEqual(await state(), snapshot);
      await run("USER_SAVE", { id: user, name: role + " sintético", role, is_active: false });
      assert.equal(
        (await account.request.get(`${server.baseURL}/api/documents/balance/2026-10.pdf`)).status(),
        401,
      );
      await account.close();
    }
    assert.deepEqual(errors, []);
    assert.deepEqual(external, []);
    console.log("Evidencia documental:", server.evidence);
  },
);
