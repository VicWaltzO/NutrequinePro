import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { chromium, expect } from "playwright/test";
import { localAppFixture } from "../helpers/local-app-server.mjs";
import { journeyFixture, substitute } from "../helpers/journey-fixture.mjs";
import { openSqliteDatabase } from "../../lib/adapters/node-sqlite.mjs";
import { createStore } from "../../lib/application-store.mjs";

test(
  "NQP29 E2E jornada3, respuesta perdida, referencias10+10 y4+6, temas/móvil",
  { timeout: 600000 },
  async (t) => {
    const f = await localAppFixture({ startupTimeoutMs: 180000 });
    t.after(f.stop);
    await f.stop();
    const synthetic = journeyFixture();
    const db = openSqliteDatabase(f.database),
      store = createStore(() => db, synthetic.options);
    const original = await store.loadState();
    synthetic.s.users.push(...original.users);
    await store.persistState(original, synthetic.s);
    const identity = { userId: "receipt-admin", displayName: "Administrador sintético" };
    const prepare = async (family) => {
      let s = await store.loadState();
      const result = await store.runCommand(
        {
          type: "MICRO_PREPARATION_CREATE",
          request_id: crypto.randomUUID(),
          payload: {
            family,
            formula_id: s.microFormulaHeads.find((h) => h.family === family).active_formula_id,
            nuclei: "10",
            date: "2026-11-09",
            expected_revision: s.revision,
          },
        },
        identity,
      );
      s = await store.loadState();
      await store.runCommand(
        {
          type: "MICRO_ASSIGN",
          request_id: crypto.randomUUID(),
          payload: { preparation_id: result.result, reason: "Ensayo", expected_revision: s.revision },
        },
        identity,
      );
      s = await store.loadState();
      await store.runCommand(
        {
          type: "MICRO_PREPARATION_CONFIRM",
          request_id: crypto.randomUUID(),
          payload: {
            preparation_id: result.result,
            nuclei: "10",
            date: "2026-11-12",
            expected_revision: s.revision,
          },
        },
        identity,
      );
      return result.result;
    };
    const roseA = await prepare("ROSADO");
    await store.runCommand(substitute(await store.loadState()), identity);
    const roseB = await prepare("ROSADO"),
      shared = await prepare("VERDE_AMARILLO");
    db.close();
    const config = JSON.parse(readFileSync(f.configFile, "utf8"));
    config.micro_preparation_policies = synthetic.options.microPreparationPolicies;
    config.micro_substitution_policies = synthetic.options.microSubstitutionPolicies;
    writeFileSync(f.configFile, JSON.stringify(config));
    await f.start();
    const browser = await chromium.launch({ channel: process.env.REGRESSION_BROWSER_CHANNEL || undefined });
    t.after(() => browser.close());
    const context = await browser.newContext({ viewport: { width: 1440, height: 1100 }, locale: "es-PE" });
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
      (await state()).inventoryMovements,
    ]);
    await page.goto(f.baseURL + "/#productions/journeys");
    await page.getByRole("button", { name: "Nueva jornada", exact: true }).click();
    const form = page.getByRole("form", { name: "Planificar jornada" });
    await form.getByLabel("Fecha de jornada").fill("2026-11-13");
    await form.getByLabel("Núcleos de Potripregnant", { exact: true }).fill("20");
    await form.getByLabel("Núcleos de Hi-Performance", { exact: true }).fill("4");
    await form.getByLabel("Núcleos de Nutrelin Adulto", { exact: true }).fill("6");
    let lost = false;
    await page.route("**/api/command", async (route) => {
      if (route.request().postDataJSON()?.type === "JOURNEY_CREATE" && !lost) {
        lost = true;
        const response = await route.fetch();
        assert.equal(response.status(), 200);
        await route.abort("failed");
      } else await route.continue();
    });
    await form.getByRole("button", { name: "Guardar jornada", exact: true }).click();
    await expect(page.getByRole("button", { name: "Reintentar solicitud", exact: true })).toBeVisible();
    await form.getByRole("button", { name: "Reintentar solicitud", exact: true }).click();
    await expect(page.getByRole("dialog")).not.toBeVisible();
    assert.equal((await state()).productionJourneys.length, 1);
    const bind = async (name, prep, nuclei) => {
      await page.getByRole("button", { name: `Vincular núcleos a ${name}`, exact: true }).click();
      const form = page.getByRole("form", { name: "Vincular preparación a producto" });
      await form.getByLabel("Preparación confirmada").selectOption(prep);
      await form.getByLabel("Núcleos a vincular").fill(nuclei);
      await form.getByRole("button", { name: "Vincular núcleos", exact: true }).click();
      await expect(page.getByRole("dialog")).not.toBeVisible();
    };
    await bind("Potripregnant", roseA, "10");
    await expect(
      page
        .getByRole("region", { name: "Potripregnant", exact: true })
        .getByText("Vinculación parcial", { exact: true }),
    ).toBeVisible();
    await bind("Potripregnant", roseB, "10");
    await bind("Hi-Performance", shared, "4");
    await bind("Nutrelin Adulto", shared, "6");
    assert.equal(
      JSON.stringify([
        (await state()).microIssues,
        (await state()).microConfirmations,
        (await state()).inventoryMovements,
      ]),
      history,
    );
    for (const width of [1440, 390])
      for (const theme of ["light", "dark"]) {
        await page.setViewportSize({ width, height: 1000 });
        await page.evaluate((theme) => {
          document.documentElement.dataset.theme = theme;
        }, theme);
        await page.screenshot({ path: join(f.evidence, `journey-${width}-${theme}.png`), fullPage: true });
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      }
    await page.getByLabel("Estado", { exact: true }).selectOption("PENDING");
    await expect(page.locator(".journey-list > details")).toHaveCount(0);
    await page.getByLabel("Estado", { exact: true }).selectOption("READY");
    await expect(page.locator(".journey-list > details")).toHaveCount(1);
    await page.getByLabel("Estado", { exact: true }).selectOption("");
    await page.reload();
    await expect(page.getByRole("button", { name: "Nueva jornada", exact: true })).toBeVisible();
    assert.equal((await state()).productionJourneyLinks.length, 4);
    assert.deepEqual(errors, []);
    console.log("NQP29_EVIDENCE", f.evidence);
  },
);
