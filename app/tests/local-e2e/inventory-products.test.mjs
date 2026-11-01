import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { chromium, expect } from "playwright/test";
import { localAppFixture } from "../helpers/local-app-server.mjs";
import { stock, saleSummary } from "../../lib/domain.mjs";

const photo =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=";

test(
  "NQP15: catálogo único, enlaces, alta/edición, históricos, contratos y tres roles",
  { timeout: 240000 },
  async (t) => {
    const server = await localAppFixture();
    t.after(server.stop);
    console.log("NQP15 evidence: " + server.evidence);
    const browser = await chromium.launch({ channel: process.env.REGRESSION_BROWSER_CHANNEL || undefined });
    t.after(() => browser.close());
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: "es-PE" });
    const page = await context.newPage();
    const errors = [],
      external = [];
    await context.route("**/*", (route) => {
      if (new URL(route.request().url()).origin === server.baseURL) return route.continue();
      external.push(route.request().url());
      return route.abort();
    });
    page.on("pageerror", (e) => errors.push(e.message));
    const login = async (page, user, password) => {
      await page.goto(server.baseURL);
      await page.getByLabel("Usuario", { exact: true }).fill(user);
      await page.getByLabel("Contraseña", { exact: true }).fill(password);
      await page.getByRole("button", { name: "Entrar", exact: true }).click();
      await expect(page.locator(".sidebar-footer")).toBeAttached();
    };
    await login(page, "admin.local", server.password);
    const csrf = (await (await context.request.get(server.baseURL + "/api/auth/session")).json()).csrf_token;
    const state = async (account = context) =>
      (await (await account.request.get(server.baseURL + "/api/state")).json()).state;
    const run = async (type, payload, status = 200, account = context, token = csrf) => {
      const before = status === 200 ? null : await state(account);
      const response = await account.request.post(server.baseURL + "/api/command", {
        headers: { Origin: server.baseURL, "X-CSRF-Token": token },
        data: { type, payload, request_id: randomUUID() },
      });
      const body = await response.json();
      assert.equal(response.status(), status, JSON.stringify(body));
      if (before) assert.deepEqual(await state(account), before, "Rechazo sin cambios ni auditoría");
      return body;
    };
    const go = async (hash, target = page) => {
      await target.goto(server.baseURL + "/#" + hash);
      await expect(target.locator("main")).toBeVisible();
    };
    const catalog = async (target = page) => {
      await expect(target).toHaveURL(/#inventory\/products$/);
      await expect(target.getByRole("heading", { name: "Inventario", exact: true, level: 1 })).toBeVisible();
      await expect(target.locator("main .tabs").first().getByRole("button")).toHaveText([
        "Stock actual",
        "Movimientos",
        "Productos",
      ]);
      await expect(
        target.getByRole("heading", { name: "Parámetros comerciales", exact: true }),
      ).toBeVisible();
    };
    const row = (name) =>
      page.getByRole("row").filter({ has: page.getByRole("cell", { name, exact: true }) });
    for (const hash of ["products", "config/products", "inventory/products"]) {
      await go(hash);
      await catalog();
      await page.reload();
      await catalog();
      await expect(page.getByRole("button", { name: "Nuevo producto", exact: true })).toHaveCount(1);
      await expect(page.getByRole("button", { name: "Ajustar inventario", exact: true })).toHaveCount(0);
    }
    await go("sales");
    await page.evaluate(() => {
      location.hash = "config/products";
    });
    await catalog();
    await page.goBack();
    await expect(page).toHaveURL(/#sales$/);
    await page.goForward();
    await catalog();
    await go("config");
    await expect(page.locator("main .tabs").first().getByRole("button")).toHaveText([
      "Empresa y valores",
      "Usuarios",
      "Auditoría",
      "Apariencia",
    ]);
    await go("inventory");
    await expect(page.getByRole("button", { name: "Nuevo producto", exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Ajustar inventario", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Movimientos", exact: true }).click();
    await expect(page.getByRole("columnheader", { name: /^Origen:/ })).toBeVisible();
    await page.getByRole("button", { name: "Productos", exact: true }).click();
    await catalog();
    const original = await state();
    assert.equal(original.products.find((p) => p.id === "prod-4").standard_bag_weight_kg, 50000);
    await expect(row("BASE")).toContainText("saco · 50 kg");
    await expect(row("BASE")).toContainText("Consumo interno");
    await expect(row("Potripregnant")).toContainText("saco · 25 kg");
    assert.equal(await page.locator("main tbody tr").count(), original.products.length);
    const submit = async () => {
      const pending = page.waitForResponse(
        (r) => r.url().endsWith("/api/command") && r.request().postDataJSON()?.type === "PRODUCT_SAVE",
      );
      await page.getByRole("dialog").getByRole("button", { name: "Guardar", exact: true }).click();
      const response = await pending;
      const body = await response.json();
      assert.equal(response.status(), 200, JSON.stringify(body));
      await expect(page.getByRole("dialog")).toHaveCount(0);
      return body;
    };
    let bottle;
    for (const [unit, name, grams] of [
      ["BOTTLE", "CascoPlus+", 2200],
      ["UNIT", "Unidad sintética 15", 750],
    ]) {
      await page.getByRole("button", { name: "Nuevo producto", exact: true }).click();
      const dialog = page.getByRole("dialog");
      await dialog.getByLabel("Nombre", { exact: true }).fill(name);
      const units = dialog.getByLabel("Unidad de venta e inventario", { exact: true });
      assert.deepEqual(await units.locator("option").evaluateAll((nodes) => nodes.map((n) => n.value)), [
        "BOTTLE",
        "BAG",
        "UNIT",
      ]);
      await units.selectOption(unit);
      await expect(units).toHaveValue(unit);
      await dialog.getByLabel("Contenido neto por unidad (gramos)", { exact: true }).fill(String(grams));
      await expect(dialog.getByLabel("Ingreso al inventario", { exact: true })).toHaveValue("DIRECT_STOCK");
      if (unit === "BOTTLE")
        await expect(dialog.getByLabel("Política de peso", { exact: true })).toHaveValue("FIXED");
      await dialog
        .getByLabel("Precio base S/ por " + (unit === "BOTTLE" ? "frasco" : "unidad"), { exact: true })
        .fill("12.34");
      await dialog.getByLabel("Fotografía privada del producto", { exact: true }).setInputFiles({
        name: "synthetic.png",
        mimeType: "image/png",
        buffer: Buffer.from(photo.split(",")[1], "base64"),
      });
      // Wait for FileReader, so this also proves image persistence through the actual editor.
      await expect(
        dialog.getByRole("img", { name: "Presentación real de " + name, exact: true }),
      ).toBeVisible();
      const saved = await submit();
      assert.equal(saved.state.products.find((p) => p.id === saved.result).presentation_unit, unit);
      assert.equal(saved.state.products.find((p) => p.id === saved.result).image, photo);
      if (unit === "BOTTLE") bottle = saved.result;
    }
    const input = {
      name: "CascoPlus+",
      presentation_unit: "BOTTLE",
      unit_weight_grams: 2200,
      weight_policy: "FIXED",
      stock_entry_mode: "DIRECT_STOCK",
      default_sale_price: "12.34",
      is_sellable: true,
    };
    for (const invalid of [
      { ...input, name: "  CÁSCOPLUS+  " },
      { ...input, name: "Sin precio 15", default_sale_price: null },
      { ...input, name: "Imagen remota 15", image: "https://example.com/photo.png" },
      { ...input, name: "Imagen formato 15", image: "data:image/svg+xml;base64,AAAA" },
      { ...input, name: "Imagen grande 15", image: "data:image/png;base64," + "A".repeat(200004) },
    ])
      await run("PRODUCT_SAVE", invalid, 422);
    await run("INVENTORY_ADJUST", {
      product_id: bottle,
      direction: "IN",
      quantity: 5,
      date: "2026-11-01",
      reason: "Ingreso sintético",
    });
    const customer = (await run("CUSTOMER_SAVE", { name: "Cliente sintético NQP15" })).result;
    const sale = (
      await run("SALE_SAVE", {
        customer_id: customer,
        site_id: "site-1",
        sale_date: "2026-11-01",
        payment_condition: "CREDIT",
        confirm: true,
        items: [{ product_id: bottle, quantity: 2, unit_price: 12.34 }],
      })
    ).result;
    const before = await state();
    for (const invalid of [
      { unit_weight_grams: 2300 },
      { presentation_unit: "UNIT" },
      { stock_entry_mode: "NUCLEUS_PRODUCTION" },
    ])
      await run("PRODUCT_SAVE", { ...input, id: bottle, ...invalid }, 422);
    await page.reload();
    await catalog();
    await row("CascoPlus+").getByRole("button", { name: "Editar", exact: true }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByLabel("Unidad de venta e inventario", { exact: true })).toHaveValue("BOTTLE");
    await expect(dialog.getByLabel("Contenido neto por unidad (gramos)", { exact: true })).toHaveValue(
      "2200",
    );
    await dialog.getByLabel("Precio base S/ por frasco", { exact: true }).fill("22.22");
    await dialog.getByLabel("Habilitado para venta", { exact: true }).uncheck();
    await dialog.getByLabel("Activo", { exact: true }).uncheck();
    const edited = await submit();
    assert.equal(edited.result, bottle);
    const after = await state();
    const product = after.products.find((p) => p.id === bottle);
    assert.equal(product.default_sale_price, 2222);
    assert.equal(product.image, photo);
    assert.equal(product.is_active, false);
    assert.equal(product.is_sellable, false);
    for (const key of [
      "sales",
      "saleItems",
      "productions",
      "productionProducts",
      "inventoryMovements",
      "formulas",
      "formulaIngredients",
    ])
      assert.deepEqual(after[key], before[key], key + " conserva historial");
    assert.deepEqual(stock(after, bottle), stock(before, bottle));
    assert.deepEqual(saleSummary(after, { id: sale }), saleSummary(before, { id: sale }));
    assert.equal(saleSummary(after, { id: sale }).total, 2468);
    assert.ok(after.audit.length > before.audit.length);
    await expect(row("CascoPlus+")).toContainText("Inactivo");
    await expect(row("CascoPlus+")).toContainText("Consumo interno");
    // Sorting is an interaction, with no domain write and a three-step reset.
    const initialNames = await page.locator("main tbody tr td:first-child").allTextContents();
    const sort = page.getByRole("columnheader", { name: /^Producto:/ }).getByRole("button");
    await sort.focus();
    await page.keyboard.press("Enter");
    const sorted = await page.locator("main tbody tr td:first-child").allTextContents();
    assert.deepEqual(
      sorted,
      [...initialNames].sort(new Intl.Collator("es-PE", { sensitivity: "base", numeric: true }).compare),
    );
    await sort.press("Enter");
    assert.deepEqual(
      await page.locator("main tbody tr td:first-child").allTextContents(),
      [...sorted].reverse(),
    );
    await sort.press("Enter");
    assert.deepEqual(await page.locator("main tbody tr td:first-child").allTextContents(), initialNames);
    assert.deepEqual(await state(), after);
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
      for (const theme of ["light", "dark"]) {
        await page.emulateMedia({ colorScheme: theme });
        await page.evaluate(() => document.fonts.ready);
        await page.screenshot({
          path: join(server.evidence, `nqp15-catalog-${width}-${theme}.png`),
          animations: "disabled",
        });
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
        assert.equal(await page.locator("html").getAttribute("data-theme"), theme);
        await row("CascoPlus+").getByRole("button", { name: "Editar", exact: true }).click();
        await expect(dialog.getByLabel("Unidad de venta e inventario", { exact: true })).toHaveValue(
          "BOTTLE",
        );
        await expect(dialog.getByLabel("Contenido neto por unidad (gramos)", { exact: true })).toHaveValue(
          "2200",
        );
        await expect(dialog.getByLabel("Activo", { exact: true })).not.toBeChecked();
        assert.equal(
          await page.locator(".modal-body").evaluate((el) => el.scrollWidth <= el.clientWidth),
          true,
        );
        await page.screenshot({
          path: join(server.evidence, `nqp15-editor-${width}-${theme}.png`),
          animations: "disabled",
        });
        await dialog.getByRole("button", { name: "Cerrar", exact: true }).click();
        await expect(dialog).toHaveCount(0);
        await row("CascoPlus+").getByRole("button", { name: "Editar", exact: true }).scrollIntoViewIfNeeded();
        await page.screenshot({
          path: join(server.evidence, `nqp15-bottle-${width}-${theme}.png`),
          animations: "disabled",
        });
        await page.locator("main .table-wrap").evaluate((el) => {
          el.scrollLeft = 0;
        });
        await page.evaluate(() => scrollTo(0, 0));
      }
    }
    for (const role of ["OPERATOR", "VIEWER"]) {
      const id = "catalog-15-" + role,
        password = randomUUID() + randomUUID();
      await run("USER_SAVE", { id, name: role + " sintético", role });
      const provision = await context.request.post(server.baseURL + "/api/auth/credentials", {
        headers: { Origin: server.baseURL, "X-CSRF-Token": csrf },
        data: { user_id: id, login: id, password },
      });
      assert.equal(provision.status(), 200);
      const account = await browser.newContext({ viewport: { width: 390, height: 844 } });
      const reader = await account.newPage();
      await login(reader, id, password);
      await go("config/products", reader);
      await catalog(reader);
      await expect(reader.getByRole("button", { name: "Nuevo producto", exact: true })).toHaveCount(0);
      await expect(reader.locator("main").getByRole("button", { name: "Editar", exact: true })).toHaveCount(
        0,
      );
      assert.equal(await reader.locator("main tbody tr").count(), (await state(account)).products.length);
      const token = (await (await account.request.get(server.baseURL + "/api/auth/session")).json())
        .csrf_token;
      await run("PRODUCT_SAVE", { ...input, id: bottle }, 403, account, token);
      await run("PRODUCT_SAVE", { ...input, name: "Bypass 15" }, 403, account, token);
      await account.close();
    }
    assert.deepEqual(errors, []);
    assert.deepEqual(external, []);
  },
);
