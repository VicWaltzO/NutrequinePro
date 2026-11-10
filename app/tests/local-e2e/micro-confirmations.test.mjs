import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { chromium, expect } from "playwright/test";
import { localAppFixture } from "../helpers/local-app-server.mjs";

test(
  "NQP28 UI 20→12, respuesta perdida, cierre, nueva8, foco y 1440/390 claro/oscuro",
  { timeout: 240000 },
  async (t) => {
    const f = await localAppFixture();
    t.after(f.stop);
    console.log("NQP28 capturas", f.evidence);
    const browser = await chromium.launch({ channel: process.env.REGRESSION_BROWSER_CHANNEL || undefined });
    t.after(() => browser.close());
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: "es-PE" });
    let csrf;
    const login = async () => {
      const r = await context.request.post(f.baseURL + "/api/auth/login", {
        headers: { Origin: f.baseURL },
        data: { login: "admin.local", password: f.password },
      });
      assert.equal(r.status(), 200);
      csrf = (await r.json()).csrf_token;
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
          name: `Micro ficticio cierre ${i + 1}`,
          is_active: true,
        }),
      );
      await command("MICRO_OPEN", {
        micro_ingredient_id: ids[i],
        quantity_kg: "10",
        unit_cost: "2",
        cutoff_date: "2026-10-30",
        measurement: "REAL",
        source: "Prueba sintética",
        notes: "",
      });
    }
    const formula_id = await command("MICRO_FORMULA_SAVE", {
      family: "ROSADO",
      expected_version: 0,
      lines: ids.map((id, i) => ({ micro_ingredient_id: id, dose_kg: i ? "0.001" : "0.300" })),
    });
    await command("MICRO_FORMULA_ACTIVATE", { family: "ROSADO", formula_id, expected_version: 1 });
    await f.stop();
    const config = JSON.parse(readFileSync(f.configFile, "utf8"));
    config.micro_preparation_policies = [
      {
        formula_id,
        family: "ROSADO",
        reference: "Política sintética E2E28",
        lines: ids.map((id, i) => ({ micro_ingredient_id: id, dose_grams: i ? 1 : 300 })),
      },
    ];
    writeFileSync(f.configFile, JSON.stringify(config));
    await f.start();
    await login();
    const create = async (nuclei) =>
      command("MICRO_PREPARATION_CREATE", {
        family: "ROSADO",
        formula_id,
        nuclei,
        date: "2026-11-09",
        expected_revision: (await state()).revision,
      });
    const order = await create("20");
    await command("MICRO_ASSIGN", {
      preparation_id: order,
      reason: "Ensayo sintético",
      expected_revision: (await state()).revision,
    });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(f.baseURL + "/#inventory/micros");
    const record = page
      .locator(".preparation-record")
      .filter({ has: page.getByRole("button", { name: "Confirmar núcleos terminados", exact: true }) });
    await record.getByRole("button", { name: "Confirmar núcleos terminados", exact: true }).click();
    await expect(record.getByLabel("Núcleos realmente terminados")).toBeFocused();
    await record.getByLabel("Núcleos realmente terminados").fill("12");
    await record.getByLabel("Fecha real de preparación").fill("2026-11-10");
    for (const width of [1440, 390])
      for (const theme of ["light", "dark"]) {
        await page.setViewportSize({ width, height: 1000 });
        await page.evaluate((theme) => {
          document.documentElement.dataset.theme = theme;
          localStorage.setItem("nutrequine-theme", theme);
        }, theme);
        await page
          .locator(".preparation-record")
          .screenshot({ path: join(f.evidence, `confirmation-form-${width}-${theme}.png`) });
      }
    await page.setViewportSize({ width: 1440, height: 1000 });
    let first = true;
    let lost, replay;
    let blockOverview = false;
    let failedOverview = false;
    await page.route("**/api/micro-preparations", async (route) => {
      if (blockOverview) {
        blockOverview = false;
        failedOverview = true;
        await route.abort("failed");
      } else await route.continue();
    });
    await page.route("**/api/command", async (route) => {
      if (first && route.request().postDataJSON()?.type === "MICRO_PREPARATION_CONFIRM") {
        first = false;
        lost = route.request().postDataJSON();
        const response = await route.fetch();
        assert.equal(response.status(), 200);
        blockOverview = true;
        await route.abort("failed");
      } else {
        replay = route.request().postDataJSON();
        await route.continue();
      }
    });
    await record.getByRole("button", { name: "Confirmar consumo y cerrar", exact: true }).click();
    const retry = page.getByRole("button", { name: "Reintentar cierre", exact: true });
    await expect(page.locator(".micro-preparations").getByRole("alert")).toBeVisible();
    assert.equal(failedOverview, true);
    await expect(retry).toBeEnabled({ timeout: 30000 });
    await retry.focus();
    await retry.press("Enter");
    const result = page.getByRole("status", { name: "Resultado de preparación" });
    await expect(result).toBeVisible();
    await expect(result).toBeFocused();
    await expect(result).toContainText("Terminados reales: 12");
    await expect(result).toContainText("S/ 7.22");
    await expect(page.locator(".preparation-record")).toContainText("Cerrada definitivamente");
    await expect(page.locator(".preparation-record")).not.toContainText("Potencialmente reanudable");
    const closed = await state();
    assert.deepEqual(replay, lost);
    assert.equal(closed.microConfirmations.length, 1);
    assert.equal(closed.microIssues.length, 2);
    assert.equal(closed.microIssues[0].released_hundredths, 240000);
    assert.equal(closed.inventoryMovements.length, 0);
    for (const width of [1440, 390])
      for (const theme of ["light", "dark"]) {
        await page.setViewportSize({ width, height: 1000 });
        await page.evaluate((theme) => {
          document.documentElement.dataset.theme = theme;
        }, theme);
        await page
          .locator(".preparation-record")
          .screenshot({ path: join(f.evidence, `confirmation-result-${width}-${theme}.png`) });
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      }
    await create("8");
    await page.reload();
    assert.equal((await state()).microPreparations.length, 2);
    await expect(page.locator(".preparation-record")).toHaveCount(2);
    assert.deepEqual(errors, []);
  },
);
