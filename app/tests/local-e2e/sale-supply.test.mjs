import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { chromium, expect } from "playwright/test";
import { localAppFixture } from "../helpers/local-app-server.mjs";
import { salePayload, productionPayload } from "../helpers/regression-scenarios.mjs";

test(
  "E07: inventario separado, guardas legacy, lote, teclado y presentación responsive",
  { timeout: 180000 },
  async (t) => {
    const server = await localAppFixture();
    t.after(server.stop);
    console.log("NQP26-07 evidencias: " + server.evidence);
    const browser = await chromium.launch({ channel: process.env.REGRESSION_BROWSER_CHANNEL || undefined });
    t.after(() => browser.close());
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, locale: "es-PE" });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(server.baseURL);
    await page.getByLabel("Usuario", { exact: true }).fill("admin.local");
    await page.getByLabel("Contraseña", { exact: true }).fill(server.password);
    await page.getByRole("button", { name: "Entrar", exact: true }).click();
    await expect(page.locator(".sidebar-footer")).toBeVisible();
    const request = page.context().request;
    const session = await (await request.get(server.baseURL + "/api/auth/session")).json();
    const state = async () => (await (await request.get(server.baseURL + "/api/state")).json()).state;
    const run = async (type, payload, expected = 200) => {
      const response = await request.post(server.baseURL + "/api/command", {
        headers: { Origin: server.baseURL, "X-CSRF-Token": session.csrf_token },
        data: { type, payload, request_id: randomUUID() },
      });
      assert.equal(response.status(), expected, await response.text());
      return response.json();
    };
    const customer = (await run("CUSTOMER_SAVE", { name: "Cliente sintético entrega 07" })).result;
    const production = (await run("PRODUCTION_SAVE", productionPayload({ confirm: false }))).result;
    const before = await state();
    await run("SALE_SAVE", salePayload(customer, { deliver: true }), 422);
    assert.deepEqual(await state(), before, "HTTP no elude stock insuficiente");
    await page.reload();
    await page.getByRole("button", { name: "Nueva venta", exact: true }).click();
    let dialog = page.getByRole("dialog");
    await dialog.getByLabel("Cliente", { exact: true }).selectOption(customer);
    await dialog.getByLabel("Sede destino", { exact: true }).selectOption("site-1");
    await dialog.getByRole("button", { name: "Agregar Potripregnant", exact: true }).click();
    const inventory = dialog.getByRole("region", { name: "Aviso de inventario", exact: true });
    const delivery = dialog.getByRole("region", { name: "Entrega de productos", exact: true });
    await expect(inventory).toContainText("faltan 1 sacos y 25 kg");
    await expect(delivery).not.toContainText("Stock insuficiente");
    await expect(delivery.locator('input[type="date"]')).toHaveCount(0);
    await expect(dialog.getByRole("button", { name: "Confirmar venta", exact: true })).toBeDisabled();
    await dialog.getByLabel("Entrega", { exact: true }).focus();
    await page.keyboard.press("ArrowDown");
    await expect(dialog.getByLabel("Entrega", { exact: true })).toHaveValue("future");
    await expect(dialog.getByLabel("Entrega", { exact: true })).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(dialog.getByLabel("Asociar a un lote existente (opcional)")).toBeFocused();
    await dialog.getByLabel("Asociar a un lote existente (opcional)").selectOption(production);
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
      for (const colorScheme of ["light", "dark"]) {
        await page.emulateMedia({ colorScheme });
        await expect(page.locator("html")).toHaveAttribute("data-theme", colorScheme);
        await delivery.scrollIntoViewIfNeeded();
        assert.ok(await page.locator(".modal-body").evaluate((el) => el.scrollWidth <= el.clientWidth));
        await page.screenshot({
          path: join(server.evidence, `supply-form-${width}-${colorScheme}.png`),
          animations: "disabled",
        });
      }
    }
    const saved = page.waitForResponse(
      (r) => r.url().endsWith("/api/command") && r.request().postDataJSON()?.type === "SALE_SAVE",
    );
    await dialog.getByRole("button", { name: "Confirmar venta", exact: true }).click();
    const response = await saved;
    assert.equal(response.status(), 200, await response.text());
    const id = (await response.json()).result;
    await expect(page.getByRole("dialog", { name: "Detalle de venta", exact: true })).toBeVisible();
    dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("region", { name: "Abastecimiento" })).toContainText("Flujo legacy");
    await expect(dialog.getByRole("button", { name: "Registrar entrega", exact: true })).toBeDisabled();
    let s = await state();
    assert.ok(s.saleProductionLinks.some((x) => x.sale_id === id && x.production_id === production));
    assert.equal(s.sales.find((x) => x.id === id).coverage_version, undefined);
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
      for (const colorScheme of ["light", "dark"]) {
        await page.emulateMedia({ colorScheme });
        await dialog.getByRole("region", { name: "Abastecimiento" }).scrollIntoViewIfNeeded();
        assert.ok(await page.locator(".modal-body").evaluate((el) => el.scrollWidth <= el.clientWidth));
        await page.screenshot({
          path: join(server.evidence, `supply-detail-${width}-${colorScheme}.png`),
          animations: "disabled",
        });
      }
    }
    await run("INVENTORY_ADJUST", {
      product_id: "prod-1",
      direction: "IN",
      quantity: 2,
      weight_kg: 50,
      date: "2026-10-29",
      reason: "Ingreso sintético",
    });
    await page.reload();
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.getByRole("button", { name: "Ventas", exact: true }).click();
    await page.getByRole("button", { name: "Historial", exact: true }).click();
    await page.getByRole("button", { name: s.sales.find((x) => x.id === id).code, exact: true }).click();
    dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("button", { name: "Registrar entrega", exact: true })).toBeEnabled();
    await expect(dialog.getByRole("region", { name: "Abastecimiento" })).not.toContainText("Listo por stock");
    s = await state();
    assert.equal(s.sales.find((x) => x.id === id).fulfillment_status, "PENDING");
    await dialog.getByRole("button", { name: "Registrar entrega", exact: true }).click();
    await expect(dialog.getByRole("button", { name: "Registrar entrega", exact: true })).toHaveCount(0);
    s = await state();
    assert.equal(s.sales.find((x) => x.id === id).fulfillment_status, "DELIVERED");
    assert.ok(s.saleProductionLinks.some((x) => x.sale_id === id && x.production_id === production));
    await dialog.getByRole("button", { name: "Cerrar", exact: true }).click();
    await expect(dialog).not.toBeVisible();
    await page.getByRole("button", { name: "Nueva venta", exact: true }).click();
    dialog = page.getByRole("dialog");
    await dialog.getByLabel("Cliente", { exact: true }).selectOption(customer);
    await dialog.getByLabel("Sede destino", { exact: true }).selectOption("site-1");
    await dialog.getByRole("button", { name: "Agregar Potripregnant", exact: true }).click();
    await expect(dialog.locator(".sale-inventory .warning")).toHaveCount(0);
    await expect(dialog.getByLabel("Entrega", { exact: true })).toHaveValue("immediate");
    const immediate = page.waitForResponse(
      (r) => r.url().endsWith("/api/command") && r.request().postDataJSON()?.type === "SALE_SAVE",
    );
    await dialog.getByRole("button", { name: "Confirmar venta", exact: true }).click();
    const immediateResponse = await immediate;
    assert.equal(immediateResponse.status(), 200, await immediateResponse.text());
    const immediateId = (await immediateResponse.json()).result;
    s = await state();
    assert.equal(s.sales.find((x) => x.id === immediateId).fulfillment_status, "DELIVERED");
    assert.equal(s.sales.find((x) => x.id === immediateId).coverage_version, undefined);
    assert.deepEqual(errors, []);
  },
);
