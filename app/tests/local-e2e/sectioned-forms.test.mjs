import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { chromium, expect } from "playwright/test";
import { localAppFixture } from "../helpers/local-app-server.mjs";
import { productionPayload, salePayload } from "../helpers/regression-scenarios.mjs";

test(
  "formularios por secciones: pago, gasto, producción, inventario y cierre con movimiento reducido",
  { timeout: 240000 },
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
    });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(server.baseURL);
    await page.getByLabel("Usuario", { exact: true }).fill("admin.local");
    await page.getByLabel("Contraseña", { exact: true }).fill(server.password);
    await page.getByRole("button", { name: "Entrar", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Resumen", exact: true, level: 1 })).toBeVisible();
    const login = await context.request.post(server.baseURL + "/api/auth/login", {
      headers: { Origin: server.baseURL },
      data: { login: "admin.local", password: server.password },
    });
    const csrf = (await login.json()).csrf_token;
    const run = async (type, payload) => {
      const response = await context.request.post(server.baseURL + "/api/command", {
        headers: { Origin: server.baseURL, "X-CSRF-Token": csrf },
        data: { type, payload, request_id: randomUUID() },
      });
      const body = await response.json();
      assert.equal(response.status(), 200, JSON.stringify(body));
      return body;
    };
    const customer = (await run("CUSTOMER_SAVE", { name: "Cliente sintético de formularios" })).result;
    const emptyCustomer = (await run("CUSTOMER_SAVE", { name: "Cliente sintético sin deuda" })).result;
    const sale = await run("SALE_SAVE", salePayload(customer, { deliver: false }));
    const saleCode = sale.state.sales.find((row) => row.id === sale.result).code;
    const draft = await run("PRODUCTION_SAVE", productionPayload({ confirm: false }));
    await page.reload();
    const dialog = page.locator("dialog.modal");
    const open = async (route, action) => {
      await page.goto(server.baseURL + "/#" + route);
      await page.getByRole("button", { name: action, exact: true }).click();
      await expect(dialog).toBeVisible();
      await dialog.evaluate(async (element) => {
        await Promise.all(
          element.getAnimations({ subtree: true }).map((animation) => animation.finished.catch(() => {})),
        );
      });
    };
    const close = async () => {
      await dialog.getByRole("button", { name: "Cerrar", exact: true }).click();
      await expect(dialog).not.toBeVisible();
    };
    const submit = async (name, type) => {
      const pending = page.waitForResponse(
        (response) =>
          response.url().endsWith("/api/command") && response.request().postDataJSON().type === type,
      );
      await dialog.getByRole("button", { name, exact: true }).click();
      const response = await pending;
      const body = await response.json();
      assert.equal(response.status(), 200, JSON.stringify(body));
      return body;
    };
    const sections = async (names) => {
      assert.deepEqual(await dialog.locator(".form-section-header h3").allTextContents(), names);
    };
    const capture = async (name, region) => {
      if (region)
        await dialog
          .getByRole("region", { name: region, exact: true })
          .evaluate((element) => element.scrollIntoView({ block: "start", behavior: "instant" }));
      await page.screenshot({ path: join(server.evidence, name + ".png"), animations: "disabled" });
    };
    const responsive = async (name, lastRegion, lastField) => {
      await page.locator(".modal-body").evaluate((element) => {
        element.scrollTop = 0;
      });
      await capture(name + "-desktop");
      if (name === "production") await capture(name + "-desktop-ingredients", "Insumos consolidados");
      if (name === "expense") await capture(name + "-desktop-link", "Vinculación");
      await capture(name + "-desktop-final", lastRegion);
      for (const width of [768, 390, 320]) {
        await page.setViewportSize({ width, height: 844 });
        assert.ok(
          await page.locator(".modal-body").evaluate((element) => element.scrollWidth <= element.clientWidth),
          name + " debe desplazar solo sus tablas",
        );
        if (width === 390) {
          await page.locator(".modal-body").evaluate((element) => {
            element.scrollTop = 0;
          });
          await capture(name + "-mobile");
          if (name === "production") await capture(name + "-mobile-ingredients", "Insumos consolidados");
          if (name === "expense") await capture(name + "-mobile-link", "Vinculación");
          await page.locator(".modal-body").evaluate((element) => {
            element.scrollTop = element.scrollHeight;
          });
          const field = await dialog.getByLabel(lastField, { exact: true }).boundingBox();
          const footer = await dialog.locator(".form-footer").boundingBox();
          assert.ok(
            field && footer && field.y + field.height <= footer.y,
            name + ": el último campo queda sobre las acciones",
          );
          await capture(name + "-mobile-final");
        }
      }
      await page.setViewportSize({ width: 1440, height: 1000 });
      await page.emulateMedia({ colorScheme: "dark" });
      await capture(name + "-dark", lastRegion);
      await page.emulateMedia({ colorScheme: "light" });
    };

    await open("collections", "Registrar pago");
    await sections(["Cliente", "Cobro", "Aplicar a ventas pendientes"]);
    await dialog.getByLabel("Cliente", { exact: true }).selectOption(emptyCustomer);
    await expect(dialog.getByRole("status")).toHaveText("Este cliente no tiene ventas pendientes de pago.");
    await dialog.getByLabel("Cliente", { exact: true }).selectOption(customer);
    await dialog.getByLabel("Monto recibido S/", { exact: true }).fill("20.01");
    await dialog.getByLabel("Método de pago", { exact: true }).selectOption("TRANSFER");
    await dialog.getByLabel("Aplicar a " + saleCode, { exact: true }).fill("10.01");
    await dialog.getByLabel("Notas", { exact: true }).fill("Cobro sintético con aplicación parcial.");
    await responsive("payment", "Aplicación a ventas", "Notas");
    const paid = await submit("Registrar pago", "PAYMENT_CREATE");
    assert.equal(paid.state.payments.find((row) => row.id === paid.result).total_amount, 2001);
    assert.equal(
      paid.state.paymentApplications.find((row) => row.payment_id === paid.result).applied_amount,
      1001,
    );
    await close();

    await open("expenses", "Registrar gasto");
    await sections(["Gasto", "Vinculación", "Notas"]);
    await dialog.getByLabel("Descripción", { exact: true }).fill("Flete sintético vinculado al lote");
    await dialog.getByLabel("Monto pagado S/", { exact: true }).fill("3.21");
    await dialog.getByLabel("Producción (opcional)", { exact: true }).selectOption(draft.result);
    await expect(dialog.getByRole("status")).toContainText("único costo de producción");
    await dialog.getByLabel("Notas", { exact: true }).fill("Una única vinculación, sin duplicar el costo.");
    await responsive("expense", "Notas del gasto", "Notas");
    const expense = await submit("Guardar", "EXPENSE_CREATE");
    const expenseRecord = expense.state.expenses.find((row) => row.id === expense.result);
    assert.equal(expenseRecord.amount, 321);
    assert.equal(expenseRecord.production_id, draft.result);
    assert.equal(
      expense.state.productionCosts.find((row) => row.id === expenseRecord.production_cost_id).amount,
      321,
    );
    await expect(dialog).not.toBeVisible();

    await open("productions", "Nueva producción");
    await sections(["Lote", "Productos", "Insumos consolidados", "Costos y registro"]);
    await expect(dialog.getByRole("status")).toContainText("Indica los núcleos");
    await dialog.getByLabel("Potripregnant · 40 sacos / núcleo", { exact: true }).fill("1");
    await expect(
      dialog.getByRole("region", { name: "Insumos consolidados", exact: true }).getByRole("table"),
    ).toBeVisible();
    await dialog.getByRole("button", { name: "Agregar costo adicional", exact: true }).click();
    await dialog.getByLabel("Descripción", { exact: true }).fill("Servicio sintético del lote");
    await dialog.getByLabel("Monto S/", { exact: true }).fill("7.03");
    await dialog.getByLabel("Guardar como", { exact: true }).selectOption("no");
    await responsive("production", "Costos y registro", "Guardar como");
    const production = await submit("Guardar lote a producir", "PRODUCTION_SAVE");
    const produced = production.state.productions.find((row) => row.id === production.result);
    assert.equal(produced.status, "DRAFT");
    assert.equal(produced.input_snapshot.products[0].nuclei_count, "1");
    assert.equal(produced.input_snapshot.costs[0].amount, "7.03");
    await close();

    await open("inventory", "Ajustar inventario");
    await sections(["Producto", "Movimiento", "Motivo"]);
    await dialog.getByLabel("Producto", { exact: true }).selectOption("prod-1");
    await dialog.getByLabel("Cantidad de sacos", { exact: true }).fill("2");
    await dialog.getByLabel("Peso total kg", { exact: true }).fill("50.001");
    await dialog.getByLabel("Motivo", { exact: true }).fill("Conteo físico sintético por secciones.");
    await responsive("inventory", "Motivo del ajuste", "Motivo");
    const adjusted = await submit("Guardar", "INVENTORY_ADJUST");
    const movement = adjusted.state.inventoryMovements.find((row) => row.id === adjusted.result);
    assert.equal(movement.quantity, 2);
    assert.equal(movement.weight_kg, 50001);
    await expect(dialog).not.toBeVisible();

    await open("inventory", "Ajustar inventario");
    const normalExit = await dialog.evaluate(
      (element) =>
        new Promise((resolve) => {
          const observer = new MutationObserver(() => {
            if (element.hasAttribute("data-closing")) {
              observer.disconnect();
              resolve({
                open: element.open,
                retained: !!element.querySelector("form"),
                inert: element.querySelector(".modal-body").inert,
                animation: element.getAnimations().some((animation) => animation.playState === "running"),
              });
            }
          });
          observer.observe(element, { attributes: true });
          element.querySelector('button[aria-label="Cerrar"]').click();
        }),
    );
    assert.deepEqual(normalExit, { open: true, retained: true, inert: true, animation: true });
    await expect(dialog).not.toBeVisible();
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.getByRole("button", { name: "Ajustar inventario", exact: true }).click();
    assert.equal(await dialog.evaluate((element) => getComputedStyle(element).animationName), "none");
    assert.equal(
      await dialog.locator("form").evaluate((element) => getComputedStyle(element).animationName),
      "none",
    );
    await page.keyboard.press("Escape");
    await expect(dialog).not.toBeVisible();
    await expect(page.getByRole("button", { name: "Ajustar inventario", exact: true })).toBeFocused();
    assert.deepEqual(errors, []);
    console.log("Sectioned forms evidence: " + server.evidence);
  },
);
