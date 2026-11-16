import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { chromium, expect } from "playwright/test";
import { localAppFixture } from "../helpers/local-app-server.mjs";
import { coverageFixture } from "../helpers/coverage-fixtures.mjs";
import { diskFixture } from "../helpers/persistence-fixtures.mjs";

test(
  "A38: ocho micros, coexistencia, persistencia, carreras, resolución y accesibilidad en cuatro vistas",
  { timeout: 240000 },
  async (t) => {
    const server = await localAppFixture();
    t.after(server.stop);
    console.log("NQP26-38 evidencias sintéticas: " + server.evidence);
    const browser = await chromium.launch({ channel: process.env.REGRESSION_BROWSER_CHANNEL || undefined });
    t.after(() => browser.close());
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: "es-PE" });
    const login = async () => {
      const response = await context.request.post(server.baseURL + "/api/auth/login", {
        headers: { Origin: server.baseURL },
        data: { login: "admin.local", password: server.password },
      });
      assert.equal(response.status(), 200);
      return (await response.json()).csrf_token;
    };
    let csrf = await login();
    const command = async (type, payload) => {
      const response = await context.request.post(server.baseURL + "/api/command", {
        headers: { Origin: server.baseURL, "X-CSRF-Token": csrf },
        data: { type, payload, request_id: randomUUID() },
      });
      assert.equal(response.status(), 200, await response.text());
      return (await response.json()).result;
    };
    const state = async () => (await (await context.request.get(server.baseURL + "/api/state")).json()).state;
    const ids = [];
    for (let i = 1; i <= 8; i++) {
      const id = await command("MICRO_SAVE", {
        operational_id: i,
        name: `Ingrediente sintético ${i}`,
        is_active: true,
      });
      ids.push(id);
      await command("MICRO_OPEN", {
        micro_ingredient_id: id,
        quantity_kg: "0.005",
        cutoff_date: "2026-10-30",
        measurement: "REAL",
        source: "Prueba sintética",
        unit_cost: "1",
        notes: "",
      });
    }
    const policies = [];
    for (const family of ["ROSADO", "VERDE_AMARILLO"]) {
      const formula_id = await command("MICRO_FORMULA_SAVE", {
        family,
        expected_version: 0,
        lines: ids.map((id) => ({ micro_ingredient_id: id, dose_kg: "0.001" })),
      });
      await command("MICRO_FORMULA_ACTIVATE", { family, expected_version: 1, formula_id });
      policies.push({
        family,
        formula_id,
        reference: "Autorización exclusivamente sintética A38",
        lines: ids.map((id) => ({ micro_ingredient_id: id, dose_grams: 1 })),
      });
    }
    await server.stop();
    const config = JSON.parse(readFileSync(server.configFile, "utf8"));
    config.micro_preparation_policies = policies;
    writeFileSync(server.configFile, JSON.stringify(config));
    await server.start();
    csrf = await login();
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    const micro = page.getByRole("region", { name: "Alertas globales de microinsumos", exact: true });
    const sales = page.getByRole("region", { name: "Pedidos pendientes por stock", exact: true });
    await page.goto(server.baseURL);
    await expect(micro).toContainText("8 microinsumos requieren reposición");
    await expect(micro).toHaveCount(1);
    await expect(sales).toHaveCount(0);
    await micro.locator("summary").focus();
    await page.keyboard.press("Enter");
    await expect(micro.getByRole("listitem")).toHaveCount(8);
    await expect(micro.getByText("Faltan 15 g para el mínimo preventivo.", { exact: true })).toHaveCount(8);
    await expect(micro.locator("summary")).toBeFocused();
    await page.getByRole("button", { name: "Ventas", exact: true }).click();
    await expect(micro).toContainText("8 microinsumos requieren reposición");
    await expect(micro.locator("details")).toHaveAttribute("open", "");
    await page.reload();
    await expect(micro).toContainText("8 microinsumos requieren reposición");
    // Sales coverage is a separate SQLite test fixture, exposed only through intercepted GET.
    // No experimental commercial command reaches the ordinary server.
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
    await f.sell(7);
    await page.route("**/api/state", async (route) => {
      const response = await route.fetch();
      const body = await response.json();
      const commercial = await f.state();
      body.state = {
        ...body.state,
        products: commercial.products,
        sales: commercial.sales,
        saleItems: commercial.saleItems,
      };
      await route.fulfill({ json: body });
    });
    const refresh = () => page.getByRole("button", { name: "Actualizar datos", exact: true }).click();
    await refresh();
    await expect(sales).toContainText("1 pedido pendiente por stock");
    await expect(sales).toContainText("7 sacos por producir");
    await f.sell(4);
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
    await refresh();
    await expect(sales).toContainText("3 pedidos pendientes por stock");
    await expect(sales).toContainText("11 sacos por producir");
    await expect(sales).toContainText("CascoPlus+: 2 frascos por abastecer");
    await expect(micro).toContainText("8 microinsumos requieren reposición");
    await sales.locator("summary").click();
    await expect(micro.locator("details")).not.toHaveAttribute("open", "");
    await micro.locator("summary").click();
    await expect(sales.locator("details")).toHaveAttribute("open", "");
    for (const width of [1440, 390])
      for (const theme of ["light", "dark"]) {
        await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
        await page.emulateMedia({ colorScheme: theme });
        await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
        const a = await sales.boundingBox(),
          b = await micro.boundingBox();
        assert.ok(b.y >= a.y + a.height);
        for (const region of [micro, sales]) {
          assert.equal(await region.evaluate((el) => getComputedStyle(el).position), "static");
          assert.ok(
            await region.evaluate((el) => {
              const luminance = (color) => {
                const channels = color
                  .match(/[\d.]+/g)
                  .slice(0, 3)
                  .map(Number)
                  .map((n) => n / 255)
                  .map((n) => (n <= 0.04045 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4));
                return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
              };
              const style = getComputedStyle(el),
                x = luminance(style.color),
                y = luminance(style.backgroundColor);
              return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05) >= 4.5;
            }),
          );
          await page.keyboard.press("Tab");
          await region.locator("summary").focus();
          await expect(region.locator("summary")).toBeFocused();
          assert.notEqual(
            await region.locator("summary").evaluate((el) => getComputedStyle(el).outlineStyle),
            "none",
          );
          await page.keyboard.press("Enter");
          await page.keyboard.press("Enter");
        }
        await page.screenshot({
          path: join(server.evidence, `NQP26-38-${width}-${theme}.png`),
          fullPage: true,
          animations: "disabled",
        });
      }
    await page.setViewportSize({ width: 1440, height: 1000 });
    // Same-revision refresh must still consult the GET. Failed reads must not show stale counts.
    await page.route("**/api/micro-preparations", (route) =>
      route.fulfill({ status: 503, json: { error: "Fallo sintético" } }),
    );
    await refresh();
    await expect(micro).toContainText("Avisos de microinsumos no disponibles");
    await expect(micro).not.toContainText("8 microinsumos requieren");
    await page.unroute("**/api/micro-preparations");
    await refresh();
    await expect(micro).toContainText("8 microinsumos requieren reposición");
    await page.route("**/api/micro-preparations", async (route) => {
      const response = await route.fetch();
      const body = await response.json();
      body.revision--;
      await route.fulfill({ json: body });
    });
    await refresh();
    await expect(micro).toContainText("Avisos de microinsumos no disponibles");
    await page.unroute("**/api/micro-preparations");
    // Delayed old evaluation must never overwrite a later resolved one.
    let release;
    const gate = new Promise((resolve) => {
      release = resolve;
    });
    let delayed;
    const started = new Promise((resolve) => {
      delayed = resolve;
    });
    let first = true;
    await page.route("**/api/micro-preparations", async (route) => {
      const response = await route.fetch();
      if (first) {
        first = false;
        delayed();
        await gate;
      }
      await route.fulfill({ response }).catch(() => {});
    });
    await refresh();
    await started;
    await command("MICRO_RECEIPT_SAVE", {
      status: "CONFIRMED",
      supplier: "Proveedor sintético",
      reference: "A38",
      source: "Ensayo sintético",
      document_date: "2026-11-16",
      total: "8",
      discount: "0",
      currency: "PEN",
      payment_method: "CASH",
      reviewed_expenses: true,
      receive_confirmed: true,
      lines: ids.map((id) => ({
        micro_ingredient_id: id,
        quantity_kg: "1",
        unit_price: "1",
        amount: "1",
        discount: "0",
      })),
    });
    await refresh();
    await expect(micro).toHaveCount(0);
    release();
    await page.unroute("**/api/micro-preparations");
    await expect(micro).toHaveCount(0);
    await expect(sales).toHaveCount(1);
    await f.adjust(11);
    await f.run("SALE_CANCEL", { id: bottleSale, reason: "Resolución sintética" });
    await refresh();
    await expect(sales).toHaveCount(0);
    await page.reload();
    await expect(page.locator(".sidebar-footer")).toBeVisible();
    await expect(micro).toHaveCount(0);
    await expect(sales).toHaveCount(0);
    assert.deepEqual(errors, []);
    assert.equal((await state()).microValuationEvents.length, 8);
  },
);
