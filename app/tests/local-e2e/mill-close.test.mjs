import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { chromium, expect } from "playwright/test";
import { localAppFixture } from "../helpers/local-app-server.mjs";
import { ready } from "../helpers/mill-fixture.mjs";
import { openSqliteDatabase } from "../../lib/adapters/node-sqlite.mjs";
import { createStore } from "../../lib/application-store.mjs";

test(
  "NQP30 E2E tres productos39/38/40, pérdida de respuesta, cierre único y móvil",
  { timeout: 600000 },
  async (t) => {
    const f = await localAppFixture({ startupTimeoutMs: 180000 });
    t.after(f.stop);
    await f.stop();
    const synthetic = ready();
    const db = openSqliteDatabase(f.database),
      store = createStore(() => db, synthetic.options);
    const original = await store.loadState();
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
    const page = await context.newPage(),
      errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    const state = async () => (await (await context.request.get(f.baseURL + "/api/state")).json()).state;
    const history = JSON.stringify([
      (await state()).microIssues,
      (await state()).microConfirmations,
      (await state()).productionJourneyLines,
      (await state()).sales,
    ]);
    await page.goto(f.baseURL + "/#productions/journeys");
    let lost = false;
    await page.route("**/api/command", async (route) => {
      if (route.request().postDataJSON()?.type === "MILL_CLOSE" && !lost) {
        lost = true;
        const r = await route.fetch();
        assert.equal(r.status(), 200);
        await route.abort("failed");
      } else await route.continue();
    });
    for (const [i, bags] of [39, 38, 40].entries()) {
      const name = synthetic.s.productionJourneyLines[i].product_name;
      await page.getByRole("button", { name: `Cerrar lote de ${name}`, exact: true }).click();
      const form = page.getByRole("form", { name: "Cerrar lote del molino" });
      await form.getByLabel("Fecha de cierre", { exact: true }).fill("2026-11-14");
      await form.getByLabel("Sacos completos reales", { exact: true }).fill(String(bags));
      await expect(
        form.getByRole("button", { name: "Cerrar lote e ingresar sacos", exact: true }),
      ).toBeDisabled();
      await form.getByLabel("El molino terminó la totalidad de este lote-producto").check();
      await expect(form.getByText(/Merma equivalente estimada/)).toContainText(
        bags === 39 ? "25" : bags === 38 ? "50" : "0",
      );
      if (i === 0) {
        for (const width of [1440, 390]) {
          await page.setViewportSize({ width, height: 1000 });
          await page.screenshot({ path: join(f.evidence, `mill-form-${width}.png`), fullPage: true });
          assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
        }
        await page.setViewportSize({ width: 1440, height: 1050 });
      }
      await form.getByRole("button", { name: "Cerrar lote e ingresar sacos", exact: true }).click();
      if (i === 0) {
        await expect(form.getByRole("button", { name: "Reintentar cierre", exact: true })).toBeVisible();
        await form.getByRole("button", { name: "Reintentar cierre", exact: true }).click();
      }
      await expect(page.getByRole("dialog")).not.toBeVisible();
      const s = await state();
      assert.equal(s.millClosures.length, i + 1);
      assert.equal(
        s.inventoryMovements
          .filter(
            (m) =>
              m.item_type === "PRODUCT" &&
              m.item_id === synthetic.s.productionJourneyLines[i].product_id &&
              m.source_type === "MILL_CLOSURE",
          )
          .reduce((n, m) => n + m.quantity, 0),
        bags,
      );
      await page.reload();
      await expect(page.getByRole("button", { name: `Cerrar lote de ${name}`, exact: true })).toHaveCount(0);
    }
    const s = await state();
    assert.equal(
      JSON.stringify([s.microIssues, s.microConfirmations, s.productionJourneyLines, s.sales]),
      history,
    );
    assert.deepEqual(
      s.millClosures.map((c) => c.waste_grams),
      [25000, 50000, 0],
    );
    assert.ok(s.millClosures.every((c) => c.final_cost_cents === null));
    await page.getByLabel("Estado", { exact: true }).selectOption("CLOSED");
    await expect(page.locator(".journey-list > details")).toHaveCount(1);
    for (const width of [1440, 390])
      for (const theme of ["light", "dark"]) {
        await page.setViewportSize({ width, height: 1000 });
        await page.evaluate((theme) => (document.documentElement.dataset.theme = theme), theme);
        await page.screenshot({
          path: join(f.evidence, `mill-closed-${width}-${theme}.png`),
          fullPage: true,
        });
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      }
    assert.deepEqual(errors, []);
    console.log("NQP30_EVIDENCE", f.evidence);
  },
);
