import { test } from "node:test";
import assert from "node:assert/strict";
import { chromium, expect } from "playwright/test";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { localAppFixture } from "../helpers/local-app-server.mjs";
import { cashCreditScenario, productionPayload, salePayload } from "../helpers/regression-scenarios.mjs";

test(
  "interfaz corporativa: navegación, temas, foco, gesto táctil y captura responsive con operaciones reales",
  { timeout: 180000 },
  async (t) => {
    const server = await localAppFixture({ development: process.env.UI_REVIEW_DEV === "1" });
    t.after(server.stop);
    const browser = await chromium.launch({
      channel: process.env.REGRESSION_BROWSER_CHANNEL || undefined,
      headless: true,
    });
    t.after(() => browser.close());
    const context = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
      locale: "es-PE",
      colorScheme: "light",
      hasTouch: true,
    });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    const capture = (name) =>
      page.screenshot({ path: join(server.evidence, name + ".png"), fullPage: true, animations: "disabled" });
    await page.goto(server.baseURL);
    await expect(page.getByRole("heading", { name: "Iniciar sesión", exact: true })).toBeVisible();
    await capture("login-desktop");
    await page.setViewportSize({ width: 390, height: 844 });
    await capture("login-mobile");
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.getByLabel("Usuario", { exact: true }).fill("admin.local");
    await page.getByLabel("Contraseña", { exact: true }).fill(server.password);
    await page.getByRole("button", { name: "Entrar", exact: true }).click();
    await expect(page.locator(".sidebar-footer")).toBeVisible();
    await capture("empty-dashboard");

    const response = await context.request.post(server.baseURL + "/api/auth/login", {
      headers: { Origin: server.baseURL },
      data: { login: "admin.local", password: server.password },
    });
    const csrf = (await response.json()).csrf_token;
    const run = async (type, payload, request_id = randomUUID()) => {
      const result = await context.request.post(server.baseURL + "/api/command", {
        headers: { Origin: server.baseURL, "X-CSRF-Token": csrf },
        data: { type, payload, request_id },
      });
      const body = await result.json();
      assert.equal(result.status(), 200, JSON.stringify(body));
      return body.result;
    };
    const state = async () => (await (await context.request.get(server.baseURL + "/api/state")).json()).state;
    const scenario = await cashCreditScenario({ run, state });
    await run("PRODUCTION_SAVE", productionPayload({ confirm: false }));
    await run("SALE_SAVE", salePayload(scenario.customer, { deliver: false }));
    await page.reload();
    await expect(page.locator(".sidebar-footer")).toBeVisible();
    await capture("desktop");
    const sections = [
      ["Ventas", "sales"],
      ["Cobranza", "collections"],
      ["Producción", "productions"],
      ["Inventario", "inventory"],
      ["Clientes", "customers"],
      ["Gastos", "expenses"],
      ["Balance", "balance"],
      ["Configuración", "config"],
    ];
    for (const [name, route] of sections) {
      await page.locator("nav").getByRole("button", { name, exact: true }).click();
      await expect(page.getByRole("heading", { level: 1, name, exact: true })).toBeVisible();
      assert.equal(new URL(page.url()).hash, "#" + route);
      await capture(route);
    }
    await page.locator("nav").getByRole("button", { name: "Resumen", exact: true }).click();
    await page.getByRole("button", { name: "Nueva venta", exact: true }).click();
    await expect(page.getByRole("dialog", { name: "Nueva venta", exact: true })).toBeVisible();
    await capture("form-desktop-start");
    await page.locator(".modal-body").evaluate((element) => {
      element.scrollTop = element.scrollHeight;
    });
    await capture("form-desktop");
    await page.getByRole("button", { name: "Cerrar", exact: true }).click();
    await page.getByRole("button", { name: "Activar modo oscuro", exact: true }).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await capture("dark");
    await page.getByRole("button", { name: "Activar modo claro", exact: true }).click();
    for (const width of [1280, 768, 390, 320]) {
      await page.setViewportSize({ width, height: 844 });
      await expect
        .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
        .toBe(true);
      if (width !== 390) await capture("width-" + width);
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.locator(".sidebar")).toHaveAttribute("inert", "");
    await capture("mobile");
    const openMenu = () => page.getByRole("button", { name: "Abrir navegación", exact: true }).click();
    await openMenu();
    const drawer = page.getByRole("dialog", { name: "Navegación principal" });
    await expect(drawer).toBeVisible();
    await expect(drawer.getByRole("button", { name: "Cerrar navegación", exact: true })).toBeFocused();
    await capture("mobile-menu");
    await page.keyboard.press("Shift+Tab");
    await expect(drawer.getByRole("button", { name: "Configuración", exact: true })).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(drawer.getByRole("button", { name: "Cerrar navegación", exact: true })).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("button", { name: "Abrir navegación", exact: true })).toBeFocused();
    await openMenu();
    const cdp = await context.newCDPSession(page);
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: 240, y: 105 }] });
    await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: 105, y: 110 }] });
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await expect(page.locator(".sidebar")).toHaveAttribute("inert", "");
    await openMenu();
    await page
      .getByRole("button", { name: "Cerrar menú de navegación", exact: true })
      .click({ position: { x: 370, y: 200 } });
    await expect(page.locator(".sidebar")).toHaveAttribute("inert", "");
    await page.getByRole("button", { name: "Nueva venta", exact: true }).click();
    await capture("form-mobile-start");
    await page.locator(".modal-body").evaluate((element) => {
      element.scrollTop = element.scrollHeight;
    });
    const notes = await page.getByLabel("Notas (opcional)", { exact: true }).boundingBox();
    const actions = await page.locator(".form-footer").boundingBox();
    assert.ok(
      notes && actions && notes.y + notes.height <= actions.y,
      "El campo final debe quedar completamente por encima de las acciones.",
    );
    await capture("form-mobile");
    await page.getByRole("button", { name: "Cerrar", exact: true }).click();
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.getByRole("button", { name: "Nueva venta", exact: true }).click();
    assert.equal(
      await page.locator(".modal").evaluate((element) => getComputedStyle(element).animationName),
      "none",
    );
    await page.getByRole("button", { name: "Cerrar", exact: true }).click();
    assert.deepEqual(errors, []);
    console.log("Corporate interface evidence: " + server.evidence);
  },
);
