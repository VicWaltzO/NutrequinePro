import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { chromium, expect } from "playwright/test";
import { localAppFixture } from "../helpers/local-app-server.mjs";
import { ready, apply, closeCommand } from "../helpers/mill-fixture.mjs";
import { openSqliteDatabase } from "../../lib/adapters/node-sqlite.mjs";
import { createStore } from "../../lib/application-store.mjs";

test(
  "NQP32 E2E teórico/real, diferencias, reintento único, teclado y cuatro vistas",
  { timeout: 600000 },
  async (t) => {
    const f = await localAppFixture({ startupTimeoutMs: 180000 });
    t.after(f.stop);
    await f.stop();
    const synthetic = ready(["1"]);
    synthetic.s = apply(synthetic.s, closeCommand(synthetic.s), synthetic.options).state;
    synthetic.s = apply(
      synthetic.s,
      {
        type: "PRODUCTION_SAVE",
        request_id: crypto.randomUUID(),
        payload: {
          production_date: "2026-11-14",
          products: [{ product_id: synthetic.s.productionJourneyLines[0].product_id, nuclei_count: 1 }],
          confirm: true,
        },
      },
      synthetic.options,
    ).state;
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
    const state = async () => (await (await context.request.get(f.baseURL + "/api/state")).json()).state;
    const page = await context.newPage(),
      errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    const before = await state();
    const line = before.productionJourneyLines[0],
      name = line.product_name,
      macro = line.macro_estimate[0];
    await page.goto(f.baseURL + "/#productions/journeys");
    const open = async () => {
      await page.getByRole("button", { name: `Conciliar molino de ${name}`, exact: true }).click();
      return page.getByRole("form", { name: "Conciliación del molino", exact: true });
    };
    let form = await open();
    await expect(form.getByLabel("Modalidad de cobro")).toHaveValue("THEORETICAL");
    await expect(form.getByLabel(`Kg cobrados ${macro.name}`, { exact: true })).toBeDisabled();
    await form.getByLabel("Modalidad de cobro").selectOption("ACTUAL");
    const qty = form.getByLabel(`Kg cobrados ${macro.name}`, { exact: true });
    const price = form.getByLabel(`Precio cobrado ${macro.name}`, { exact: true });
    await expect(qty).toHaveValue(String(macro.grams / 1000));
    await expect(price).toHaveValue(String(macro.price_cents_per_kg / 100));
    await qty.fill("2.125");
    await price.fill("3.25");
    await price.focus();
    await page.keyboard.press("Tab");
    assert.notEqual(await page.evaluate(() => document.activeElement?.tagName), "BODY");
    for (const width of [1440, 390])
      for (const theme of ["light", "dark"]) {
        await page.setViewportSize({ width, height: 1000 });
        await page.evaluate((v) => {
          document.documentElement.dataset.theme = v;
        }, theme);
        await page.screenshot({
          path: join(f.evidence, `charge-form-${width}-${theme}.png`),
          fullPage: true,
        });
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      }
    await page.setViewportSize({ width: 1440, height: 1050 });
    await form.getByRole("button", { name: "Restablecer al teórico", exact: true }).click();
    await expect(qty).toHaveValue(String(macro.grams / 1000));
    await price.fill("3.25"); // only one cell needs changing
    let lost = false;
    await page.route("**/api/command", async (route) => {
      if (route.request().postDataJSON()?.type === "MILL_RECONCILE" && !lost) {
        lost = true;
        assert.equal((await route.fetch()).status(), 200);
        await route.abort("failed");
      } else await route.continue();
    });
    await form.getByRole("button", { name: "Guardar conciliación del molino", exact: true }).click();
    await expect(form.getByRole("button", { name: "Reintentar conciliación", exact: true })).toBeVisible();
    await form.getByRole("button", { name: "Reintentar conciliación", exact: true }).click();
    await expect(page.getByRole("dialog")).not.toBeVisible();
    await page.reload();
    let after = await state();
    assert.equal(after.corrections.filter((r) => r.entity_type === "MILL_CHARGE").length, 1);
    assert.equal(after.corrections.at(-1).new_snapshot.service_cents, 25000);
    form = await open();
    await expect(form.getByLabel("Modalidad de cobro")).toHaveValue("ACTUAL");
    await expect(form.getByLabel(`Precio cobrado ${macro.name}`, { exact: true })).toHaveValue("3.25");
    await form.getByLabel("Modalidad de cobro").selectOption("THEORETICAL");
    await form.getByRole("button", { name: "Guardar conciliación del molino", exact: true }).click();
    await expect(page.getByRole("dialog")).not.toBeVisible();
    after = await state();
    assert.equal(after.corrections.filter((r) => r.entity_type === "MILL_CHARGE").length, 2);
    for (const table of [
      "millClosures",
      "productionJourneyLines",
      "inventoryMovements",
      "microIssues",
      "expenses",
      "payments",
      "productionCosts",
      "sales",
    ])
      assert.deepEqual(after[table], before[table], table);
    assert.deepEqual(errors, []);
    // The existing legacy reconciliation keeps its command, permissions and null history.
    const legacy = before.productions[0];
    const ingredient = before.productionIngredients.find((r) => r.production_id === legacy.id);
    const ingredientName = before.ingredients.find((r) => r.id === ingredient.ingredient_id).name;
    assert.equal(ingredient.actual_charge, null);
    await page.goto(f.baseURL + "/#productions/all");
    await page.getByRole("button", { name: legacy.code, exact: true }).click();
    await page.getByRole("button", { name: "Conciliar costos", exact: true }).click();
    const dialog = page.getByRole("dialog");
    const legacyQty = dialog.getByLabel(`Kg cobrados ${ingredientName}`, { exact: true });
    const legacyPrice = dialog.getByLabel(`Precio cobrado ${ingredientName}`, { exact: true });
    const row = dialog
      .getByRole("row")
      .filter({ has: page.getByLabel(`Kg cobrados ${ingredientName}`, { exact: true }) });
    for (const width of [1440, 390])
      for (const theme of ["light", "dark"]) {
        await page.setViewportSize({ width, height: 1000 });
        await page.evaluate((v) => {
          document.documentElement.dataset.theme = v;
        }, theme);
        await page.screenshot({
          path: join(f.evidence, `legacy-charge-${width}-${theme}.png`),
          fullPage: true,
        });
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      }
    await page.setViewportSize({ width: 1440, height: 1050 });
    await expect(row.getByLabel("Cobro real", { exact: true })).toHaveValue(
      String(ingredient.theoretical_net_cost / 100),
    );
    await legacyQty.fill("2");
    await legacyPrice.fill("4");
    await expect(row.getByLabel("Cobro real", { exact: true })).toHaveValue("8.00");
    await dialog.getByRole("button", { name: "Restablecer al teórico neto", exact: true }).click();
    await expect(legacyQty).toHaveValue(String(ingredient.total_kg / 1000));
    await legacyPrice.fill("4");
    await dialog.getByRole("button", { name: "Guardar conciliación", exact: true }).click();
    await expect(dialog.getByRole("button", { name: "Guardar conciliación", exact: true })).toHaveCount(0);
    await expect(dialog.getByRole("heading", { name: legacy.code, exact: true })).toBeVisible();
    const saved = await state();
    const billed = saved.productionIngredients.find((r) => r.id === ingredient.id);
    assert.equal(billed.charged_grams, ingredient.total_kg);
    assert.equal(billed.charged_price_cents_per_kg, 400);
    assert.equal(billed.actual_charge, Math.round((ingredient.total_kg * 400) / 1000));
    assert.equal(billed.theoretical_net_cost, ingredient.theoretical_net_cost);
    assert.deepEqual(saved.inventoryMovements, before.inventoryMovements);
    assert.deepEqual(saved.productionCosts, before.productionCosts);
    assert.deepEqual(errors, []);
    console.log("NQP32_EVIDENCE", f.evidence);
  },
);
