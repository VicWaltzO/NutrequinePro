import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { chromium, expect } from "playwright/test";
import { localAppFixture } from "../helpers/local-app-server.mjs";
test(
  "NQP25 E2E:10+10, dos familias, consentimiento, respuesta perdida e historia",
  { timeout: 600000 },
  async (t) => {
    const f = await localAppFixture({ startupTimeoutMs: 180000 });
    console.log("NQP25 E2E: distribución y servidor sintético iniciados");
    t.after(f.stop);
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
    const state = async () => (await (await context.request.get(f.baseURL + "/api/state")).json()).state;
    const cmd = async (type, payload) => {
      const r = await context.request.post(f.baseURL + "/api/command", {
        headers: { Origin: f.baseURL, "X-CSRF-Token": csrf },
        data: { type, payload, request_id: randomUUID() },
      });
      assert.equal(r.status(), 200, await r.text());
      return (await r.json()).result;
    };
    const rev = async (type, payload) =>
      cmd(type, { ...payload, expected_revision: (await state()).revision });
    const ids = [];
    for (let i = 0; i < 3; i++) {
      ids.push(
        await cmd("MICRO_SAVE", {
          operational_id: i + 1,
          name: `Ingrediente sintético25 ${i + 1}`,
          is_active: true,
        }),
      );
      await cmd("MICRO_OPEN", {
        micro_ingredient_id: ids[i],
        quantity_kg: "10",
        unit_cost: i === 2 ? "5" : "2",
        cutoff_date: "2026-10-30",
        measurement: "REAL",
        source: "Prueba sintética",
        notes: "",
      });
    }
    const policies = [];
    for (const family of ["ROSADO", "VERDE_AMARILLO"]) {
      const id = await cmd("MICRO_FORMULA_SAVE", {
        family,
        expected_version: 0,
        lines: [
          { micro_ingredient_id: ids[0], dose_kg: family === "ROSADO" ? "0.300" : "0.100" },
          { micro_ingredient_id: ids[1], dose_kg: "0.001" },
        ],
      });
      await cmd("MICRO_FORMULA_ACTIVATE", { family, formula_id: id, expected_version: 1 });
      policies.push({
        formula_id: id,
        family,
        reference: "Aprobación sintética origen25",
        lines: [
          { micro_ingredient_id: ids[0], dose_grams: family === "ROSADO" ? 300 : 100 },
          { micro_ingredient_id: ids[1], dose_grams: 1 },
        ],
      });
    }
    await f.stop();
    const config = JSON.parse(readFileSync(f.configFile, "utf8"));
    config.micro_preparation_policies = policies;
    config.micro_substitution_policies = [
      {
        id: "synthetic25",
        reference: "Reemplazo sintético aprobado25",
        from_ingredient_id: ids[0],
        to_ingredient_id: ids[2],
        families: Object.fromEntries(
          policies.map((p) => [
            p.family,
            {
              source_formula_id: p.formula_id,
              lines: [
                { micro_ingredient_id: ids[2], dose_grams: p.family === "ROSADO" ? 137 : 71 },
                { micro_ingredient_id: ids[1], dose_grams: 1 },
              ],
            },
          ]),
        ),
      },
    ];
    writeFileSync(f.configFile, JSON.stringify(config));
    await f.start();
    console.log("NQP25 E2E: políticas privadas sintéticas cargadas");
    await login();
    const create = async (nuclei) =>
      rev("MICRO_PREPARATION_CREATE", {
        family: "ROSADO",
        formula_id: (await state()).microFormulaHeads.find((h) => h.family === "ROSADO").active_formula_id,
        nuclei,
        date: "2026-11-09",
      });
    const a = await create("20");
    await rev("MICRO_ASSIGN", { preparation_id: a, reason: "GrupoA" });
    await rev("MICRO_PREPARATION_CONFIRM", { preparation_id: a, nuclei: "10", date: "2026-11-10" });
    const history = JSON.stringify((await state()).microConfirmations[0]);
    console.log("NQP25 E2E: grupo A cerrado, snapshot conservado");
    const pending = await create("20");
    const otherPending = await rev("MICRO_PREPARATION_CREATE", {
      family: "VERDE_AMARILLO",
      formula_id: policies[1].formula_id,
      nuclei: "10",
      date: "2026-11-09",
    });
    await rev("MICRO_ASSIGN", { preparation_id: pending, reason: "PendienteA" });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(f.baseURL + "/#inventory/micros");
    const panel = page.getByRole("region", { name: "Sustituciones autorizadas" });
    await panel.getByRole("button", { name: "Registrar sustitución autorizada", exact: true }).click();
    await expect(panel.getByLabel("Aprobación técnica")).toBeFocused();
    await panel.getByLabel("Aprobación técnica").selectOption("synthetic25");
    await page.keyboard.press("Tab");
    await expect(panel.getByLabel("Motivo", { exact: true })).toBeFocused();
    await panel.getByLabel("Motivo", { exact: true }).fill("Cambio sintético aprobado");
    await panel.getByRole("button", { name: "Confirmar operación autorizada" }).click();
    await expect(panel.getByRole("button", { name: "Proponer cambio de receta pendiente" })).toBeVisible();
    console.log("NQP25 E2E: ambas familias publicadas");
    const open = async () => {
      await panel.getByRole("button", { name: "Proponer cambio de receta pendiente" }).click();
      await panel.getByLabel("Preparación del grupo").selectOption(pending);
      await panel.getByLabel("Sustitución propuesta").selectOption((await state()).microSubstitutions[0].id);
      await panel.getByLabel("Motivo", { exact: true }).fill("Consentimiento de ensayo");
    };
    await open();
    await expect(panel.getByRole("button", { name: "Confirmar operación autorizada" })).toBeDisabled();
    const before = (await state()).revision;
    await panel.getByRole("button", { name: "Cancelar cambio" }).click();
    await expect(panel.getByRole("button", { name: "Proponer cambio de receta pendiente" })).toBeFocused();
    assert.equal((await state()).revision, before);
    console.log("NQP25 E2E: cancelación sin escritura");
    await open();
    await expect(panel.getByLabel("Comparación de recetas")).toContainText("137 g/núcleo");
    const consent = panel.getByLabel("Confirmo expresamente adoptar", { exact: false });
    const confirm = panel.getByRole("button", { name: "Confirmar operación autorizada" });
    await consent.check();
    await panel.getByLabel("Preparación del grupo").selectOption(otherPending);
    await expect(consent).not.toBeChecked();
    await expect(confirm).toBeDisabled();
    await expect(panel.getByLabel("Comparación de recetas")).toContainText("71 g/núcleo");
    await consent.check();
    await panel.getByLabel("Sustitución propuesta").selectOption("");
    await expect(consent).not.toBeChecked();
    await expect(confirm).toBeDisabled();
    await panel.getByLabel("Sustitución propuesta").selectOption((await state()).microSubstitutions[0].id);
    await expect(consent).not.toBeChecked();
    await consent.check();
    await panel.getByLabel("Preparación del grupo").selectOption(pending);
    await expect(consent).not.toBeChecked();
    await expect(confirm).toBeDisabled();
    assert.equal((await state()).revision, before);

    await expect(page.locator(".toast")).toBeHidden({ timeout: 10000 });
    for (const width of [1440, 390])
      for (const theme of ["light", "dark"]) {
        await page.setViewportSize({ width, height: 1000 });
        await page.evaluate((theme) => {
          document.documentElement.dataset.theme = theme;
          localStorage.setItem("nutrequine-theme", theme);
        }, theme);
        await panel.screenshot({ path: join(f.evidence, `substitution-${width}-${theme}.png`) });
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      }
    await panel.getByLabel("Confirmo expresamente adoptar", { exact: false }).check();
    let lost = true;
    let originalRequest;
    await page.route("**/api/command", async (route) => {
      const body = route.request().postDataJSON();
      if (body.type !== "MICRO_ADOPT") return route.continue();
      if (lost) {
        lost = false;
        originalRequest = body.request_id;
        await route.fetch();
        return route.abort("connectionreset");
      }
      assert.equal(body.request_id, originalRequest);
      await route.continue();
    });
    await panel.getByRole("button", { name: "Confirmar operación autorizada" }).click();
    await expect(panel.getByRole("button", { name: "Confirmar operación autorizada" })).toBeEnabled();
    await panel.getByRole("button", { name: "Confirmar operación autorizada" }).click();
    await expect(panel.getByRole("button", { name: "Proponer cambio de receta pendiente" })).toBeVisible();
    await page.unroute("**/api/command");
    assert.equal((await state()).microSupersessions.length, 1);
    console.log("NQP25 E2E: adopción y replay tras respuesta perdida sin duplicación");
    const b = await create("10");
    await rev("MICRO_ASSIGN", { preparation_id: b, reason: "GrupoB" });
    for (const id of [a, b])
      await rev("MICRO_GROUP_LINK", {
        preparation_id: id,
        group_reference: "TANDA-SINTETICA25",
        reason: "Consumos separados",
      });
    await page.reload();
    const record = page.getByRole("article", { name: `Preparación ${b}`, exact: true });
    await record.getByRole("button", { name: "Confirmar núcleos terminados", exact: true }).click();
    await record.getByLabel("Núcleos realmente terminados").fill("10");
    await record.getByLabel("Fecha real de preparación").fill("2026-11-10");
    await record.getByRole("button", { name: "Confirmar consumo y cerrar", exact: false }).click();
    await expect(record).toContainText("Cerrada definitivamente");
    const final = await state();
    assert.equal(JSON.stringify(final.microConfirmations[0]), history);
    assert.equal(final.microIssues.find((i) => i.micro_ingredient_id === ids[0]).quantity_hundredths, 300000);
    assert.equal(final.microIssues.find((i) => i.micro_ingredient_id === ids[2]).quantity_hundredths, 137000);
    assert.equal(final.microFormulas.length, 4);
    assert.equal(final.microAssignmentReversals.length, 1);
    assert.deepEqual(errors, []);
    await expect(page.locator(".toast")).toBeHidden({ timeout: 10000 });
    for (const width of [1440, 390])
      for (const theme of ["light", "dark"]) {
        await page.setViewportSize({ width, height: 1000 });
        await page.evaluate((theme) => (document.documentElement.dataset.theme = theme), theme);
        await record.screenshot({ path: join(f.evidence, `mixed-group-${width}-${theme}.png`) });
      }
    console.log("NQP25 evidencias", f.evidence);
  },
);
