import { test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { chromium, expect } from "playwright/test";
import { localAppFixture } from "../helpers/local-app-server.mjs";

test(
  "micros UI: vacío, catálogo, apertura, corrección, búsqueda, foco y temas responsivos",
  { timeout: 180000 },
  async (t) => {
    const fixture = await localAppFixture({ development: process.env.UI_REVIEW_DEV === "1" });
    t.after(fixture.stop);
    console.log("NQP26-20 evidencia: " + fixture.evidence);
    const browser = await chromium.launch({ channel: process.env.REGRESSION_BROWSER_CHANNEL || undefined });
    t.after(() => browser.close());
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: "es-PE" });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(fixture.baseURL);
    await page.getByLabel("Usuario", { exact: true }).fill("admin.local");
    await page.getByLabel("Contraseña", { exact: true }).fill(fixture.password);
    await page.getByRole("button", { name: "Entrar", exact: true }).click();
    await expect(page.locator(".sidebar-footer")).toBeVisible();
    await page.evaluate(() => (location.hash = "inventory/micros"));
    await expect(page.getByText("Aún no hay microinsumos.", { exact: false })).toBeVisible();
    const save = async () => {
      const response = page.waitForResponse((r) => r.url().endsWith("/api/command"));
      await page.getByRole("button", { name: /Guardar (microinsumo|saldo)/ }).click();
      const r = await response;
      assert.equal(r.status(), 200, await r.text());
    };
    await page.getByRole("button", { name: "Nuevo microinsumo", exact: true }).click();
    await expect(page.getByLabel("Nombre comercial exacto")).toBeFocused();
    await page.getByLabel("Nombre comercial exacto").fill("Micro sintético Z");
    await page.getByLabel("ID operativo", { exact: true }).fill("18");
    await save();
    await expect(page.getByRole("button", { name: "Nuevo microinsumo", exact: true })).toBeFocused();
    await page.getByRole("button", { name: "Registrar saldo de Micro sintético Z", exact: true }).click();
    await page.getByLabel("Cantidad neta (kg)").fill("0.05");
    await page.getByLabel("Fecha de corte", { exact: true }).fill("2026-10-30");
    await page.getByLabel("Medición", { exact: true }).selectOption("ESTIMATED");
    await page.getByLabel("Procedencia de la cantidad").fill("Pesaje sintético sin tara");
    await save();
    const row = page.getByRole("row").filter({ hasText: "Micro sintético Z" });
    await expect(row).toContainText("0.05");
    await expect(row).toContainText("Estimada");
    await expect(row).toContainText("Desconocido");
    await page.getByRole("button", { name: "Corregir saldo de Micro sintético Z", exact: true }).click();
    await page.getByLabel("Cantidad neta (kg)").fill("1.25");
    await page.getByLabel("Motivo de corrección").fill("Recuento sintético");
    await page.getByLabel("Medición", { exact: true }).selectOption("REAL");
    await save();
    await expect(row).toContainText("1.25");
    await expect(row).toContainText("Real");
    await page.reload();
    await expect(page.getByRole("row").filter({ hasText: "Micro sintético Z" })).toContainText("1.25");
    await page.getByLabel("Buscar microinsumo").fill("sin coincidencias");
    await expect(page.getByText("No hay coincidencias.", { exact: true })).toBeVisible();
    await page.getByLabel("Buscar microinsumo").fill("");
    for (const width of [1440, 390])
      for (const theme of ["light", "dark"]) {
        await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
        await page.evaluate((theme) => {
          localStorage.setItem("nutrequine-theme", theme);
          document.documentElement.dataset.theme = theme;
        }, theme);
        await page.screenshot({
          path: join(fixture.evidence, `micros-${width}-${theme}.png`),
          fullPage: true,
          animations: "disabled",
        });
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true);
        await page.getByRole("button", { name: "Corregir saldo de Micro sintético Z", exact: true }).click();
        await expect(page.getByLabel("Cantidad neta (kg)")).toBeFocused();
        await page.screenshot({
          path: join(fixture.evidence, `micros-form-${width}-${theme}.png`),
          fullPage: true,
          animations: "disabled",
        });
        await page.getByRole("button", { name: "Cancelar", exact: true }).click();
        await expect(
          page.getByRole("button", { name: "Corregir saldo de Micro sintético Z", exact: true }),
        ).toBeFocused();
      }
    assert.deepEqual(errors, []);
  },
);
