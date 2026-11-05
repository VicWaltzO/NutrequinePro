import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { chromium, expect } from "playwright/test";
import { localAppFixture } from "../helpers/local-app-server.mjs";

test(
  "compras históricas UI: varios renglones/un gasto, borrador, duplicado, corrección, anulación, temas y teclado",
  { timeout: 180000 },
  async (t) => {
    const fixture = await localAppFixture();
    t.after(fixture.stop);
    console.log("NQP26-21 evidencia: " + fixture.evidence);
    const browser = await chromium.launch({ channel: process.env.REGRESSION_BROWSER_CHANNEL || undefined });
    t.after(() => browser.close());
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: "es-PE" });
    const login = await context.request.post(fixture.baseURL + "/api/auth/login", {
      headers: { Origin: fixture.baseURL },
      data: { login: "admin.local", password: fixture.password },
    });
    const session = await login.json();
    const command = async (type, payload) => {
      const r = await context.request.post(fixture.baseURL + "/api/command", {
        headers: { Origin: fixture.baseURL, "X-CSRF-Token": session.csrf_token },
        data: { type, payload, request_id: randomUUID() },
      });
      assert.equal(r.status(), 200, await r.text());
      return (await r.json()).result;
    };
    const ids = [];
    for (const [i, name] of ["Zeta sintética", "Ácido sintético"].entries()) {
      const id = await command("MICRO_SAVE", { name, operational_id: i + 1, is_active: true });
      ids.push(id);
      await command("MICRO_OPEN", {
        micro_ingredient_id: id,
        quantity_kg: "5",
        cutoff_date: i ? "2026-10-20" : "2026-10-30",
        measurement: "REAL",
        source: "Pesaje sintético",
      });
    }
    const state = async () =>
      (await (await context.request.get(fixture.baseURL + "/api/state")).json()).state;
    const before = await state();
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(fixture.baseURL + "/#inventory/micros");
    const area = page.locator(".historical-purchases");
    await expect(area.getByText("Aún no hay compras históricas documentadas.")).toBeVisible();
    const start = async () => {
      await area.getByRole("button", { name: "Registrar compra histórica", exact: true }).click();
      await expect(area.getByLabel("Proveedor documental")).toBeFocused();
    };
    const save = async (name, status = 200) => {
      const pending = page.waitForResponse((r) => r.url().endsWith("/api/command"));
      await area.getByRole("button", { name, exact: true }).click();
      const r = await pending;
      assert.equal(r.status(), status, await r.text());
    };
    await start();
    await area.getByLabel("Serie y número o referencia única").fill("BORRADOR-SINTETICO");
    await area.getByLabel("Microinsumo 1", { exact: true }).selectOption(ids[0]);
    await save("Guardar borrador histórico");
    assert.equal((await state()).expenses.length, before.expenses.length);
    await start();
    await area.getByLabel("Proveedor documental").fill("Proveedor ficticio E2E");
    await area.getByLabel("Serie y número o referencia única").fill("FACTURA-SINTETICA-01");
    await area.getByLabel("Fecha del comprobante").fill("2026-10-10");
    await area.getByLabel("Fuente o ubicación del comprobante").fill("Archivo de ensayo");
    await area.getByLabel("Total pagado documentado (S/)").fill("60");
    const options = await area
      .getByLabel("Microinsumo 1", { exact: true })
      .locator("option")
      .allTextContents();
    assert.match(options[1], /Ácido/);
    await area.getByLabel("Microinsumo 1", { exact: true }).selectOption(ids[0]);
    await area.getByLabel("Kg documentados 1", { exact: true }).fill("25");
    await area.getByLabel("Precio documentado por kg (S/) 1").fill("2");
    await area.getByRole("button", { name: "Añadir renglón", exact: true }).click();
    await area.getByLabel("Microinsumo 2", { exact: true }).selectOption(ids[1]);
    await area.getByLabel("Kg documentados 2", { exact: true }).fill("1");
    await area.getByLabel("Importe bruto del renglón (S/) 2").fill("10");
    await area
      .getByText("Revisé los gastos existentes y la identidad del comprobante", { exact: true })
      .click();
    for (const width of [1440, 390])
      for (const theme of ["light", "dark"]) {
        await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
        await page.evaluate((theme) => {
          localStorage.setItem("nutrequine-theme", theme);
          document.documentElement.dataset.theme = theme;
        }, theme);
        await area.getByLabel("Proveedor documental").focus();
        await page.keyboard.press("Tab");
        await expect(area.getByLabel("Serie y número o referencia única")).toBeFocused();
        await page.screenshot({
          path: join(fixture.evidence, `hist-form-${width}-${theme}.png`),
          fullPage: true,
          animations: "disabled",
        });
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true);
      }
    await save("Confirmar solo efecto económico");
    let after = await state();
    assert.equal(after.expenses.length - before.expenses.length, 1);
    assert.equal(after.expenses.at(-1).amount, 6000);
    for (const table of [
      "microOpenings",
      "inventoryMovements",
      "productions",
      "productionIngredients",
      "productionCosts",
      "sales",
      "payments",
      "formulas",
    ])
      assert.deepEqual(after[table], before[table], table);
    await page.reload();
    await area
      .getByRole("button", { name: "Corregir comprobante FACTURA-SINTETICA-01", exact: true })
      .click();
    await area.getByLabel("Total pagado documentado (S/)").fill("59");
    await area.getByLabel("Descuento documentado (S/)").fill("1");
    await area.getByLabel("Motivo de rectificación documental").fill("Descuento sintético documentado");
    await area
      .getByText("Revisé los gastos existentes y la identidad del comprobante", { exact: true })
      .click();
    await save("Confirmar solo efecto económico");
    assert.equal((await state()).expenses.at(-1).amount, 5900);
    await start();
    await area.getByLabel("Proveedor documental").fill("Proveedor ficticio E2E");
    await area.getByLabel("Serie y número o referencia única").fill("FACTURA-SINTETICA-01");
    await area.getByLabel("Microinsumo 1", { exact: true }).selectOption(ids[0]);
    await save("Guardar borrador histórico", 422);
    await page.screenshot({ path: join(fixture.evidence, "hist-duplicate.png"), fullPage: true });
    await area.getByRole("button", { name: "Cancelar documentación", exact: true }).click();
    await expect(area.getByRole("button", { name: "Registrar compra histórica", exact: true })).toBeFocused();
    await area.getByLabel("Buscar comprobante histórico").fill("inexistente");
    await expect(area.getByText("No hay comprobantes históricos coincidentes.")).toBeVisible();
    await area.getByLabel("Buscar comprobante histórico").fill("");
    for (const width of [1440, 390])
      for (const theme of ["light", "dark"]) {
        await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
        await page.evaluate((theme) => {
          document.documentElement.dataset.theme = theme;
        }, theme);
        await page.screenshot({
          path: join(fixture.evidence, `hist-list-${width}-${theme}.png`),
          fullPage: true,
          animations: "disabled",
        });
      }
    await area.getByRole("button", { name: "Anular comprobante FACTURA-SINTETICA-01", exact: true }).click();
    await area.getByLabel("Motivo de anulación documental").fill("Anulación sintética");
    await save("Confirmar anulación documental");
    after = await state();
    assert.equal(after.expenses.at(-1).status, "CANCELLED");
    assert.deepEqual(after.microOpenings, before.microOpenings);
    assert.deepEqual(errors, []);
  },
);
