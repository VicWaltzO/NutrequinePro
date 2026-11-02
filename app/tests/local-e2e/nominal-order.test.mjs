import { isNucleusProduct } from "../../shared/domain/presentation.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { writeFileSync } from "node:fs";
import { chromium, expect } from "playwright/test";
import { localAppFixture } from "../helpers/local-app-server.mjs";

const collation = new Intl.Collator("es-PE", { sensitivity: "base", numeric: true });
async function ordered(control, fixedLast = []) {
  await expect(control).toBeAttached();
  const rows = await control
    .locator("option")
    .evaluateAll((nodes) => nodes.map((n) => ({ id: n.value, name: n.textContent })));
  assert.ok(rows.length > 1, "varias opciones reales");
  const nominal = rows.filter((r) => r.id && !fixedLast.includes(r.id));
  for (let i = 1; i < nominal.length; i++)
    assert.ok(collation.compare(nominal[i - 1].name, nominal[i].name) <= 0, JSON.stringify(rows));
  if (fixedLast.length) assert.equal(rows.at(-1).id, fixedLast[0]);
  return rows;
}
test(
  "NQP14 Chrome: orden nominal, grupos, new:index, defaults fórmula, payload y recarga",
  { timeout: 240000 },
  async (t) => {
    const server = await localAppFixture();
    t.after(server.stop);
    const browser = await chromium.launch({ channel: process.env.REGRESSION_BROWSER_CHANNEL || undefined });
    t.after(() => browser.close());
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: "es-PE" });
    await context.route("**/*", (route) =>
      new URL(route.request().url()).origin === server.baseURL ? route.continue() : route.abort(),
    );
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(server.baseURL);
    await page.getByLabel("Usuario", { exact: true }).fill("admin.local");
    await page.getByLabel("Contraseña", { exact: true }).fill(server.password);
    await page.getByRole("button", { name: "Entrar", exact: true }).click();
    await expect(page.locator(".sidebar-footer")).toBeVisible();
    const request = context.request;
    const session = await (await request.get(server.baseURL + "/api/auth/session")).json();
    const state = async () => (await (await request.get(server.baseURL + "/api/state")).json()).state;
    const run = async (type, payload) => {
      const response = await request.post(server.baseURL + "/api/command", {
        headers: { Origin: server.baseURL, "X-CSRF-Token": session.csrf_token },
        data: { type, payload, request_id: randomUUID() },
      });
      const body = await response.json();
      assert.equal(response.status(), 200, JSON.stringify(body));
      return body.result;
    };
    const extraIngredient = await run("INGREDIENT_SAVE", {
      name: "Árbol insumo nuevo 14",
      current_price_per_kg: "1.25",
      is_active: true,
    });
    const initial = await state();
    const customers = [];
    for (const name of ["Zeta 14", "arbol 10", "Árbol 2"])
      customers.push(await run("CUSTOMER_SAVE", { name }));
    const sites = [];
    for (const name of ["Zeta sede 14", "Árbol sede 10", "Árbol sede 2", "A otra sede 14"])
      sites.push(await run("SITE_SAVE", { name }));
    await run("CUSTOMER_SITES_SAVE", {
      id: customers[0],
      site_ids: sites.slice(0, 3),
      default_site_id: sites[0],
    });
    await page.goto(server.baseURL + "/#sales");
    await page.reload();
    const dialog = page.getByRole("dialog");
    const close = async () => {
      await dialog.getByRole("button", { name: "Cerrar", exact: true }).click();
      await expect(dialog).toHaveCount(0);
    };
    const open = async (hash, name) => {
      await page.goto(server.baseURL + "/#" + hash);
      await page.getByRole("button", { name, exact: true }).click();
      await expect(dialog).toBeVisible();
    };
    const submit = async (button, type) => {
      const pending = page.waitForResponse(
        (r) => r.url().endsWith("/api/command") && r.request().postDataJSON()?.type === type,
      );
      await dialog.getByRole("button", { name: button, exact: true }).click();
      const response = await pending;
      const body = await response.json();
      assert.equal(response.status(), 200, JSON.stringify(body));
      return { body, payload: response.request().postDataJSON().payload };
    };
    await ordered(page.getByLabel("Cliente", { exact: true }));
    await ordered(page.getByLabel("Sede", { exact: true }));
    const snapshot = await state();
    await open("sales", "Nueva venta");
    const customer = dialog.getByLabel("Cliente", { exact: true });
    const site = dialog.getByLabel("Sede destino", { exact: true });
    await ordered(customer);
    await customer.selectOption(customers[0]);
    await expect(site).toHaveValue(sites[0]);
    assert.deepEqual(await site.locator("optgroup").evaluateAll((nodes) => nodes.map((n) => n.label)), [
      "Sedes del cliente",
      "Otras sedes",
    ]);
    for (const group of await site.locator("optgroup").all()) await ordered(group);
    await customer.focus();
    await page.keyboard.press("Home");
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Enter");
    await expect(customer).toBeFocused();
    await customer.selectOption(customers[0]);
    await site.selectOption(sites[3]);
    await expect(dialog.getByRole("radio", { name: "Solo esta venta", exact: true })).toBeChecked();
    await dialog.getByRole("radio", { name: "Vincular sede", exact: true }).focus();
    await page.keyboard.press("Space");
    const consent = dialog.getByLabel("Confirmo vincular esta sede al cliente al confirmar la venta", {
      exact: true,
    });
    await consent.check();
    assert.deepEqual(await state(), snapshot, "abrir/ordenar/elegir no escribe comandos ni auditoría");
    for (const width of [1440, 390])
      for (const theme of ["light", "dark"]) {
        await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
        await page.evaluate((theme) => {
          document.documentElement.dataset.theme = theme;
          localStorage.setItem("nutrequine-theme", theme);
        }, theme);
        await site.scrollIntoViewIfNeeded();
        await site.focus();
        await expect(site).toBeFocused();
        await page.screenshot({
          path: join(server.evidence, `nqp14-sites-${width}-${theme}.png`),
          animations: "disabled",
        });
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      }
    await page.setViewportSize({ width: 1440, height: 1000 });
    await dialog.getByRole("button", { name: "Crear nuevo cliente", exact: true }).click();
    await dialog.getByLabel("Nombre del nuevo cliente", { exact: true }).fill("A cliente rápido 14");
    const quick = await submit("Guardar cliente", "CUSTOMER_SAVE");
    await ordered(customer);
    await expect(customer).toHaveValue(quick.body.result);
    await customer.selectOption(customers[0]);
    await dialog.getByRole("button", { name: "Crear sede", exact: true }).click();
    await dialog.getByLabel("Nombre de sede", { exact: true }).fill("A sede rápida 14");
    const quickSite = await submit("Guardar sede", "SITE_SAVE");
    await expect(site).toHaveValue(quickSite.body.result);
    for (const group of await site.locator("optgroup").all()) await ordered(group);
    await expect(dialog.getByRole("radio", { name: "Solo esta venta", exact: true })).toBeChecked();
    // Explicit product selection keeps its ID through reordering; cards remain in source order.
    await dialog.getByRole("button", { name: "Agregar " + initial.products[0].name, exact: true }).click();
    const product = dialog.getByLabel("Producto", { exact: true }).first();
    await ordered(product);
    await expect(product).toHaveValue(initial.products[0].id);
    await dialog.getByLabel("Entrega", { exact: true }).selectOption("future");
    const sale = await submit("Confirmar venta", "SALE_SAVE");
    assert.equal(sale.payload.customer_id, customers[0]);
    assert.equal(sale.payload.site_id, quickSite.body.result);
    assert.equal(sale.payload.items[0].product_id, initial.products[0].id);
    assert.equal(sale.body.state.sales.find((x) => x.id === sale.body.result).site_id, quickSite.body.result);
    await close();
    // Rename catalog while selected, then refresh: selected ID survives and placement changes.
    await open("sales", "Nueva venta");
    await customer.selectOption(customers[0]);
    await run("CUSTOMER_SAVE", {
      ...(await state()).customers.find((x) => x.id === customers[0]),
      name: "A cliente renombrado 14",
    });
    await dialog.getByRole("button", { name: "Crear sede", exact: true }).click();
    await dialog.getByLabel("Nombre de sede", { exact: true }).fill("Sede de refresco catálogo 14");
    await submit("Guardar sede", "SITE_SAVE");
    await expect(customer).toHaveValue(customers[0]);
    await ordered(customer);
    await close();
    await open("customers", "Nuevo cliente");
    await dialog.getByLabel("Nombre", { exact: true }).fill("Cliente principal new index 14");
    for (const name of ["Z pendiente 14", "A pendiente 14", "M pendiente 14"]) {
      await dialog.getByRole("button", { name: "Crear sede nueva", exact: true }).click();
      await dialog.getByLabel("Nombre de la nueva sede", { exact: true }).fill(name);
      await dialog.getByRole("button", { name: "Preparar sede para guardar", exact: true }).click();
    }
    const principal = dialog.getByLabel("Sede principal", { exact: true });
    const pendingRows = await ordered(principal);
    assert.deepEqual(
      pendingRows.map((x) => x.id),
      ["new:1", "new:2", "new:0"],
    );
    await expect(principal).toHaveValue("new:0");
    await principal.selectOption("new:1");
    await dialog
      .getByRole("button", { name: "Retirar vínculo con Z pendiente 14 (nueva)", exact: true })
      .click();
    await expect(principal).toHaveValue("new:0");
    await dialog.getByRole("button", { name: "Vincular sede existente", exact: true }).click();
    const search = dialog.getByLabel("Buscar sede existente", { exact: true });
    await search.fill("sede");
    const labels = await dialog.locator(".customer-site-options label.check span").allTextContents();
    assert.ok(labels.length > 1);
    for (let i = 1; i < labels.length; i++) assert.ok(collation.compare(labels[i - 1], labels[i]) <= 0);
    const check = dialog.getByRole("checkbox", { name: "Árbol sede 2", exact: true });
    await check.focus();
    await page.keyboard.press("Space");
    await expect(check).toBeChecked();
    await expect(search).toHaveValue("sede");
    const savedCustomer = await submit("Guardar", "CUSTOMER_SAVE");
    assert.deepEqual(savedCustomer.payload.new_sites, ["A pendiente 14", "M pendiente 14"]);
    assert.equal(savedCustomer.payload.default_site_id, "new:0");
    assert.ok(savedCustomer.payload.site_ids.includes(sites[2]));
    const savedPrincipal = savedCustomer.body.state.sites.find((x) => x.name === "A pendiente 14").id;
    assert.equal(
      savedCustomer.body.state.customerSites.find(
        (x) => x.customer_id === savedCustomer.body.result && x.is_default,
      ).site_id,
      savedPrincipal,
    );
    // Formula uses original first product and ingredient defaults even though options are sorted.
    await page.goto(server.baseURL + "/#productions/formulas");
    await page.getByRole("button", { name: "Editar fórmula", exact: true }).first().click();
    const formulaProduct = dialog.getByLabel("Producto", { exact: true });
    await ordered(formulaProduct);
    const previousProduct = await formulaProduct.inputValue();
    const nextProduct = initial.products.find((p) => p.id !== previousProduct && isNucleusProduct(p));
    assert.ok(nextProduct);
    await formulaProduct.selectOption(nextProduct.id);
    const selectedProduct = await formulaProduct.inputValue();
    const activeFormula = initial.formulas.find((f) => f.product_id === selectedProduct && f.is_active);
    const expectedIngredients = initial.formulaIngredients.filter((x) => x.formula_id === activeFormula.id);
    const formulaRows = dialog.getByRole("combobox", { name: /^Insumo \d+$/ });
    assert.deepEqual(
      await formulaRows.evaluateAll((nodes) => nodes.map((node) => node.value)),
      expectedIngredients.map((x) => x.ingredient_id),
    );
    assert.deepEqual(
      await dialog
        .getByLabel("Kg por núcleo", { exact: true })
        .evaluateAll((nodes) => nodes.map((node) => Number(node.value))),
      expectedIngredients.map((x) => x.kg_per_nucleus / 1000),
    );
    await dialog.getByRole("button", { name: "Agregar insumo", exact: false }).click();
    const ingredient = dialog.getByRole("combobox", { name: /^Insumo \d+$/ }).last();
    await ordered(ingredient);
    await expect(ingredient).toHaveValue(initial.ingredients[0].id);
    await ingredient.selectOption(extraIngredient);
    const amount = dialog.getByLabel("Kg por núcleo", { exact: true }).last();
    await amount.fill("0.125");
    await ingredient.focus();
    await page.keyboard.press("Tab");
    await expect(amount).toBeFocused();
    const formula = await submit("Crear versión de fórmula", "FORMULA_SAVE");
    assert.equal(formula.payload.product_id, selectedProduct);
    assert.equal(formula.payload.ingredients.at(-1).ingredient_id, extraIngredient);
    assert.equal(
      formula.body.state.formulas.find((x) => x.id === formula.body.result).product_id,
      selectedProduct,
    );
    // Read/refresh after persisted payloads preserves every domain field.
    await expect(dialog).toHaveCount(0);
    const persisted = await state();
    await page.reload();
    assert.deepEqual(await state(), persisted);
    writeFileSync(
      join(server.evidence, "nqp14-result.json"),
      JSON.stringify(
        {
          checks: [
            "visible-label-order",
            "natural-numbers",
            "groups",
            "principal-default",
            "keyboard-focus",
            "desktop-mobile-themes",
            "quick-create",
            "rename-refresh",
            "new-index-removal",
            "server-payload",
            "formula-defaults",
            "reload-domain-equality",
          ],
          errors,
        },
        null,
        2,
      ),
    );
    assert.deepEqual(errors, []);
    console.log("NQP14 evidence: " + server.evidence);
  },
);

