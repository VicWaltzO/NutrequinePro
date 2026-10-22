import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { chromium, expect } from "playwright/test";
import { localAppFixture } from "../helpers/local-app-server.mjs";
import { productionSummary } from "../../lib/domain.mjs";
import { productionPayload } from "../helpers/regression-scenarios.mjs";

test(
  "producción operativa: precio de lote, descuentos, cobro automático/manual, históricos y reinicio",
  { timeout: 240000 },
  async (t) => {
    const server = await localAppFixture({ development: process.env.UI_REVIEW_DEV === "1" });
    t.after(server.stop);
    const browser = await chromium.launch({
      channel: process.env.REGRESSION_BROWSER_CHANNEL || undefined,
      headless: true,
    });
    t.after(() => browser.close());
    const context = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
      locale: "es-PE",
      colorScheme: "light",
    });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(server.baseURL);
    await page.getByLabel("Usuario", { exact: true }).fill("admin.local");
    await page.getByLabel("Contraseña", { exact: true }).fill(server.password);
    await page.getByRole("button", { name: "Entrar", exact: true }).click();
    await page.getByRole("heading", { name: "Resumen", exact: true, level: 1 }).waitFor();
    const login = await context.request.post(server.baseURL + "/api/auth/login", {
      headers: { Origin: server.baseURL },
      data: { login: "admin.local", password: server.password },
    });
    const csrf = (await login.json()).csrf_token;
    const run = async (type, payload, expected = 200) => {
      const response = await context.request.post(server.baseURL + "/api/command", {
        headers: { Origin: server.baseURL, "X-CSRF-Token": csrf },
        data: { type, payload, request_id: randomUUID() },
      });
      const body = await response.json();
      assert.equal(response.status(), expected, JSON.stringify(body));
      return body;
    };
    const getState = async () =>
      (await (await context.request.get(server.baseURL + "/api/state")).json()).state;
    const legacy = await run("PRODUCTION_SAVE", productionPayload({ confirm: false }));
    const original = structuredClone(productionSummary(legacy.state, { id: legacy.result }));
    const legacyCode = legacy.state.productions.find((row) => row.id === legacy.result).code;
    await page.reload();
    await page.goto(server.baseURL + "/#productions");
    await page.getByRole("button", { name: "Nueva producción", exact: true }).click();
    const dialog = page.locator("dialog.modal");
    const field = (name) => dialog.getByLabel(name, { exact: true });
    const rows = dialog.getByRole("region", { name: "Insumos consolidados", exact: true });
    const soyName = "Torta soya HiPro";
    const soy = () =>
      rows.getByRole("row").filter({ has: page.getByRole("cell", { name: soyName, exact: true }) });
    const screenshot = async (name) =>
      page.screenshot({ path: join(server.evidence, name + ".png"), animations: "disabled" });
    const close = async () => {
      await dialog.getByRole("button", { name: "Cerrar", exact: true }).click();
      await dialog.waitFor({ state: "hidden" });
    };
    const submit = async (name, type) => {
      const pending = page.waitForResponse(
        (response) =>
          response.url().endsWith("/api/command") && response.request().postDataJSON().type === type,
      );
      await dialog.getByRole("button", { name, exact: true }).click();
      const response = await pending;
      const body = await response.json();
      assert.equal(response.status(), 200, JSON.stringify(body));
      return body;
    };
    await field("Potripregnant · 40 sacos / núcleo").fill("1");
    await expect(field("Cobro real " + soyName)).toHaveValue("256.20");
    assert.equal(await rows.locator('input[type="checkbox"]').count(), 20);
    await expect(field("Pagado " + soyName)).toBeChecked();
    await expect(field("Aplicar descuento a " + soyName)).not.toBeChecked();
    await expect(field("Descuento " + soyName)).toHaveCount(0);
    for (const name of ["Núcleos pagados", "Envases pagados"]) await expect(field(name)).not.toBeChecked();
    const pencil = dialog.getByRole("button", { name: "Editar precio por kg de " + soyName, exact: true });
    await pencil.click();
    await expect(field("Precio por kg de " + soyName)).toBeFocused();
    await field("Precio por kg de " + soyName).fill("2.20");
    await field("Precio por kg de " + soyName).press("Escape");
    await expect(pencil).toBeFocused();
    await expect(dialog).toBeVisible();
    await expect(field("Cobro real " + soyName)).toHaveValue("256.20");
    await pencil.click();
    await field("Precio por kg de " + soyName).fill("2.111");
    await soy().getByRole("button", { name: "Aplicar", exact: true }).click();
    await expect(soy().getByRole("alert")).toBeVisible();
    await soy().getByRole("button", { name: "Cancelar", exact: true }).click();
    await pencil.click();
    await field("Precio por kg de " + soyName).fill("2.20");
    await field("Precio por kg de " + soyName).press("Enter");
    await expect(field("Cobro real " + soyName)).toHaveValue("268.40");
    await expect(field("Precio por kg de " + soyName)).toHaveCount(0);
    await expect(soy().getByText("Precio de lote", { exact: true })).toBeVisible();
    await field("Aplicar descuento a " + soyName).check();
    await field("Descuento " + soyName).fill("999");
    await expect(dialog.getByRole("button", { name: "Guardar lote a producir", exact: true })).toBeDisabled();
    await field("Descuento " + soyName).fill("10");
    await expect(field("Cobro real " + soyName)).toHaveValue("258.40");
    await field("Cobro real " + soyName).fill("250");
    await field("Potripregnant · 40 sacos / núcleo").fill("2");
    await expect(field("Cobro real " + soyName)).toHaveValue("250");
    await expect(soy().getByText("Valor ajustado", { exact: true })).toBeVisible();
    await soy().getByRole("button", { name: "Restablecer al teórico neto", exact: true }).click();
    await expect(field("Cobro real " + soyName)).toHaveValue("526.80");
    await field("Aplicar descuento a " + soyName).uncheck();
    await expect(field("Cobro real " + soyName)).toHaveValue("536.80");
    await field("Aplicar descuento a " + soyName).check();
    await expect(field("Descuento " + soyName)).toHaveValue("10");
    await field("Aplicar descuento a " + soyName).uncheck();
    await field("Hi-Performance · 40 sacos / núcleo").fill("1");
    await field("Cobro real " + soyName).fill("7.03");
    await field("Pagado " + soyName).uncheck();
    const secondName = "HNA integral soya extruida";
    await field("Pagado " + secondName).uncheck();
    await field("Aplicar descuento a " + secondName).check();
    await field("Descuento " + secondName).fill("0.05");
    assert.equal(await dialog.locator(".product-marker").count(), 4);
    assert.equal(await rows.getByRole("row").count(), 11);
    for (const [width, theme] of [
      [1440, "light"],
      [1440, "dark"],
      [768, "light"],
      [390, "light"],
      [390, "dark"],
      [320, "light"],
    ]) {
      await page.emulateMedia({ colorScheme: theme });
      await page.setViewportSize({ width, height: width > 1000 ? 1000 : 844 });
      assert.ok(
        await page.locator(".modal-body").evaluate((element) => element.scrollWidth <= element.clientWidth),
      );
      await rows.evaluate((element) => element.scrollIntoView({ block: "start" }));
      await screenshot("ux-ingredients-" + width + "-" + theme);
      if (width === 390) {
        await rows.locator(".table-wrap").evaluate((element) => {
          element.scrollLeft = (element.scrollWidth - element.clientWidth) / 2;
        });
        await screenshot("ux-ingredients-390-" + theme + "-middle");
        await rows.locator(".table-wrap").evaluate((element) => {
          element.scrollLeft = element.scrollWidth;
        });
        await screenshot("ux-ingredients-390-" + theme + "-right");
        await rows.locator(".table-wrap").evaluate((element) => {
          element.scrollLeft = 0;
        });
      }
      await page.locator(".modal-body").evaluate((element) => {
        element.scrollTop = 0;
      });
      await screenshot("ux-products-" + width + "-" + theme);
    }
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.emulateMedia({ colorScheme: "light" });
    const saved = await submit("Guardar lote a producir", "PRODUCTION_SAVE");
    const summary = productionSummary(saved.state, { id: saved.result });
    const first = summary.ingredients.find((row) => row.ingredient_id === "ing-1");
    assert.equal(first.historical_price_per_kg, 220);
    assert.equal(first.actual_charge, 703);
    assert.equal(first.discount_amount, 0);
    assert.equal(summary.ingredients.filter((row) => !row.is_paid).length, 2);
    assert.ok(summary.costs.every((row) => !row.is_paid));
    assert.equal(saved.state.ingredients.find((row) => row.id === "ing-1").current_price_per_kg, 210);
    assert.deepEqual(productionSummary(saved.state, { id: legacy.result }), original);
    const code = saved.state.productions.find((row) => row.id === saved.result).code;
    await run("INGREDIENT_SAVE", {
      ...saved.state.ingredients.find((row) => row.id === "ing-1"),
      current_price_per_kg: "9.99",
    });
    await close();
    await server.stop();
    await server.start();
    await page.reload();
    await page.getByRole("button", { name: code, exact: true }).click();
    await dialog.getByRole("button", { name: "Editar lote", exact: true }).click();
    await expect(field("Cobro real " + soyName)).toHaveValue("7.03");
    await expect(field("Pagado " + soyName)).not.toBeChecked();
    await expect(soy().getByText("S/ 2.20", { exact: true })).toBeVisible();
    await expect(
      rows
        .getByRole("row")
        .filter({ has: page.getByRole("cell", { name: secondName, exact: true }) })
        .getByText("Automático · teórico neto", { exact: true }),
    ).toBeVisible();
    await close();
    await page.getByRole("button", { name: legacyCode, exact: true }).click();
    await dialog.getByRole("button", { name: "Editar lote", exact: true }).click();
    const beforeOpening = await getState();
    await expect(field("Cobro real " + soyName)).toHaveValue("");
    await expect(field("Pagado " + soyName)).not.toBeChecked();
    await expect(soy().getByText("S/ 2.10", { exact: true })).toBeVisible();
    await expect(dialog.locator(".total-line")).toContainText("Real parcial");
    await dialog.locator(".total-line").scrollIntoViewIfNeeded();
    await screenshot("ux-legacy-partial-summary");
    await close();
    assert.deepEqual(await getState(), beforeOpening);
    const confirmedLegacy = await run("PRODUCTION_CONFIRM", { id: legacy.result });
    const legacySummary = productionSummary(confirmedLegacy.state, { id: legacy.result });
    assert.equal(
      legacySummary.ingredients.find((row) => row.ingredient_id === "ing-1").historical_price_per_kg,
      210,
    );
    assert.ok(legacySummary.ingredients.every((row) => row.actual_charge === null && row.is_paid === false));
    await run("PRODUCTION_CLOSE", { id: legacy.result }, 422);
    const confirmed = await run("PRODUCTION_CONFIRM", { id: saved.result });
    const confirmedSummary = productionSummary(confirmed.state, { id: saved.result });
    await run("PRODUCTION_RECONCILE", {
      id: saved.result,
      reason: "Conciliación sintética UX",
      ingredients: confirmedSummary.ingredients.map((row) => ({
        id: row.id,
        discount_amount: row.discount_amount / 100,
        actual_charge: row.actual_charge / 100,
        is_paid: row.is_paid,
      })),
    });
    const closed = await run("PRODUCTION_CLOSE", { id: saved.result });
    assert.equal(closed.state.productions.find((row) => row.id === saved.result).status, "CLOSED");
    assert.equal(
      productionSummary(closed.state, { id: saved.result }).ingredients.find(
        (row) => row.ingredient_id === "ing-1",
      ).historical_price_per_kg,
      220,
    );
    assert.deepEqual(errors, []);
    console.log("Operational UX evidence: " + server.evidence);
  },
);
