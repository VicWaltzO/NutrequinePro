import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { chromium, expect } from "playwright/test";
import { localAppFixture } from "../helpers/local-app-server.mjs";
test(
  "preparaciones UI: faltantes, compra posterior, competencia sin reserva, roles y cuatro vistas",
  { timeout: 240000 },
  async (t) => {
    const f = await localAppFixture();
    t.after(f.stop);
    console.log("NQP26-26 capturas", f.evidence);
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
    const before = await state();
    for (let i = 0; i < 2; i++) {
      await area.getByRole("button", { name: "Nueva preparación pendiente", exact: true }).click();
      await expect(area.getByLabel("Familia de núcleo", { exact: true })).toBeFocused();
      await page.keyboard.press("Tab");
      await expect(area.getByLabel("Núcleos planificados", { exact: true })).toBeFocused();
      await area.getByLabel("Núcleos planificados", { exact: true }).fill("20");
      await area.getByLabel("Fecha de preparación prevista", { exact: true }).fill("2026-11-09");
      if (i === 0) {
        let lostCommand;
        await page.route(
          "**/api/command",
          async (route) => {
            lostCommand = route.request().postDataJSON();
            const accepted = await route.fetch();
            assert.equal(accepted.status(), 200);
            await route.abort("failed");
          },
          { times: 1 },
        );
        await area.getByRole("button", { name: "Guardar preparación pendiente", exact: true }).click();
        await expect(
          page.getByText("El servicio no está disponible. Conserve el formulario y vuelva a intentar.", {
            exact: true,
          }),
        ).toBeVisible();
        assert.equal((await state()).microPreparations.length, 1);
        const reevaluated = page.waitForResponse((r) => r.url().endsWith("/api/micro-preparations"));
        await area.getByRole("button", { name: "Reevaluar materiales", exact: true }).click();
        assert.equal((await reevaluated).status(), 200);
        const retry = page.waitForRequest((r) => r.url().endsWith("/api/command"));
        const retryResponse = page.waitForResponse((r) => r.url().endsWith("/api/command"));
        await area.getByRole("button", { name: "Guardar preparación pendiente", exact: true }).click();
        assert.deepEqual((await retry).postDataJSON(), lostCommand);
        assert.equal((await retryResponse).status(), 200);
      } else {
        const pending = page.waitForResponse((r) => r.url().endsWith("/api/command"));
        await area.getByRole("button", { name: "Guardar preparación pendiente", exact: true }).click();
        assert.equal((await pending).status(), 200);
      }
      await expect(
        area.getByRole("button", { name: "Nueva preparación pendiente", exact: true }),
      ).toBeFocused();
      await expect(area.getByText("Pendiente por faltantes", { exact: true })).toHaveCount(i + 1);
    }
    let s = await state();
    assert.equal(s.microPreparations.length, 2);
    for (const table of Object.keys(before).filter(
      (k) => Array.isArray(before[k]) && !["microPreparations", "audit"].includes(k),
    ))
      assert.deepEqual(s[table], before[table], table);
    await area.locator("summary").first().click();
    await expect(
      area
        .locator(".preparation-record")
        .first()
        .getByText(
          "Requerido: 20 g · Asignado a esta orden: 0 g · Físico: 5 g · Asignado total: 0 g · Libre: 5 g · Faltante: 15 g",
          {
            exact: true,
          },
        ),
    ).toBeVisible();
    await expect(area.getByText("El saldo libre es compartido", { exact: false })).toBeVisible();
    await page.getByText("Operación registrada.", { exact: true }).waitFor({ state: "hidden" });
    for (const width of [1440, 390])
      for (const theme of ["light", "dark"]) {
        await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
        await page.evaluate((theme) => {
          localStorage.setItem("nutrequine-theme", theme);
          document.documentElement.dataset.theme = theme;
        }, theme);
        await area.scrollIntoViewIfNeeded();
        await area.screenshot({
          path: join(f.evidence, `preparations-${width}-${theme}.png`),
          animations: "disabled",
        });
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true);
        await area.getByRole("button", { name: "Nueva preparación pendiente", exact: true }).click();
        await expect(area.getByLabel("Familia de núcleo", { exact: true })).toBeFocused();
        await area.screenshot({
          path: join(f.evidence, `preparations-form-${width}-${theme}.png`),
          animations: "disabled",
        });
        await area.getByRole("button", { name: "Cancelar preparación", exact: true }).click();
        await expect(
          area.getByRole("button", { name: "Nueva preparación pendiente", exact: true }),
        ).toBeFocused();
      }
    const orders = structuredClone(s.microPreparations);
    await command("MICRO_RECEIPT_SAVE", {
      status: "CONFIRMED",
      supplier: "Proveedor sintético plan",
      reference: "PLAN-RECEIPT",
      source: "Prueba sintética",
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
    });
    await area.getByRole("button", { name: "Reevaluar materiales", exact: true }).click();
    await expect(
      area.getByText("Pendiente · Potencialmente reanudable: puede solicitar asignación", { exact: true }),
    ).toHaveCount(2);
    s = await state();
    assert.deepEqual(s.microPreparations, orders);
    assert.deepEqual(s.inventoryMovements, before.inventoryMovements);
    assert.equal(s.microValuationEvents.length, 1);
    assert.equal(s.microLedgers[0].ledger.events[0].input.type, "RECEIPT");
    const expense = structuredClone(s.expenses);
    await area.getByRole("button", { name: "Reevaluar materiales", exact: true }).click();
    assert.deepEqual((await state()).expenses, expense);
    await page.reload();
    await expect(
      area.getByText("Pendiente · Potencialmente reanudable: puede solicitar asignación", { exact: true }),
    ).toHaveCount(2);
    for (const role of ["OPERATOR", "VIEWER"]) {
      const id = "plan-" + role.toLowerCase(),
        password = randomUUID() + randomUUID();
      await command("USER_SAVE", { id, name: "Usuario sintético " + role, role, is_active: true });
      assert.equal(
        (
          await context.request.post(f.baseURL + "/api/auth/credentials", {
            headers: { Origin: f.baseURL, "X-CSRF-Token": csrf },
            data: { user_id: id, login: id, password },
          })
        ).status(),
        200,
      );
      const account = await browser.newContext();
      assert.equal(
        (
          await account.request.post(f.baseURL + "/api/auth/login", {
            headers: { Origin: f.baseURL },
            data: { login: id, password },
          })
        ).status(),
        200,
      );
      const other = await account.newPage();
      await other.goto(f.baseURL + "/#inventory/micros");
      const otherArea = other.locator(".micro-preparations");
      await expect(
        otherArea.getByText("Pendiente · Potencialmente reanudable: puede solicitar asignación", {
          exact: true,
        }),
      ).toHaveCount(2);
      await expect(
        otherArea.getByRole("button", { name: "Nueva preparación pendiente", exact: true }),
      ).toHaveCount(role === "OPERATOR" ? 1 : 0);
      await account.close();
    }
    assert.deepEqual(errors, []);
  },
);