test(
  "NQP14 Chrome: ADMIN/OPERATOR/VIEWER, consumidores nominales y secuencias negativas",
  { timeout: 240000 },
  async (t) => {
    const server = await localAppFixture();
    t.after(server.stop);
    const browser = await chromium.launch({ channel: process.env.REGRESSION_BROWSER_CHANNEL || undefined });
    t.after(() => browser.close());
    const admin = await browser.newContext();
    const login = await admin.request.post(server.baseURL + "/api/auth/login", {
      headers: { Origin: server.baseURL },
      data: { login: "admin.local", password: server.password },
    });
    const csrf = (await login.json()).csrf_token;
    const command = async (type, payload) => {
      const response = await admin.request.post(server.baseURL + "/api/command", {
        headers: { Origin: server.baseURL, "X-CSRF-Token": csrf },
        data: { type, payload, request_id: randomUUID() },
      });
      assert.equal(response.status(), 200, await response.text());
      return (await response.json()).result;
    };
    for (const name of ["Z role 14", "A role 14"]) await command("CUSTOMER_SAVE", { name });
    for (const role of ["ADMIN", "OPERATOR", "VIEWER"]) {
      const user = "nominal-" + role;
      const password = randomUUID() + randomUUID();
      await command("USER_SAVE", { id: user, name: role + " nominal sintético", role });
      const provision = await admin.request.post(server.baseURL + "/api/auth/credentials", {
        headers: { Origin: server.baseURL, "X-CSRF-Token": csrf },
        data: { user_id: user, login: user, password },
      });
      assert.equal(provision.status(), 200);
      const account = await browser.newContext({
        viewport: { width: role === "VIEWER" ? 390 : 1440, height: role === "VIEWER" ? 844 : 1000 },
        locale: "es-PE",
      });
      const page = await account.newPage();
      await page.goto(server.baseURL);
      await page.getByLabel("Usuario", { exact: true }).fill(user);
      await page.getByLabel("Contraseña", { exact: true }).fill(password);
      await page.getByRole("button", { name: "Entrar", exact: true }).click();
      await expect(page.locator(".sidebar-footer")).toBeAttached();
      const go = async (hash) => {
        await page.goto(server.baseURL + "/#" + hash);
        await expect(page.locator("main")).toBeVisible();
      };
      const dialog = page.getByRole("dialog");
      const open = async (hash, button) => {
        await go(hash);
        await page.getByRole("button", { name: button, exact: true }).click();
        await expect(dialog).toBeVisible();
      };
      const close = async () => {
        await dialog.getByRole("button", { name: "Cerrar", exact: true }).click();
        await expect(dialog).toHaveCount(0);
      };
      const values = (control) =>
        control.locator("option").evaluateAll((nodes) => nodes.map((n) => n.value).filter(Boolean));
      await go("sales");
      await ordered(page.getByLabel("Cliente", { exact: true }));
      await ordered(page.getByLabel("Sede", { exact: true }));
      assert.deepEqual(await values(page.getByLabel("Estado", { exact: true })), [
        "DRAFT",
        "CONFIRMED",
        "RECTIFIED",
        "PENDING",
        "PARTIAL",
        "PAID",
        "DELIVERED",
        "CANCELLED",
      ]);
      await go("collections");
      await ordered(page.getByLabel("Cliente", { exact: true }));
      await ordered(page.getByLabel("Sede", { exact: true }));
      assert.deepEqual(await values(page.getByLabel("Estado", { exact: true })), ["PENDING", "PARTIAL"]);
      if (role === "VIEWER") {
        await go("sales");
        await expect(page.getByRole("button", { name: "Nueva venta", exact: true })).toHaveCount(0);
        await page.screenshot({
          path: join(server.evidence, "nqp14-viewer-390.png"),
          animations: "disabled",
        });
        await account.close();
        continue;
      }
      await open("sales", "Nueva venta");
      const delivery = dialog.getByLabel("Entrega", { exact: true });
      assert.deepEqual(await values(delivery), ["immediate", "future", "planned"]);
      await delivery.selectOption("future");
      await expect(delivery).toHaveValue("future");
      const condition = dialog.getByLabel("Condición", { exact: true });
      assert.deepEqual(await values(condition), ["CREDIT", "CASH"]);
      await condition.selectOption("CASH");
      await dialog.getByLabel("Monto pagado S/", { exact: true }).fill("1.00");
      await ordered(dialog.getByLabel("Método de pago", { exact: true }), ["OTHER"]);
      await dialog.getByLabel("Método de pago", { exact: true }).selectOption("OTHER");
      await expect(dialog.getByLabel("Otro método", { exact: true })).toBeVisible();
      await close();
      await open("collections", "Registrar pago");
      await ordered(dialog.getByLabel("Cliente", { exact: true }));
      await ordered(dialog.getByLabel("Método de pago", { exact: true }), ["OTHER"]);
      await close();
      await open("expenses", "Registrar gasto");
      for (const label of ["Categoría", "Sede (opcional)", "Insumo (opcional)"])
        await ordered(dialog.getByLabel(label, { exact: true }));
      await close();
      await open("productions", "Nueva producción");
      const confirmation = dialog.getByLabel("Guardar como", { exact: true });
      assert.deepEqual(await values(confirmation), ["no", "yes"]);
      await expect(confirmation).toHaveValue("no");
      await dialog.getByRole("button", { name: "Agregar costo adicional", exact: true }).click();
      await ordered(dialog.getByLabel("Concepto", { exact: true }), ["OTHER"]);
      await dialog.getByLabel("Concepto", { exact: true }).selectOption("INGREDIENT_EXTRA");
      await ordered(dialog.getByLabel("Insumo", { exact: true }));
      await close();
      if (role === "ADMIN") {
        await open("inventory", "Ajustar inventario");
        await ordered(dialog.getByLabel("Producto", { exact: true }));
        const movement = dialog.getByLabel("Movimiento", { exact: true });
        assert.deepEqual(await values(movement), ["IN", "OUT"]);
        await movement.selectOption("OUT");
        await expect(movement).toHaveValue("OUT");
        await close();
      } else {
        await go("inventory");
        await expect(page.getByRole("button", { name: "Ajustar inventario", exact: true })).toHaveCount(0);
      }
      if (role === "ADMIN") {
        await open("config/products", "Nuevo producto");
        const unit = dialog.getByLabel("Unidad de venta e inventario", { exact: true });
        await ordered(unit);
        await unit.selectOption("BOTTLE");
        assert.deepEqual(await values(dialog.getByLabel("Política de peso", { exact: true })), ["FIXED"]);
        assert.deepEqual(await values(dialog.getByLabel("Ingreso al inventario", { exact: true })), [
          "DIRECT_STOCK",
        ]);
        await unit.selectOption("BAG");
        assert.deepEqual(await values(dialog.getByLabel("Política de peso", { exact: true })), [
          "FIXED",
          "VARIABLE",
        ]);
        assert.deepEqual(await values(dialog.getByLabel("Ingreso al inventario", { exact: true })), [
          "DIRECT_STOCK",
          "NUCLEUS_PRODUCTION",
        ]);
        await close();
        await open("config", "Editar configuración");
        await ordered(dialog.getByLabel("Método de pago predeterminado", { exact: true }));
        await ordered(dialog.getByLabel("Categoría predeterminada", { exact: true }));
        assert.deepEqual(
          await values(dialog.getByLabel("Condición de pago en nuevas ventas", { exact: true })),
          ["CREDIT", "CASH"],
        );
        await close();
        await open("config/users", "Agregar usuario");
        const roles = dialog.getByLabel("Rol", { exact: true });
        assert.deepEqual(await values(roles), ["ADMIN", "OPERATOR", "VIEWER"]);
        await expect(roles).toHaveValue("VIEWER");
        await roles.selectOption("OPERATOR");
        await expect(roles).toHaveValue("OPERATOR");
        await close();
      }
      await account.close();
    }
    console.log("NQP14 roles evidence: " + server.evidence);
  },
);
