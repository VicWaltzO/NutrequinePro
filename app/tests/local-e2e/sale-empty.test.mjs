import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { chromium, expect } from "playwright/test";
import { localAppFixture } from "../helpers/local-app-server.mjs";

test("NQP26-03: vacío editable, recuperación y rectificación atómica", { timeout: 180000 }, async (t) => {
  const server = await localAppFixture({ development: process.env.UI_REVIEW_DEV === "1" });
  t.after(server.stop);
  console.log("NQP26-03 evidencias: " + server.evidence);
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
  const state = async () => (await (await request.get(server.baseURL + "/api/state")).json()).state;
  const run = async (type, payload, status = 200) => {
    const response = await request.post(server.baseURL + "/api/command", {
      headers: { Origin: server.baseURL, "X-CSRF-Token": session.csrf_token },
      data: { type, payload, request_id: randomUUID() },
    });
    const body = await response.json();
    assert.equal(response.status(), status, JSON.stringify(body));
    return body;
  };
  const customer = (await run("CUSTOMER_SAVE", { name: "Cliente sintético vacío", site_ids: ["site-1"] }))
    .result;
  const bottle = (
    await run("PRODUCT_SAVE", {
      name: "CascoPlus+",
      category: "Suplemento",
      presentation_unit: "BOTTLE",
      weight_policy: "FIXED",
      unit_weight_grams: 2200,
      stock_entry_mode: "DIRECT_STOCK",
      default_sale_price: 12.34,
      is_active: true,
      is_sellable: true,
    })
  ).result;
  await page.reload();
  await page.getByRole("button", { name: "Nueva venta", exact: true }).click();
  let dialog = page.getByRole("dialog", { name: "Nueva venta", exact: true });
  await dialog.getByLabel("Cliente", { exact: true }).selectOption(customer);
  await dialog.getByLabel("Sede destino", { exact: true }).selectOption("site-1");
  await dialog.getByRole("button", { name: "Agregar Potripregnant", exact: true }).click();
  await dialog.getByLabel("Cantidad de sacos", { exact: true }).fill("9");
  await dialog.getByLabel("Precio por saco", { exact: true }).fill("70");
  await dialog.getByLabel("Peso por saco", { exact: true }).fill("17");
  await expect(dialog.getByText("Stock insuficiente", { exact: true })).toBeVisible();
  const remove = dialog.getByRole("button", { name: "Quitar producto", exact: true });
  await expect(remove).toBeEnabled();
  await remove.focus();
  await remove.press("Enter");
  const empty = async () => {
    await expect(dialog.getByLabel("Producto", { exact: true })).toHaveCount(0);
    await expect(dialog.getByText("Aún no hay productos agregados", { exact: true })).toBeVisible();
    await expect(
      dialog.locator(".sale-section-meta").filter({ hasText: "0 líneas en la venta" }),
    ).toBeVisible();
    await expect(dialog.locator(".sale-total strong")).toHaveText(/S\/\s*0[,.]00/);
    await expect(dialog.getByText("Stock insuficiente", { exact: true })).toHaveCount(0);
  };
  await empty();
  await expect(dialog.locator(".sale-live-message")).toHaveText("Potripregnant quitado de la venta.");
  await expect(dialog.getByRole("button", { name: "Agregar producto", exact: true })).toBeFocused();
  const before = await state();
  await dialog
    .locator("form")
    .evaluate((form) => form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
  await expect(
    dialog.getByText("Agrega al menos un producto y completa todas las líneas.", { exact: true }),
  ).toBeVisible();
  assert.deepEqual(await state(), before);
  for (const viewport of [
    { width: 1440, height: 1000 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(viewport);
    for (const colorScheme of ["light", "dark"]) {
      await page.emulateMedia({ colorScheme });
      await dialog.getByText("Aún no hay productos agregados", { exact: true }).scrollIntoViewIfNeeded();
      await page.screenshot({
        path: join(server.evidence, `sale-empty-${viewport.width}-${colorScheme}.png`),
        animations: "disabled",
      });
      assert.ok(await page.locator(".modal-body").evaluate((el) => el.scrollWidth <= el.clientWidth));
    }
  }
  await dialog.getByRole("button", { name: "Agregar producto", exact: true }).click();
  await expect(dialog.getByLabel("Producto", { exact: true })).toHaveValue("");
  await dialog.getByLabel("Precio por saco", { exact: true }).fill("80");
  await expect(dialog.locator(".sale-total strong")).toHaveText(/S\/\s*0[,.]00/);
  await expect(dialog.getByRole("button", { name: "Confirmar venta", exact: true })).toBeDisabled();
  await dialog.getByRole("button", { name: "Quitar producto", exact: true }).click();
  await dialog.getByRole("button", { name: "Agregar CascoPlus+", exact: true }).click();
  await expect(dialog.getByLabel("Producto", { exact: true })).toHaveValue(bottle);
  await expect(dialog.getByLabel("Cantidad de frascos", { exact: true })).toHaveValue("1");
  await expect(dialog.getByLabel("Peso por frasco", { exact: true })).toHaveValue("2.2");
  await expect(dialog.getByLabel("Peso por frasco", { exact: true })).toHaveAttribute("readonly", "");
  await dialog.getByRole("button", { name: "Quitar producto", exact: true }).click();
  await dialog.getByRole("button", { name: "Agregar Potripregnant", exact: true }).click();
  await expect(dialog.getByLabel("Cantidad de sacos", { exact: true })).toHaveValue("1");
  await expect(dialog.getByLabel("Peso por saco", { exact: true })).toHaveValue("25");
  await expect(dialog.getByLabel("Precio por saco", { exact: true })).toHaveValue("73");
  await dialog.getByRole("button", { name: "Agregar producto", exact: true }).click();
  await expect(dialog.getByRole("button", { name: "Confirmar venta", exact: true })).toBeDisabled();
  await dialog.getByLabel("Producto", { exact: true }).last().selectOption("prod-1");
  await dialog.getByLabel("Precio por saco", { exact: true }).last().fill("72");
  await dialog.getByRole("button", { name: "Agregar Potripregnant", exact: true }).click();
  await expect(dialog.getByRole("group", { name: "Elige la línea de Potripregnant" })).toBeVisible();
  await dialog.getByLabel("Peso por saco", { exact: true }).last().fill("24");
  await expect(dialog.getByRole("group", { name: "Elige la línea de Potripregnant" })).toHaveCount(0);
  await dialog.getByRole("button", { name: "Agregar Potripregnant", exact: true }).click();
  await expect(dialog.getByRole("group", { name: "Elige la línea de Potripregnant" })).toBeVisible();
  await dialog.getByRole("button", { name: "Quitar producto", exact: true }).first().click();
  await expect(dialog.getByRole("group", { name: "Elige la línea de Potripregnant" })).toHaveCount(0);
  await expect(dialog.getByLabel("Cantidad de sacos", { exact: true })).toHaveValue("1");
  await expect(dialog.getByLabel("Precio por saco", { exact: true })).toHaveValue("72");
  await expect(dialog.locator(".sale-total strong")).toHaveText(/72[,.]00/);
  await dialog.getByRole("button", { name: "Agregar Potripregnant", exact: true }).click();
  await expect(dialog.getByLabel("Cantidad de sacos", { exact: true })).toHaveValue("2");
  await dialog.getByLabel("Entrega", { exact: true }).selectOption("future");
  const saved = page.waitForResponse(
    (r) => r.url().endsWith("/api/command") && r.request().postDataJSON()?.type === "SALE_SAVE",
  );
  await dialog.getByRole("button", { name: "Confirmar venta", exact: true }).click();
  const savedResponse = await saved;
  assert.equal(savedResponse.status(), 200, await savedResponse.text());
  const sale = (await savedResponse.json()).result;
  const original = await state();
  await page.getByRole("button", { name: "Rectificar", exact: true }).click();
  dialog = page.getByRole("dialog", { name: "Rectificar venta", exact: true });
  await dialog.getByRole("button", { name: "Quitar producto", exact: true }).click();
  await empty();
  await expect(dialog.getByRole("button", { name: "Registrar rectificación", exact: true })).toBeDisabled();
  await dialog.getByRole("button", { name: "Cancelar", exact: true }).click();
  assert.deepEqual(await state(), original);
  for (const items of [
    [],
    [{ quantity: 1, unit_weight_kg: 25, unit_price: 73 }],
    [{ product_id: "", quantity: 1, unit_weight_kg: 25, unit_price: 73 }],
  ]) {
    for (const confirm of [true, false]) {
      await run(
        "SALE_SAVE",
        {
          customer_id: customer,
          site_id: "site-1",
          sale_date: "2026-10-28",
          payment_condition: "CASH",
          payment_method: "TRANSFER",
          paid_amount: 73,
          deliver: true,
          confirm,
          items,
        },
        422,
      );
      assert.deepEqual(await state(), original);
    }
    await run("SALE_CORRECT", { id: sale, reason: "Intento vacío sintético", items }, 422);
    assert.deepEqual(await state(), original);
  }
  await page.evaluate(() => {
    location.hash = "#sales";
  });
  await page
    .getByRole("button", { name: original.sales.find((row) => row.id === sale).code, exact: true })
    .click();
  await page.getByRole("button", { name: "Rectificar", exact: true }).click();
  dialog = page.getByRole("dialog", { name: "Rectificar venta", exact: true });
  await dialog.getByRole("button", { name: "Quitar producto", exact: true }).click();
  await dialog.getByRole("button", { name: "Agregar Potripregnant", exact: true }).click();
  await expect(dialog.getByLabel("Cantidad de sacos", { exact: true })).toHaveValue("1");
  await expect(dialog.getByLabel("Precio por saco", { exact: true })).toHaveValue("73");
  await dialog.getByLabel("Motivo de rectificación", { exact: true }).fill("Recuperación sintética");
  const corrected = page.waitForResponse(
    (r) => r.url().endsWith("/api/command") && r.request().postDataJSON()?.type === "SALE_CORRECT",
  );
  await dialog.getByRole("button", { name: "Registrar rectificación", exact: true }).click();
  const correctedResponse = await corrected;
  assert.equal(correctedResponse.status(), 200, await correctedResponse.text());
  assert.equal(correctedResponse.request().postDataJSON().payload.items[0].original_item_id, undefined);
  await expect(
    page.getByRole("dialog").getByRole("heading", { name: "Detalle comercial", exact: true }),
  ).toBeVisible();
  await page.getByRole("dialog").getByRole("button", { name: "Cerrar", exact: true }).click();
  await page.getByRole("button", { name: /Guardar una venta en borrador/ }).click();
  dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("button", { name: "Guardar borrador", exact: true })).toBeDisabled();
  await dialog.getByRole("button", { name: "Quitar producto", exact: true }).click();
  await empty();
  await expect(dialog.getByRole("button", { name: "Guardar borrador", exact: true })).toBeDisabled();
  assert.deepEqual(errors, []);
});
