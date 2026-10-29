import { test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { chromium, expect } from "playwright/test";
import { localAppFixture } from "../helpers/local-app-server.mjs";
import { coverageFixture } from "../helpers/coverage-fixtures.mjs";
import { diskFixture } from "../helpers/persistence-fixtures.mjs";
import { salePayload } from "../helpers/regression-scenarios.mjs";

test(
  "A08: shell ordinario inerte y franja sintética protegida, roles, navegación y recarga",
  { timeout: 180000 },
  async (t) => {
    const server = await localAppFixture();
    t.after(server.stop);
    console.log("NQP26-08 evidencias sintéticas: " + server.evidence);
    const browser = await chromium.launch({ channel: process.env.REGRESSION_BROWSER_CHANNEL || undefined });
    t.after(() => browser.close());
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, locale: "es-PE" });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(server.baseURL);
    await page.getByLabel("Usuario", { exact: true }).fill("admin.local");
    await page.getByLabel("Contraseña", { exact: true }).fill(server.password);
    await page.getByRole("button", { name: "Entrar", exact: true }).click();
    await expect(page.locator(".sidebar-footer")).toBeVisible();
    const request = page.context().request;
    const session = await (await request.get(server.baseURL + "/api/auth/session")).json();
    const run = async (type, payload) => {
      const response = await request.post(server.baseURL + "/api/command", {
        headers: { Origin: server.baseURL, "X-CSRF-Token": session.csrf_token },
        data: { type, payload, request_id: randomUUID() },
      });
      assert.equal(response.status(), 200, await response.text());
      return response.json();
    };
    const customer = (await run("CUSTOMER_SAVE", { name: "Cliente sintético alerta 08" })).result;
    await run(
      "SALE_SAVE",
      salePayload(customer, {
        items: [{ product_id: "prod-1", quantity: 7, unit_weight_kg: 25, unit_price: 73 }],
      }),
    );
    const banner = page.getByRole("region", { name: "Pedidos pendientes por stock", exact: true });
    await page.reload();
    await expect(page.locator(".sidebar-footer")).toBeVisible();
    await expect(banner).toHaveCount(0);
    await page.getByRole("button", { name: "Ventas", exact: true }).click();
    await expect(banner).toHaveCount(0);

    // Test-only browser transport fixture. The ordinary server remains untouched,
    // uses its separate legacy database, and cannot receive experimental commands.
    const f = await coverageFixture(t, diskFixture(t));
    await f.run("PRODUCT_SAVE", {
      id: "prod-1",
      name: "Potripregnant",
      stock_entry_mode: "NUCLEUS_PRODUCTION",
      unit_weight_grams: 25000,
      bags_per_nucleus: 40,
      commercial_weight_per_nucleus_kg: 1000,
      is_sellable: true,
      default_sale_price: 73,
    });
    await f.adjust(35);
    await f.sell(40);
    const bottle = await f.run("PRODUCT_SAVE", {
      name: "CascoPlus+",
      presentation_unit: "BOTTLE",
      weight_policy: "FIXED",
      stock_entry_mode: "DIRECT_STOCK",
      unit_weight_grams: 2200,
      is_sellable: true,
      default_sale_price: 99,
    });
    const bottleSale = await f.sell(2, "2026-11-02", {
      items: [{ product_id: bottle, quantity: 2, unit_weight_kg: 2.2, unit_price: 99 }],
    });
    let role = "ADMIN";
    let experimentalWrites = 0;
    await page.route("**/api/command", (route) => {
      experimentalWrites++;
      return route.abort();
    });
    await page.route("**/api/state", async (route) => {
      const state = await f.state();
      await route.fulfill({ json: { state, actor: { ...state.users[0], role } } });
    });
    await page.reload();
    await expect(banner).toContainText("2 pedidos pendientes por stock");
    await expect(banner).toContainText("5 sacos por producir");
    await expect(banner).toContainText("CascoPlus+: 2 frascos por abastecer");
    const status = banner.getByRole("status");
    await expect(status).toHaveAttribute("aria-live", "polite");
    await expect(status).toHaveAttribute("aria-atomic", "true");
    const summary = banner.locator("summary");
    await summary.focus();
    await page.keyboard.press("Enter");
    await expect(banner.locator("details")).toHaveAttribute("open", "");
    await expect(summary).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(banner.getByRole("button").first()).toBeFocused();
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
      for (const colorScheme of ["light", "dark"]) {
        await page.emulateMedia({ colorScheme });
        await expect(page.locator("html")).toHaveAttribute("data-theme", colorScheme);
        assert.ok(await page.locator("body").evaluate((el) => el.scrollWidth <= window.innerWidth));
        assert.equal(await banner.evaluate((el) => getComputedStyle(el).position), "static");
        await page.screenshot({
          path: join(server.evidence, `pending-stock-${width}-${colorScheme}.png`),
          fullPage: true,
          animations: "disabled",
        });
      }
    }
    await page.setViewportSize({ width: 1440, height: 1000 });
    for (role of ["ADMIN", "OPERATOR", "VIEWER"]) {
      await page.reload();
      await expect(banner).toContainText("5 sacos por producir");
      await page.getByRole("button", { name: "Inventario", exact: true }).click();
      await expect(banner).toHaveCount(1);
      await page.getByRole("button", { name: "Ventas", exact: true }).click();
      await expect(banner).toHaveCount(1);
      await summary.click();
      await banner
        .getByRole("button", { name: /^Ver venta/ })
        .first()
        .click();
      await expect(page.getByRole("dialog", { name: "Detalle de venta", exact: true })).toBeVisible();
      await page.getByRole("dialog").getByRole("button", { name: "Cerrar", exact: true }).click();
      await expect(banner).toHaveCount(1);
    }
    await f.adjust(10);
    await page.getByRole("button", { name: "Actualizar datos", exact: true }).click();
    await expect(banner).not.toContainText("sacos por producir");
    await expect(banner).toContainText("1 pedido pendiente por stock");
    await f.run("SALE_CANCEL", { id: bottleSale, reason: "Cierre sintético de faltantes" });
    await page.getByRole("button", { name: "Actualizar datos", exact: true }).click();
    await expect(banner).toHaveCount(0);
    await page.reload();
    await expect(page.locator(".sidebar-footer")).toBeVisible();
    await expect(banner).toHaveCount(0);
    assert.equal(experimentalWrites, 0);
    assert.deepEqual(errors, []);
  },
);
