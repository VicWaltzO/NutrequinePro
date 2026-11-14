import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { chromium, expect } from "playwright/test";
import { localAppFixture } from "../helpers/local-app-server.mjs";
import { ready, apply } from "../helpers/mill-fixture.mjs";
import { openSqliteDatabase } from "../../lib/adapters/node-sqlite.mjs";
import { createStore } from "../../lib/application-store.mjs";

import { create, link } from "../helpers/journey-fixture.mjs";
import { millCostSummary, roundedCost } from "../../features/produccion/domain/mill-cost.mjs";
test(
  "NQP31 E2E 39/38/40/0, costos, conciliación variable, replay, teclado y cuatro vistas",
  { timeout: 600000 },
  async (t) => {
    const f = await localAppFixture({ startupTimeoutMs: 180000 });
    t.after(f.stop);
    await f.stop();
    const synthetic = ready();
    // A fourth independent lot, below one bag, exercises the existing zero-yield contract.
    const rose = synthetic.s.microPreparations.find((p) => p.family === "ROSADO");
    synthetic.s = apply(synthetic.s, create(synthetic.s, ["0.01"]), synthetic.options).state;
    const zeroLine = synthetic.s.productionJourneyLines.at(-1);
    synthetic.s = apply(
      synthetic.s,
      link(synthetic.s, zeroLine.id, rose.id, "0.01"),
      synthetic.options,
    ).state;
    const db = openSqliteDatabase(f.database),
      store = createStore(() => db, synthetic.options),
      original = await store.loadState();
    synthetic.s.users.push(...original.users);
    await store.persistState(original, synthetic.s);
    db.close();
    const config = JSON.parse(readFileSync(f.configFile, "utf8"));
    config.micro_preparation_policies = synthetic.options.microPreparationPolicies;
    config.micro_substitution_policies = synthetic.options.microSubstitutionPolicies;
    writeFileSync(f.configFile, JSON.stringify(config));
    await f.start();
    const browser = await chromium.launch({ channel: process.env.REGRESSION_BROWSER_CHANNEL || undefined });
    t.after(() => browser.close());
    const context = await browser.newContext({ viewport: { width: 1440, height: 1050 }, locale: "es-PE" });
    const login = await context.request.post(f.baseURL + "/api/auth/login", {
      headers: { Origin: f.baseURL },
      data: { login: "admin.local", password: f.password },
    });
    assert.equal(login.status(), 200);
    const state = async () => (await (await context.request.get(f.baseURL + "/api/state")).json()).state;
    const page = await context.newPage(),
      errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    const before = await state();
    await page.goto(f.baseURL + "/#productions/journeys");
    await page
      .getByRole("region", { name: "Costo de fabricación informativo", exact: true })
      .first()
      .evaluate((el) => el.scrollIntoView({ block: "start" }));
    await page.screenshot({ path: join(f.evidence, "cost-pending-1440.png"), fullPage: false });
    let lost = false;
    await page.route("**/api/command", async (route) => {
      if (route.request().postDataJSON()?.type === "MILL_COST_INPUT" && !lost) {
        lost = true;
        assert.equal((await route.fetch()).status(), 200);
        await route.abort("failed");
      } else await route.continue();
    });
    const lines = synthetic.s.productionJourneyLines;
    for (const [i, bags] of [39, 38, 40, 0].entries()) {
      const line = lines[i],
        name = line.product_name;
      const region = page
        .locator(".journey-line")
        .filter({ has: page.getByRole("heading", { name, exact: true }) })
        .filter({ hasText: i === 3 ? "0.01 núcleos" : "Planificados: 1 núcleos" });
      await region.getByRole("button", { name: `Cerrar lote de ${name}`, exact: true }).click();
      let form = page.getByRole("form", { name: "Cerrar lote del molino" });
      await form.getByLabel("Fecha de cierre", { exact: true }).fill("2026-11-14");
      await form.getByLabel("Sacos completos reales", { exact: true }).fill(String(bags));
      await form.getByLabel("El molino terminó la totalidad de este lote-producto").check();
      await form.getByRole("button", { name: "Cerrar lote e ingresar sacos", exact: true }).click();
      await expect(page.getByRole("dialog")).not.toBeVisible();
      await region.getByRole("button", { name: `Conciliar molino de ${name}`, exact: true }).click();
      form = page.getByRole("form", { name: "Conciliación del molino" });
      await form.getByRole("button", { name: "Guardar conciliación del molino", exact: true }).click();
      await expect(page.getByRole("dialog")).not.toBeVisible();
      await region.getByRole("button", { name: `Registrar costos de ${name}`, exact: true }).click();
      form = page.getByRole("form", { name: "Costos documentados por producto" });
      await expect(form.getByLabel("Total de envases S/", { exact: true })).toHaveValue("");
      await form.getByLabel("Total de envases S/", { exact: true }).fill(i === 3 ? "0" : "44");
      await form
        .getByLabel("Referencia de envases o confirmación de costo cero", { exact: true })
        .fill("DOC sintético " + i);
      if (i === 0) {
        await form.getByRole("button", { name: "Agregar costo directo", exact: true }).click();
        await form.getByLabel("Descripción del costo 1", { exact: true }).fill("Insumo directo sintético");
        await form.getByLabel("Importe del costo 1 S/", { exact: true }).fill("3.25");
        await form.getByLabel("Referencia del costo 1", { exact: true }).fill("EXTRA sintético");
      }
      await form.getByLabel(/Revisé los comprobantes/).check();
      await form.getByLabel("Motivo del registro", { exact: true }).fill("Ensayo NQP31");
      if (i === 0) {
        await form.getByLabel("Motivo del registro", { exact: true }).focus();
        await page.keyboard.press("Tab");
        assert.notEqual(await page.evaluate(() => document.activeElement?.tagName), "BODY");
        for (const width of [1440, 390])
          for (const theme of ["light", "dark"]) {
            await page.setViewportSize({ width, height: 1000 });
            await page.evaluate((v) => (document.documentElement.dataset.theme = v), theme);
            await form.evaluate((el) => el.scrollIntoView({ block: "start" }));
            await page.screenshot({
              path: join(f.evidence, `cost-form-${width}-${theme}.png`),
              fullPage: false,
            });
            await form.getByLabel("Motivo del registro", { exact: true }).scrollIntoViewIfNeeded();
            await page.screenshot({
              path: join(f.evidence, `cost-form-bottom-${width}-${theme}.png`),
              fullPage: false,
            });
            assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
          }
        await page.setViewportSize({ width: 1440, height: 1050 });
      }
      await form.getByRole("button", { name: "Guardar costos documentados", exact: true }).click();
      if (i === 0) {
        await expect(
          form.getByRole("button", { name: "Reintentar costos documentados", exact: true }),
        ).toBeVisible();
        await form.getByRole("button", { name: "Reintentar costos documentados", exact: true }).click();
      }
      await expect(page.getByRole("dialog")).not.toBeVisible();
      await page.reload();
      const saved = await state(),
        cost = millCostSummary(saved, line.id);
      assert.equal(cost.actual_bags, bags);
      assert.equal(cost.complete, true);
      const dl = region.getByRole("region", { name: "Costo de fabricación informativo", exact: true });
      await expect(dl).toContainText("Costo total informativo");
      if (bags === 0) await expect(dl).toContainText("Indefinido: cero sacos comercializables");
      else assert.ok(roundedCost(cost.unit) > 0);
    }
    const saved = await state();
    assert.equal(saved.corrections.filter((r) => r.entity_type === "MILL_COST_INPUT").length, 4);
    for (const table of [
      "microIssues",
      "microConfirmations",
      "productionJourneyLines",
      "sales",
      "expenses",
      "payments",
      "productionCosts",
    ])
      assert.deepEqual(saved[table], before[table], table);
    assert.ok(saved.millClosures.every((c) => c.final_cost_cents === null));
    // Change a confirmed bill after costing; only the informational view changes.
    const first = lines[1],
      name = first.product_name,
      region = page.getByRole("region", { name, exact: true });
    const oldCost = millCostSummary(saved, first.id);
    await region.getByRole("button", { name: `Conciliar molino de ${name}`, exact: true }).click();
    const chargeForm = page.getByRole("form", { name: "Conciliación del molino" });
    await chargeForm.getByLabel("Modalidad de cobro").selectOption("ACTUAL");
    await chargeForm.getByLabel(`Precio cobrado ${first.macro_estimate[0].name}`, { exact: true }).fill("99");
    await chargeForm.getByRole("button", { name: "Guardar conciliación del molino", exact: true }).click();
    await expect(page.getByRole("dialog")).not.toBeVisible();
    const changed = await state();
    assert.notDeepEqual(millCostSummary(changed, first.id).total, oldCost.total);
    assert.deepEqual(changed.millClosures, saved.millClosures);
    assert.deepEqual(changed.inventoryMovements, saved.inventoryMovements);
    for (const width of [1440, 390])
      for (const theme of ["light", "dark"]) {
        await page.setViewportSize({ width, height: 1000 });
        await page.evaluate((v) => (document.documentElement.dataset.theme = v), theme);
        await region.evaluate((el) => el.scrollIntoView({ block: "start" }));
        await page.evaluate(() => window.scrollBy(0, -85));
        await page.screenshot({ path: join(f.evidence, `cost-view-${width}-${theme}.png`), fullPage: false });
        const zero = page
          .locator(".journey-line")
          .filter({ hasText: "Planificados: 0.01 núcleos" })
          .getByRole("region", { name: "Costo de fabricación informativo", exact: true });
        await zero.evaluate((el) => el.scrollIntoView({ block: "start" }));
        await page.evaluate(() => window.scrollBy(0, -85));
        await page.screenshot({ path: join(f.evidence, `cost-zero-${width}-${theme}.png`), fullPage: false });
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      }
    assert.deepEqual(errors, []);
    console.log("NQP31_EVIDENCE", f.evidence);
  },
);
