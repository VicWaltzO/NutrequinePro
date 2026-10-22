import { test } from "node:test";
import assert from "node:assert/strict";
import { chromium, expect } from "playwright/test";
import { join } from "node:path";
import { localAppFixture } from "../helpers/local-app-server.mjs";
import { saleSummary } from "../../lib/domain.mjs";

test(
  "venta visual: tres tarjetas, altas junto a campos, 25 kg editables y snapshots conservados",
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
    await page.goto(server.baseURL);
    await page.getByLabel("Usuario", { exact: true }).fill("admin.local");
    await page.getByLabel("Contraseña", { exact: true }).fill(server.password);
    await page.getByRole("button", { name: "Entrar", exact: true }).click();
    await page.getByRole("button", { name: "Nueva venta", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Nueva venta", exact: true });
    for (const section of ["Datos del cliente", "Productos", "Pagos"])
      await expect(dialog.getByRole("region", { name: section, exact: true })).toBeAttached();
    await expect(dialog.getByLabel("Peso por saco", { exact: true })).toHaveValue("25");
    const runQuick = async (button, field, name, type) => {
      await dialog.getByRole("button", { name: button, exact: true }).click();
      await dialog.getByLabel(field, { exact: true }).fill(name);
      const response = page.waitForResponse(
        (result) => result.url().endsWith("/api/command") && result.request().postDataJSON()?.type === type,
      );
      await dialog
        .getByRole("button", {
          name: type === "CUSTOMER_SAVE" ? "Guardar cliente" : "Guardar sede",
          exact: true,
        })
        .click();
      assert.equal((await response).status(), 200);
      await expect(dialog.getByLabel(field, { exact: true })).toHaveCount(0);
    };
    await runQuick(
      "Crear cliente",
      "Nombre del nuevo cliente",
      "Cliente sintético del flujo visual",
      "CUSTOMER_SAVE",
    );
    await expect(dialog.getByLabel("Cliente", { exact: true })).not.toHaveValue("");
    await runQuick("Crear sede", "Nombre de sede", "Sede sintética del flujo visual", "SITE_SAVE");
    await expect(dialog.getByLabel("Sede destino", { exact: true })).not.toHaveValue("");
    await dialog.getByRole("button", { name: "Agregar Potripregnant", exact: true }).click();
    await expect(dialog.getByLabel("Producto", { exact: true })).toHaveValue("prod-1");
    await expect(dialog.getByLabel("Peso por saco", { exact: true })).toHaveValue("25");
    await dialog.getByLabel("Peso por saco", { exact: true }).fill("17.001");
    await dialog.getByLabel("Cantidad de sacos", { exact: true }).fill("2");
    await dialog.getByLabel("Precio por saco", { exact: true }).fill("73.01");
    await dialog.getByRole("button", { name: "Agregar Hi-Performance", exact: true }).click();
    await expect(dialog.getByLabel("Peso por saco", { exact: true }).nth(1)).toHaveValue("25");
    await dialog.getByRole("button", { name: "Agregar Potripregnant", exact: true }).click();
    await expect(dialog.getByLabel("Peso por saco", { exact: true })).toHaveCount(3);
    await expect(dialog.getByLabel("Peso por saco", { exact: true }).first()).toHaveValue("17.001");
    await dialog.getByRole("button", { name: "Quitar producto", exact: true }).last().click();
    await expect(dialog.getByLabel("Producto", { exact: true })).toHaveCount(2);
    await dialog.getByLabel("Entrega", { exact: true }).selectOption("future");
    await dialog.getByLabel("Condición", { exact: true }).selectOption("CASH");
    await dialog.getByLabel("Monto pagado S/", { exact: true }).fill("10.01");
    await dialog.getByLabel("Método de pago", { exact: true }).selectOption("TRANSFER");
    await dialog
      .getByLabel("Notas (opcional)", { exact: true })
      .fill("Operación sintética: peso editable y presentación visual.");
    const capture = async (name, section) => {
      if (section)
        await dialog
          .getByRole("region", { name: section === "Cliente" ? "Datos del cliente" : section, exact: true })
          .evaluate((element) => element.scrollIntoView({ block: "start", behavior: "instant" }));
      await page.screenshot({ path: join(server.evidence, name + ".png"), animations: "disabled" });
    };
    await capture("sale-desktop-client", "Cliente");
    await capture("sale-desktop-products", "Productos");
    await capture("sale-desktop-payments", "Pagos");
    await page.emulateMedia({ colorScheme: "dark" });
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await capture("sale-dark-products", "Productos");
    await page.emulateMedia({ colorScheme: "light" });
    await page.setViewportSize({ width: 390, height: 844 });
    assert.ok(
      await page.locator(".modal-body").evaluate((element) => element.scrollWidth <= element.clientWidth),
    );
    await capture("sale-mobile-client", "Cliente");
    await capture("sale-mobile-products", "Productos");
    await dialog
      .getByRole("button", { name: "Agregar Nutrelin Adulto", exact: true })
      .scrollIntoViewIfNeeded();
    assert.ok(await dialog.locator(".sale-product-picker").evaluate((element) => element.scrollLeft > 0));
    await capture("sale-mobile-payments", "Pagos");
    await page.locator(".modal-body").evaluate((element) => {
      element.scrollTop = element.scrollHeight;
    });
    const notes = await dialog.getByLabel("Notas (opcional)", { exact: true }).boundingBox();
    const footer = await dialog.locator(".form-footer").boundingBox();
    assert.ok(notes && footer && notes.y + notes.height <= footer.y);
    await capture("sale-mobile-final-fields");
    const saved = page.waitForResponse(
      (result) =>
        result.url().endsWith("/api/command") && result.request().postDataJSON()?.type === "SALE_SAVE",
    );
    await dialog.getByRole("button", { name: "Confirmar venta", exact: true }).click();
    const response = await saved;
    const body = await response.json();
    assert.equal(response.status(), 200, JSON.stringify(body));
    const summary = saleSummary(body.state, { id: body.result });
    assert.equal(summary.items[0].unit_weight_kg, 17001);
    assert.equal(summary.items[0].unit_price, 7301);
    assert.equal(summary.items[0].quantity, 2);
    assert.equal(summary.items[1].unit_weight_kg, 25000);
    assert.equal(summary.paid, 1001);
    await page.getByRole("button", { name: "Rectificar", exact: true }).click();
    const correction = page.getByRole("dialog", { name: "Rectificar venta", exact: true });
    await expect(correction.getByLabel("Peso por saco", { exact: true }).first()).toHaveValue("17.001");
    await expect(correction.getByLabel("Peso por saco", { exact: true }).nth(1)).toHaveValue("25");
    assert.deepEqual(errors, []);
    console.log("Sale form evidence: " + server.evidence);
  },
);
