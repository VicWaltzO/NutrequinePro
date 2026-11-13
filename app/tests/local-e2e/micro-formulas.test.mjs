import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { chromium, expect } from "playwright/test";
import { localAppFixture } from "../helpers/local-app-server.mjs";
test(
  "microfórmulas UI: dos familias, borradores, activación, historial, recarga y responsive",
  { timeout: 180000 },
  async (t) => {
    const f = await localAppFixture();
    t.after(f.stop);
    console.log("NQP26-24 capturas", f.evidence);
    const browser = await chromium.launch({ channel: process.env.REGRESSION_BROWSER_CHANNEL || undefined });
    t.after(() => browser.close());
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: "es-PE" });
    const login = await context.request.post(f.baseURL + "/api/auth/login", {
      headers: { Origin: f.baseURL },
      data: { login: "admin.local", password: f.password },
    });
    assert.equal(login.status(), 200);
    const session = await login.json();
    const command = async (type, payload) => {
      const r = await context.request.post(f.baseURL + "/api/command", {
        headers: { Origin: f.baseURL, "X-CSRF-Token": session.csrf_token },
        data: { type, payload, request_id: randomUUID() },
      });
      assert.equal(r.status(), 200, await r.text());
      return (await r.json()).result;
    };
    const ids = [];
    for (const [i, name] of ["Zeta ficticia", "Alfa ficticia"].entries())
      ids.push(await command("MICRO_SAVE", { operational_id: i + 1, name, is_active: true }));
    const state = async () => (await (await context.request.get(f.baseURL + "/api/state")).json()).state;
    const before = await state();
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(f.baseURL + "/#inventory/micros");
    const area = page.locator(".micro-formulas");
    const pink = area.getByRole("region", { name: "Fórmula Rosado", exact: true });
    await expect(area.getByText("Sin fórmula activa.", { exact: false })).toHaveCount(2);
    const save = async (name) => {
      const pending = page.waitForResponse((r) => r.url().endsWith("/api/command"));
      await area.getByRole("button", { name, exact: true }).click();
      const r = await pending;
      assert.equal(r.status(), 200, await r.text());
    };
    await area.getByRole("button", { name: "Nueva versión Rosado", exact: true }).click();
    await expect(area.getByRole("button", { name: "Añadir dosis", exact: true })).toBeFocused();
    await area.getByRole("button", { name: "Añadir dosis", exact: true }).click();
    await area.getByLabel("Microinsumo 1", { exact: true }).selectOption(ids[0]);
    await area.getByLabel("Dosis 1 (kg/núcleo)", { exact: true }).fill("0.05");
    await area.getByRole("button", { name: "Añadir dosis", exact: true }).click();
    await area.getByLabel("Microinsumo 2", { exact: true }).selectOption(ids[1]);
    await area.getByLabel("Dosis 2 (kg/núcleo)", { exact: true }).fill("0.15");
    await page.keyboard.press("Tab");
    await expect(area.getByRole("button", { name: "Retirar microinsumo 2", exact: true })).toBeFocused();
    await save("Guardar borrador de fórmula");
    await expect(area.getByRole("button", { name: "Nueva versión Rosado", exact: true })).toBeFocused();
    await pink.locator("summary").filter({ hasText: "Borradores" }).click();
    await save("Activar Rosado versión 1");
    await expect(pink.getByText("Total: 200 g/núcleo", { exact: true })).toHaveCount(1);
    await area.getByRole("button", { name: "Nueva versión Rosado", exact: true }).click();
    await expect(area.getByLabel("Microinsumo 1", { exact: true })).toBeFocused();
    await area.getByLabel("Dosis 1 (kg/núcleo)", { exact: true }).fill("0.071");
    await save("Guardar borrador de fórmula");
    await save("Activar Rosado versión 2");
    await expect(pink.getByText("Total: 221 g/núcleo", { exact: true })).toBeVisible();
    const history = pink
      .locator("details")
      .filter({ has: page.locator("summary", { hasText: "Historial Rosado" }) });
    assert.equal(await history.getAttribute("open"), null);
    await history.locator("summary").click();
    await expect(history.getByText("Total: 200 g/núcleo", { exact: true })).toBeVisible();
    await command("MICRO_FORMULA_SAVE", {
      family: "VERDE_AMARILLO",
      expected_version: 0,
      lines: [{ micro_ingredient_id: ids[1], dose_kg: "0.033" }],
    });
    let s = await state();
    await command("MICRO_FORMULA_ACTIVATE", {
      family: "VERDE_AMARILLO",
      expected_version: 1,
      formula_id: s.microFormulas.find((x) => x.family === "VERDE_AMARILLO").id,
    });
    await page.reload();
    await expect(area.getByText("Total: 33 g/núcleo", { exact: true })).toBeVisible();
    for (const width of [1440, 390])
      for (const theme of ["light", "dark"]) {
        await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
        await page.evaluate((theme) => {
          localStorage.setItem("nutrequine-theme", theme);
          document.documentElement.dataset.theme = theme;
        }, theme);
        await area.scrollIntoViewIfNeeded();
        await page.screenshot({
          path: join(f.evidence, `micro-formulas-${width}-${theme}.png`),
          fullPage: true,
          animations: "disabled",
        });
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true);
        await area.getByRole("button", { name: "Nueva versión Rosado", exact: true }).click();
        await expect(area.getByLabel("Microinsumo 1", { exact: true })).toBeFocused();
        await page.screenshot({
          path: join(f.evidence, `micro-formulas-editor-${width}-${theme}.png`),
          fullPage: true,
          animations: "disabled",
        });
        await area.getByRole("button", { name: "Cancelar versión", exact: true }).click();
        await expect(area.getByRole("button", { name: "Nueva versión Rosado", exact: true })).toBeFocused();
      }
    s = await state();
    for (const table of [
      "microIngredients",
      "microOpenings",
      "microReceipts",
      "microLedgers",
      "expenses",
      "inventoryMovements",
      "formulas",
      "formulaIngredients",
      "productions",
      "productionProducts",
      "productionCosts",
    ])
      assert.deepEqual(s[table], before[table], table);
    for (const role of ["OPERATOR", "VIEWER"]) {
      const id = "formula-ui-" + role.toLowerCase(),
        password = randomUUID() + randomUUID();
      await command("USER_SAVE", { id, name: "Consulta sintética " + role, role, is_active: true });
      assert.equal(
        (
          await context.request.post(f.baseURL + "/api/auth/credentials", {
            headers: { Origin: f.baseURL, "X-CSRF-Token": session.csrf_token },
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
      const read = await account.newPage();
      await read.goto(f.baseURL + "/#inventory/micros");
      await expect(read.locator(".micro-formulas").getByRole("button")).toHaveCount(0);
      await expect(
        read.locator(".micro-formulas").getByText("Total: 221 g/núcleo", { exact: true }),
      ).toBeVisible();
      const h = read
        .getByRole("region", { name: "Fórmula Rosado", exact: true })
        .locator("details")
        .filter({ has: read.locator("summary", { hasText: "Historial Rosado" }) });
      await h.locator("summary").click();
      await expect(h.getByText("Total: 200 g/núcleo", { exact: true })).toBeVisible();
      await account.close();
    }
    assert.deepEqual(errors, []);
  },
);
