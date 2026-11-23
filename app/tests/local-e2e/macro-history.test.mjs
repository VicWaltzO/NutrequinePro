import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { chromium, expect } from "playwright/test";
import { localAppFixture } from "../helpers/local-app-server.mjs";

test(
  "A39 E2E: cuatro macros, versiones, historial, roles, teclado y cuatro vistas sin escrituras de consulta",
  { timeout: 300000 },
  async (t) => {
    const server = await localAppFixture();
    t.after(server.stop);
    console.log("NQP26-39 evidencias sintéticas: " + server.evidence);
    const browser = await chromium.launch({ channel: process.env.REGRESSION_BROWSER_CHANNEL || undefined });
    t.after(() => browser.close());
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: "es-PE" });
    const login = await context.request.post(server.baseURL + "/api/auth/login", {
      headers: { Origin: server.baseURL },
      data: { login: "admin.local", password: server.password },
    });
    assert.equal(login.status(), 200);
    const csrf = (await login.json()).csrf_token;
    const command = async (type, payload) => {
      const response = await context.request.post(server.baseURL + "/api/command", {
        headers: { Origin: server.baseURL, "X-CSRF-Token": csrf },
        data: { type, payload, request_id: randomUUID() },
      });
      assert.equal(response.status(), 200, await response.text());
      return (await response.json()).result;
    };
    const state = async () => (await (await context.request.get(server.baseURL + "/api/state")).json()).state;
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(server.baseURL + "/#productions/formulas");
    const active = page.getByRole("region", { name: "Fórmulas macro activas", exact: true });
    const history = page.locator(".formula-history");
    await expect(active.locator("details")).toHaveCount(4);
    await expect(history).not.toHaveAttribute("open", "");
    await command("PRODUCTION_SAVE", {
      production_date: "2026-11-20",
      products: [{ product_id: "prod-1", nuclei_count: 1 }],
      confirm: true,
    });
    const original = await state();
    const first = original.formulas.find((f) => f.product_id === "prod-1" && f.is_active);
    await command("FORMULA_SAVE", {
      product_id: first.product_id,
      valid_from: "2026-11-21",
      ingredients: original.formulaIngredients
        .filter((r) => r.formula_id === first.id)
        .map((r) => ({
          ingredient_id: r.ingredient_id,
          kg_per_nucleus: r.kg_per_nucleus / 1000 + 1,
        })),
    });
    await page.reload();
    await expect(active).toContainText("v2 · Activa");
    await expect(active).not.toContainText("Histórica");
    await active
      .locator("details")
      .filter({ hasText: "v2 · Activa" })
      .getByRole("button", { name: "Editar fórmula", exact: true })
      .click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toContainText("Se creará una nueva versión");
    await dialog.getByLabel("Válida desde").fill("2026-11-22");
    await dialog.getByRole("button", { name: "Crear versión de fórmula", exact: true }).click();
    await expect(dialog).not.toBeVisible();
    await expect(active).toContainText("v3 · Activa");
    const beforeRead = await state();
    for (const table of [
      "productions",
      "productionProducts",
      "productionIngredients",
      "productionCosts",
      "inventoryMovements",
    ])
      assert.deepEqual(beforeRead[table], original[table], table);
    let writes = 0;
    page.on("request", (request) => {
      if (request.method() !== "GET") writes++;
    });
    for (const width of [1440, 390])
      for (const theme of ["light", "dark"]) {
        await page.setViewportSize({ width, height: 1000 });
        await page.emulateMedia({ colorScheme: theme });
        await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
        await expect(active.locator("details")).toHaveCount(4);
        await page.keyboard.press("Tab");
        await history.locator(":scope > summary").focus();
        await expect(history.locator(":scope > summary")).toBeFocused();
        assert.notEqual(
          await history.locator(":scope > summary").evaluate((el) => getComputedStyle(el).outlineStyle),
          "none",
        );
        assert.ok(
          await history
            .locator(":scope > summary")
            .evaluate((el) => Number.parseFloat(getComputedStyle(el).outlineOffset) < 0),
          "El foco queda dentro del contenedor con overflow hidden",
        );
        if (!(await history.evaluate((el) => el.open))) await page.keyboard.press("Enter");
        const entries = history.locator("section > details");
        await expect(entries).toHaveCount(2);
        await expect(entries.nth(0).locator("summary")).toContainText("v2 · Histórica");
        await expect(entries.nth(1).locator("summary")).toContainText("v1 · Histórica");
        for (const entry of await entries.all()) {
          if (!(await entry.evaluate((el) => el.open))) await entry.locator("summary").click();
          await expect(entry).toContainText("Total fórmula:");
          await expect(entry).toContainText("hasta 2026-11-");
          await expect(entry.getByRole("button", { name: "Editar fórmula" })).toHaveCount(0);
        }
        await entries.first().getByRole("button", { name: "Insumo" }).click();
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
        await page.screenshot({
          path: join(server.evidence, `NQP26-39-${width}-${theme}.png`),
          fullPage: true,
          animations: "disabled",
        });
        await history.locator(":scope > summary").focus();
        await page.keyboard.press("Space");
        await expect(history).not.toHaveAttribute("open", "");
      }
    await page.reload();
    await expect(history).not.toHaveAttribute("open", "");
    assert.equal(writes, 0);
    assert.deepEqual(await state(), beforeRead);
    for (const role of ["OPERATOR", "VIEWER"]) {
      const id = "macro-" + role.toLowerCase(),
        password = randomUUID() + randomUUID();
      await command("USER_SAVE", { id, name: "Consulta sintética " + role, role, is_active: true });
      assert.equal(
        (
          await context.request.post(server.baseURL + "/api/auth/credentials", {
            headers: { Origin: server.baseURL, "X-CSRF-Token": csrf },
            data: { user_id: id, login: id, password },
          })
        ).status(),
        200,
      );
      const account = await browser.newContext();
      const response = await account.request.post(server.baseURL + "/api/auth/login", {
        headers: { Origin: server.baseURL },
        data: { login: id, password },
      });
      assert.equal(response.status(), 200);
      const session = await response.json();
      const read = await account.newPage();
      await read.goto(server.baseURL + "/#productions/formulas");
      await expect(
        read.getByRole("region", { name: "Fórmulas macro activas", exact: true }).locator("details"),
      ).toHaveCount(4);
      await expect(read.getByRole("button", { name: "Editar fórmula", exact: true })).toHaveCount(
        role === "VIEWER" ? 0 : 4,
      );
      await read.locator(".formula-history > summary").click();
      await expect(read.locator(".formula-history section > details")).toHaveCount(2);
      if (role === "VIEWER") {
        assert.equal(
          (
            await account.request.post(server.baseURL + "/api/command", {
              headers: { Origin: server.baseURL, "X-CSRF-Token": session.csrf_token },
              data: { type: "FORMULA_SAVE", payload: {}, request_id: randomUUID() },
            })
          ).status(),
          403,
        );
      }
      await account.close();
    }
    assert.deepEqual(errors, []);
  },
);
