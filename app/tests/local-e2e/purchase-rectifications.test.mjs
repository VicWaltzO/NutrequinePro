import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { chromium, expect } from "playwright/test";
import { localAppFixture } from "../helpers/local-app-server.mjs";

test(
  "35 UI: 25→20, comparación, historia, foco, respuesta perdida/replay y 1440/390 claro/oscuro",
  { timeout: 240000 },
  async (t) => {
    const f = await localAppFixture();
    t.after(f.stop);
    console.log("NQP26-35 E2E evidence: " + f.evidence);
    const browser = await chromium.launch({ channel: process.env.REGRESSION_BROWSER_CHANNEL || undefined });
    t.after(() => browser.close());
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: "es-PE" });
    const login = await context.request.post(f.baseURL + "/api/auth/login", {
      headers: { Origin: f.baseURL },
      data: { login: "admin.local", password: f.password },
    });
    const session = await login.json();
    const command = async (type, payload) => {
      const r = await context.request.post(f.baseURL + "/api/command", {
        headers: { Origin: f.baseURL, "X-CSRF-Token": session.csrf_token },
        data: { type, payload, request_id: randomUUID() },
      });
      assert.equal(r.status(), 200, await r.text());
      return (await r.json()).result;
    };
    const id = await command("MICRO_SAVE", {
      name: "Micro sintético 35",
      operational_id: 1,
      is_active: true,
    });
    await command("MICRO_OPEN", {
      micro_ingredient_id: id,
      quantity_kg: "0",
      unit_cost: "0",
      cutoff_date: "2026-10-30",
      measurement: "REAL",
      source: "Apertura sintética",
    });
    await command("MICRO_RECEIPT_SAVE", {
      status: "CONFIRMED",
      supplier: "Proveedor sintético 35",
      reference: "FACT-35",
      source: "Factura de ensayo",
      document_date: "2026-11-01",
      total: "250",
      discount: "0",
      currency: "PEN",
      payment_method: "CASH",
      reviewed_expenses: true,
      receive_confirmed: true,
      lines: [{ micro_ingredient_id: id, quantity_kg: "25", unit_price: "10", amount: "250", discount: "0" }],
    });
    const state = async () => (await (await context.request.get(f.baseURL + "/api/state")).json()).state;
    const before = await state(),
      page = await context.newPage(),
      errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(f.baseURL + "/#inventory/micros");
    const area = page.locator(".operational-purchases");
    await area.locator("summary").filter({ hasText: "FACT-35" }).click();
    const open = area.getByRole("button", { name: "Corregir compra FACT-35", exact: true });
    await open.click();
    const form = area.getByRole("form", { name: "Corrección de compra FACT-35" });
    await expect(form.getByLabel("Fecha de corrección de compra", { exact: true })).toBeFocused();
    await form.getByLabel("Motivo de corrección de compra", { exact: true }).focus();
    await page.keyboard.press("Tab");
    await expect(form.getByLabel("Referencia de corrección de compra", { exact: true })).toBeFocused();
    await form.getByLabel("Fecha de corrección de compra", { exact: true }).fill("2026-11-15");
    await form
      .getByLabel("Motivo de corrección de compra", { exact: true })
      .fill("Se verificó recepción de 20 kg");
    await form.getByLabel("Referencia de corrección de compra", { exact: true }).fill("ACTA UI 35");
    await form.getByLabel("Kg corregidos 1", { exact: true }).fill("20");
    await form.getByLabel("Importe bruto corregido (S/) 1", { exact: true }).fill("200");
    await form.getByLabel("Total corregido (S/)", { exact: true }).fill("200");
    for (const width of [1440, 390])
      for (const theme of ["light", "dark"]) {
        await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
        await page.evaluate((theme) => {
          document.documentElement.dataset.theme = theme;
        }, theme);
        await form.scrollIntoViewIfNeeded();
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
        await page.screenshot({
          path: join(f.evidence, `purchase35-${width}-${theme}.png`),
          fullPage: true,
          animations: "disabled",
        });
      }
    let lost = false;
    await page.route("**/api/command", async (route) => {
      if (!lost && route.request().postDataJSON().type === "MICRO_RECEIPT_RECTIFY") {
        lost = true;
        const response = await route.fetch();
        assert.equal(response.status(), 200, await response.text());
        await route.abort("failed");
      } else await route.continue();
    });
    await form.getByRole("button", { name: "Registrar corrección de compra", exact: true }).click();
    await expect(
      form.getByRole("button", { name: "Reintentar corrección de compra", exact: true }),
    ).toBeEnabled();
    const persisted = await state();
    assert.equal(persisted.expenses.length, before.expenses.length);
    assert.equal(persisted.expenses.at(-1).amount, 20000);
    assert.equal(persisted.microLedgers[0].ledger.quantity_grams, 20000);
    await form.getByRole("button", { name: "Reintentar corrección de compra", exact: true }).click();
    await expect(form).toHaveCount(0);
    await expect(open).toBeFocused();
    assert.deepEqual(await state(), persisted);
    await page.unroute("**/api/command");
    await area.getByText("Historial de correcciones (1)", { exact: true }).click();
    await expect(area.getByText(/Versión 1.*Histórico/)).toBeVisible();
    await expect(area.getByText(/Versión 2.*Vigente/)).toBeVisible();
    await page.reload();
    await expect(area.getByText(/Stock físico: 20/)).toBeVisible();
    assert.deepEqual(errors, []);
  },
);
