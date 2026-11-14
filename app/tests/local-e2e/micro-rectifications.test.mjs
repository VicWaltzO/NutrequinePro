import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { chromium, expect } from "playwright/test";
import { localAppFixture } from "../helpers/local-app-server.mjs";
import { rectificationFixture } from "../helpers/rectification-fixture.mjs";
import { openSqliteDatabase } from "../../lib/adapters/node-sqlite.mjs";
import { createStore } from "../../lib/application-store.mjs";
test(
  "NQP34 UI20→18, respuesta perdida/replay, cierre auditado, teclado,1440/390 claro/oscuro",
  { timeout: 300000 },
  async (t) => {
    const f = await localAppFixture({ startupTimeoutMs: 180000 });
    t.after(f.stop);
    await f.stop();
    const synthetic = rectificationFixture(),
      db = openSqliteDatabase(f.database),
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
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: "es-PE" });
    const login = await context.request.post(f.baseURL + "/api/auth/login", {
      headers: { Origin: f.baseURL },
      data: { login: "admin.local", password: f.password },
    });
    assert.equal(login.status(), 200);
    const csrf = (await login.json()).csrf_token;
    const state = async () => (await (await context.request.get(f.baseURL + "/api/state")).json()).state;
    const command = async (type, payload) => {
      const r = await context.request.post(f.baseURL + "/api/command", {
        headers: { Origin: f.baseURL, "X-CSRF-Token": csrf },
        data: { type, payload, request_id: crypto.randomUUID() },
      });
      assert.equal(r.status(), 200, await r.text());
      return (await r.json()).result;
    };
    const page = await context.newPage(),
      errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(f.baseURL + "/#inventory/micros");
    const record = page.getByRole("article", { name: `Preparación ${synthetic.id}`, exact: true });
    await record.getByRole("button", { name: "Rectificar cantidad preparada", exact: true }).click();
    let form = record.getByRole("form", { name: "Rectificación de preparación" });
    await expect(form.getByLabel("Cantidad preparada corregida")).toBeFocused();
    await form.getByLabel("Cantidad preparada corregida").fill("18");
    await form.getByLabel("Fecha de rectificación").fill("2026-11-14");
    await form.getByLabel("Motivo de rectificación").fill("Conteo sintético corregido");
    await form.getByLabel("Referencia de rectificación").fill("ACTA E2E34");
    await form.getByRole("checkbox").check();
    for (const width of [1440, 390])
      for (const theme of ["light", "dark"]) {
        await page.setViewportSize({ width, height: 1000 });
        await page.evaluate((theme) => {
          document.documentElement.dataset.theme = theme;
          localStorage.setItem("nutrequine-theme", theme);
        }, theme);
        await form.screenshot({ path: join(f.evidence, `rectification-form-${width}-${theme}.png`) });
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      }
    let lostRequest;
    await page.route("**/api/command", async (route) => {
      const body = route.request().postDataJSON();
      if (body.type !== "MICRO_PREPARATION_RECTIFY" || lostRequest) return route.continue();
      lostRequest = body;
      const response = await route.fetch();
      assert.equal(response.status(), 200, await response.text());
      await route.abort("failed");
    });
    await form.getByRole("button", { name: "Registrar rectificación auditada", exact: true }).click();
    await expect(form.getByRole("button", { name: "Reintentar rectificación", exact: true })).toBeEnabled();
    await form.getByRole("button", { name: "Reintentar rectificación", exact: true }).click();
    await expect(
      record.getByRole("button", { name: "Rectificar cantidad preparada", exact: true }),
    ).toBeFocused();
    let s = await state();
    assert.deepEqual(s.microIssues, synthetic.s.microIssues);
    assert.deepEqual(s.microConfirmations, synthetic.s.microConfirmations);
    assert.equal(s.corrections.filter((c) => c.entity_type === "MICRO_PREPARATION_RECTIFY").length, 1);
    const replay = await context.request.post(f.baseURL + "/api/command", {
      headers: { Origin: f.baseURL, "X-CSRF-Token": csrf },
      data: lostRequest,
    });
    assert.equal(replay.status(), 200);
    await record.getByText("Historial de rectificaciones (1)", { exact: true }).click();
    await record.screenshot({ path: join(f.evidence, "rectification-history.png") });
    const product = s.products.find((p) => p.id === "prod-1"),
      macro = s.formulas.find((x) => x.product_id === product.id && x.is_active);
    await command("JOURNEY_CREATE", {
      date: "2026-11-14",
      notes: "Ensayo E2E34",
      expected_revision: s.revision,
      lines: [
        {
          product_id: product.id,
          nuclei: "18",
          formula_id: macro.id,
          micro_formula_id: s.microPreparations[0].formula_id,
        },
      ],
    });
    s = await state();
    const line = s.productionJourneyLines[0];
    await command("JOURNEY_LINK", {
      line_id: line.id,
      preparation_id: synthetic.id,
      nuclei: "18",
      expected_revision: s.revision,
    });
    s = await state();
    await command("MILL_CLOSE", {
      line_id: line.id,
      date: "2026-11-14",
      actual_bags: 700,
      lot_complete: true,
      formula_consent: false,
      expected_revision: s.revision,
    });
    const closed = await state();
    await page.reload();
    await record.getByRole("button", { name: "Rectificar cantidad preparada", exact: true }).click();
    form = record.getByRole("form", { name: "Rectificación de preparación" });
    await expect(form.getByText(/Lote comercial cerrado/)).toBeVisible();
    assert.equal(await form.getByRole("checkbox").count(), 0);
    await form.getByLabel("Cantidad preparada corregida").fill("17");
    await form.getByLabel("Fecha de rectificación").fill("2026-11-14");
    await form.getByLabel("Motivo de rectificación").fill("Acta posterior al cierre");
    await form.getByLabel("Referencia de rectificación").fill("ACTA CIERRE E2E34");
    await form.screenshot({ path: join(f.evidence, "rectification-closed-form.png") });
    await form.getByRole("button", { name: "Registrar rectificación auditada", exact: true }).click();
    await expect(record.getByText(/Cantidad rectificada: 17 núcleos/)).toBeVisible();
    s = await state();
    for (const table of [
      "microIssues",
      "microConfirmations",
      "microLedgers",
      "millClosures",
      "inventoryMovements",
    ])
      assert.deepEqual(s[table], closed[table]);
    assert.equal(s.corrections.at(-1).new_snapshot.mode, "AUDIT_ONLY");
    assert.deepEqual(errors, []);
    console.log("NQP34 capturas sintéticas", f.evidence);
  },
);
