import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { chromium, expect } from "playwright/test";
import { localAppFixture } from "../helpers/local-app-server.mjs";
test(
  "asignación UI: B manual, competencia, red perdida, reversión, teclado, compra y cuatro vistas",
  { timeout: 240000 },
  async (t) => {
    const f = await localAppFixture();
    t.after(f.stop);
    console.log("NQP26-27 capturas", f.evidence);
    const browser = await chromium.launch({ channel: process.env.REGRESSION_BROWSER_CHANNEL || undefined });
    t.after(() => browser.close());
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: "es-PE" });
    let csrf;
    const login = async () => {
      const response = await context.request.post(f.baseURL + "/api/auth/login", {
        headers: { Origin: f.baseURL },
        data: { login: "admin.local", password: f.password },
      });
      assert.equal(response.status(), 200);
      csrf = (await response.json()).csrf_token;
    };
    await login();
    const command = async (type, payload) => {
      const r = await context.request.post(f.baseURL + "/api/command", {
        headers: { Origin: f.baseURL, "X-CSRF-Token": csrf },
        data: { type, payload, request_id: randomUUID() },
      });
      assert.equal(r.status(), 200, await r.text());
      return (await r.json()).result;
    };
    const state = async () => (await (await context.request.get(f.baseURL + "/api/state")).json()).state;
    const ids = [];
    for (let i = 0; i < 2; i++) {
      ids.push(
        await command("MICRO_SAVE", {
          operational_id: i + 1,
          name: `Micro sintético plan ${i + 1}`,
          is_active: true,
        }),
      );
      await command("MICRO_OPEN", {
        micro_ingredient_id: ids[i],
        quantity_kg: i ? "0.050" : "0.005",
        cutoff_date: "2026-10-30",
        measurement: "REAL",
        source: "Prueba sintética",
        unit_cost: "1",
        notes: "",
      });
    }
    const lines = ids.map((id, i) => ({ micro_ingredient_id: id, dose_kg: i ? "0.002" : "0.001" }));
    const formula_id = await command("MICRO_FORMULA_SAVE", { family: "ROSADO", expected_version: 0, lines });
    await command("MICRO_FORMULA_ACTIVATE", { family: "ROSADO", expected_version: 1, formula_id });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(f.baseURL + "/#inventory/micros");
    let area = page.locator(".micro-preparations");
    await area.getByRole("button", { name: "Nueva preparación pendiente", exact: true }).click();
    await expect(
      area.getByRole("button", { name: "Guardar preparación pendiente", exact: true }),
    ).toBeDisabled();
    await expect(area.getByText("Falta autorización privada", { exact: false })).toBeVisible();
    await f.stop();
    const config = JSON.parse(readFileSync(f.configFile, "utf8"));
    config.micro_preparation_policies = [
      {
        formula_id,
        family: "ROSADO",
        reference: "Política sintética E2E",
        lines: ids.map((id, i) => ({ micro_ingredient_id: id, dose_grams: i + 1 })),
      },
    ];
    writeFileSync(f.configFile, JSON.stringify(config));
    await f.start();
    await login();
    await page.reload();
    area = page.locator(".micro-preparations");
    for (let i = 0; i < 2; i++)
      await command("MICRO_PREPARATION_CREATE", {
        family: "ROSADO",
        formula_id,
        nuclei: "20",
        date: "2026-11-09",
        expected_revision: (await state()).revision,
      });
    await page.reload();
    const records = area.locator(".preparation-record");
    await expect(records).toHaveCount(2);
    const a = records.nth(1),
      b = records.nth(0);
    const before = await state();
    // Select B explicitly, inspect shortage, cancel using keyboard and recover focus.
    await b.getByRole("button", { name: "Asignar ingredientes a esta orden", exact: true }).click();
    await expect(b.getByLabel("Motivo de asignación o reversión")).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(b.getByRole("button", { name: "Cancelar selección", exact: true })).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(
      b.getByRole("button", { name: "Asignar ingredientes a esta orden", exact: true }),
    ).toBeFocused();
    const purchase = {
      status: "CONFIRMED",
      supplier: "Proveedor sintético asignación",
      reference: "ASSIGN-RECEIPT",
      source: "Ensayo sintético",
      document_date: "2026-11-01",
      total: "0.02",
      discount: "0",
      currency: "PEN",
      payment_method: "CASH",
      reviewed_expenses: true,
      receive_confirmed: true,
      lines: [
        { micro_ingredient_id: ids[0], quantity_kg: "0.020", unit_price: "1", amount: "0.02", discount: "0" },
      ],
    };
    await command("MICRO_RECEIPT_SAVE", purchase);
    assert.equal((await state()).microAssignments.length, 0);
    await page.reload();
    await expect(
      area.getByText("Pendiente · Potencialmente reanudable: puede solicitar asignación", { exact: true }),
    ).toHaveCount(2);
    // A keeps an old snapshot while B wins; A must see a clear rejection.
    await a.getByRole("button", { name: "Asignar ingredientes a esta orden", exact: true }).click();
    await a.getByLabel("Motivo de asignación o reversión").fill("Atender A sintético");
    await b.getByRole("button", { name: "Asignar ingredientes a esta orden", exact: true }).click();
    await b.getByLabel("Motivo de asignación o reversión").fill("Atender B sintético");
    for (const width of [1440, 390])
      for (const theme of ["light", "dark"]) {
        await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
        await page.evaluate((theme) => {
          localStorage.setItem("nutrequine-theme", theme);
          document.documentElement.dataset.theme = theme;
        }, theme);
        await b.screenshot({
          path: join(f.evidence, `assignment-confirm-${width}-${theme}.png`),
          animations: "disabled",
        });
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true);
      }
    let lost;
    await page.route(
      "**/api/command",
      async (route) => {
        const c = route.request().postDataJSON();
        if (c.type !== "MICRO_ASSIGN") return route.continue();
        lost = c;
        const response = await route.fetch();
        assert.equal(response.status(), 200);
        await route.abort("failed");
      },
      { times: 1 },
    );
    await b.getByRole("button", { name: "Confirmar asignación", exact: true }).click();
    await expect(b.getByRole("button", { name: "Reintentar solicitud", exact: true })).toBeEnabled();
    assert.equal((await state()).microAssignments.length, 1);
    await area.getByRole("button", { name: "Reevaluar materiales", exact: true }).click();
    let replay;
    await page.route(
      "**/api/command",
      async (route) => {
        replay = route.request().postDataJSON();
        await route.continue();
      },
      { times: 1 },
    );
    await b.getByRole("button", { name: "Reintentar solicitud", exact: true }).click();
    await expect(b.getByRole("button", { name: "Revertir asignación", exact: true })).toBeFocused();
    assert.deepEqual(replay, lost);
    assert.equal((await state()).microAssignments.length, 1);
    await a.getByRole("button", { name: "Confirmar asignación", exact: true }).click();
    await expect(
      page.getByText("Los datos cambiaron. Reevaluar materiales y seleccionar de nuevo la orden.", {
        exact: true,
      }),
    ).toBeVisible();
    await a.getByRole("button", { name: "Cancelar selección", exact: true }).click();
    await area.getByRole("button", { name: "Reevaluar materiales", exact: true }).click();
    await a.getByRole("button", { name: "Asignar ingredientes a esta orden", exact: true }).click();
    await a.getByLabel("Motivo de asignación o reversión").fill("Nueva decisión A");
    await a.getByRole("button", { name: "Confirmar asignación", exact: true }).click();
    await expect(
      page
        .getByRole("alert")
        .filter({ hasText: /Saldo libre insuficiente para ID 1/ })
        .first(),
    ).toBeVisible();
    await a.getByRole("button", { name: "Cancelar selección", exact: true }).click();
    const assigned = await state();
    assert.equal(assigned.microAssignments[0].preparation_id, before.microPreparations[1].id);
    assert.equal(assigned.microAssignmentLines.length, 2);
    assert.deepEqual(assigned.microPreparations, before.microPreparations);
    assert.equal(assigned.microLedgers[0].ledger.quantity_grams, 25);
    await b.getByText("Necesidades y faltantes por microinsumo", { exact: true }).click();
    await expect(
      b.getByText(
        "Requerido: 20 g · Asignado a esta orden: 20 g · Físico: 25 g · Asignado total: 20 g · Libre: 5 g · Faltante: 0 g",
        { exact: true },
      ),
    ).toBeVisible();
    await page.getByText("Operación registrada.", { exact: true }).waitFor({ state: "hidden" });
    const protectedTables = [
      "microLedgers",
      "microValuationEvents",
      "expenses",
      "inventoryMovements",
      "productions",
      "productionCosts",
      "sales",
      "microFormulas",
      "microFormulaLines",
    ];
    for (const width of [1440, 390])
      for (const theme of ["light", "dark"]) {
        await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
        await page.evaluate((theme) => {
          document.documentElement.dataset.theme = theme;
        }, theme);
        await b.screenshot({
          path: join(f.evidence, `assignment-result-${width}-${theme}.png`),
          animations: "disabled",
        });
      }
    await b.getByRole("button", { name: "Revertir asignación", exact: true }).click();
    await expect(b.getByLabel("Motivo de asignación o reversión")).toBeFocused();
    await b.getByLabel("Motivo de asignación o reversión").fill("Liberar por decisión manual");
    await b.getByRole("button", { name: "Confirmar reversión", exact: true }).click();
    await expect(
      b.getByRole("button", { name: "Asignar ingredientes a esta orden", exact: true }),
    ).toBeFocused();
    const freed = await state();
    assert.equal(freed.microAssignmentReversals.length, 1);
    for (const table of protectedTables) assert.deepEqual(freed[table], assigned[table], table);
    await page.reload();
    await expect(b.getByText("Historial de asignación · Revertida", { exact: true })).toBeVisible();
    assert.deepEqual(errors, []);
  },
);
