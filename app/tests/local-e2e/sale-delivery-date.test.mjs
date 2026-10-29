import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { chromium, expect } from "playwright/test";
import { localAppFixture } from "../helpers/local-app-server.mjs";

test(
  "F06 UI: fechas independientes, borrador, reinicio, confirmado y reprogramación",
  { timeout: 180000 },
  async (t) => {
    const server = await localAppFixture({ development: process.env.UI_REVIEW_DEV === "1" });
    t.after(server.stop);
    console.log("NQP26-06 evidencias: " + server.evidence);
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
    const customerResponse = await request.post(server.baseURL + "/api/command", {
      headers: { Origin: server.baseURL, "X-CSRF-Token": session.csrf_token },
      data: {
        type: "CUSTOMER_SAVE",
        payload: { name: "Cliente sintético fecha", site_ids: ["site-1"] },
        request_id: randomUUID(),
      },
    });
    assert.equal(customerResponse.status(), 200);
    const customer = (await customerResponse.json()).result;
    await page.reload();
    await page.getByRole("button", { name: "Ventas", exact: true }).click();
    await page.getByRole("button", { name: /Guardar una venta en borrador/ }).click();
    let dialog = page.getByRole("dialog");
    const saleDay = () => dialog.getByLabel("Fecha de venta", { exact: true });
    const delivery = () => dialog.getByLabel("Fecha de entrega", { exact: true });
    await expect(delivery()).toHaveValue(await saleDay().inputValue());
    await saleDay().focus();
    // Chrome dates have internal day/month/year tab stops; reaching the next field takes several Tabs.
    for (
      let step = 0;
      step < 8 && !(await delivery().evaluate((el) => el === document.activeElement));
      step++
    ) {
      await page.keyboard.press("Tab");
    }
    await expect(delivery()).toBeFocused();
    await expect(
      dialog.getByLabel("Mantener esta fecha de entrega al cambiar la fecha de venta"),
    ).not.toBeChecked();
    await saleDay().fill("2026-10-30");
    await expect(delivery()).toHaveValue("2026-10-30");
    // Native inputs may emit no change for an identical value. The explicit control also records intent.
    await delivery().fill("2026-10-30");
    await dialog.getByLabel("Mantener esta fecha de entrega al cambiar la fecha de venta").check();
    await saleDay().fill("2026-11-02");
    await expect(delivery()).toHaveValue("2026-10-30");
    await delivery().fill("2026-11-04");
    await saleDay().fill("2026-11-03");
    await expect(delivery()).toHaveValue("2026-11-04");
    await dialog.getByLabel("Cliente", { exact: true }).selectOption(customer);
    await dialog.getByLabel("Sede destino", { exact: true }).selectOption("site-1");
    await dialog.getByRole("button", { name: "Agregar Potripregnant", exact: true }).click();
    await dialog.getByLabel("Entrega", { exact: true }).selectOption("future");
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
      for (const colorScheme of ["light", "dark"]) {
        await page.emulateMedia({ colorScheme });
        await saleDay().scrollIntoViewIfNeeded();
        const a = await saleDay().boundingBox();
        const b = await delivery().boundingBox();
        assert.ok(a && b);
        assert.ok(width === 390 ? b.y > a.y + a.height : Math.abs(a.y - b.y) < 2);
        assert.ok(await page.locator(".modal-body").evaluate((el) => el.scrollWidth <= el.clientWidth));
        await page.screenshot({
          path: join(server.evidence, `delivery-dates-${width}-${colorScheme}.png`),
          animations: "disabled",
        });
      }
    }
    await page.setViewportSize({ width: 1440, height: 1000 });
    const saved = page.waitForResponse(
      (r) => r.url().endsWith("/api/command") && r.request().method() === "POST",
    );
    await dialog.getByRole("button", { name: "Guardar borrador", exact: true }).click();
    const save = await saved;
    assert.equal(save.status(), 200, await save.text());
    const id = (await save.json()).result;
    await expect(page.getByRole("dialog", { name: "Detalle de venta", exact: true })).toBeVisible();
    await page.getByRole("dialog").getByRole("button", { name: "Cerrar", exact: true }).click();
    await expect(page.getByRole("dialog")).not.toBeVisible();
    await server.stop();
    await server.start();
    await page.reload();
    const draft = (await state()).sales.find((x) => x.id === id);
    assert.equal(draft.delivery_date, "2026-11-04");
    assert.equal(draft.delivery_date_manual_override, true);
    await page.getByRole("button", { name: "Borradores", exact: true }).click();
    await page.getByRole("button", { name: draft.code, exact: true }).click();
    await page.getByRole("button", { name: "Editar / confirmar borrador", exact: true }).click();
    dialog = page.getByRole("dialog");
    await expect(delivery()).toHaveValue("2026-11-04");
    await saleDay().fill("2026-11-05");
    await expect(delivery()).toHaveValue("2026-11-04");
    await dialog.getByLabel("Entrega", { exact: true }).selectOption("future");
    await dialog.getByRole("button", { name: "Confirmar venta", exact: true }).click();
    await expect(page.getByRole("dialog", { name: "Detalle de venta", exact: true })).toBeVisible();
    await page.getByRole("dialog").getByRole("button", { name: "Cerrar", exact: true }).click();
    await expect(page.getByRole("dialog")).not.toBeVisible();
    await page.getByRole("button", { name: "Historial", exact: true }).click();
    await page.getByRole("button", { name: draft.code, exact: true }).click();
    await page.getByRole("button", { name: "Cambiar fecha de entrega", exact: true }).click();
    dialog = page.getByRole("dialog", { name: "Cambiar fecha de entrega", exact: true });
    await expect(delivery()).toHaveValue("2026-11-04");
    await expect(saleDay()).toHaveValue("2026-11-05");
    await delivery().fill("2026-10-01");
    await expect(dialog.getByRole("status")).toContainText("anterior");
    await dialog.getByLabel("Motivo del cambio", { exact: true }).fill("Regularización sintética");
    const anonymous = await browser.newContext();
    try {
      const denied = await anonymous.request.post(server.baseURL + "/api/command", {
        headers: { Origin: server.baseURL },
        data: {
          type: "SALE_DELIVERY_DATE_UPDATE",
          request_id: randomUUID(),
          payload: { id, delivery_date: "2026-11-20", reason: "Sin identidad" },
        },
      });
      assert.equal(denied.status(), 401);
    } finally {
      await anonymous.close();
    }
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
      await delivery().scrollIntoViewIfNeeded();
      assert.ok(await page.locator(".modal-body").evaluate((el) => el.scrollWidth <= el.clientWidth));
      await page.screenshot({
        path: join(server.evidence, `delivery-update-${width}.png`),
        animations: "disabled",
      });
    }
    await page.setViewportSize({ width: 1440, height: 1000 });
    const before = await state();
    const updated = page.waitForResponse(
      (r) => r.url().endsWith("/api/command") && r.request().method() === "POST",
    );
    await dialog.getByRole("button", { name: "Guardar fecha de entrega", exact: true }).click();
    const response = await updated;
    assert.equal(response.status(), 200, await response.text());
    const sent = response.request().postDataJSON();
    assert.equal(sent.type, "SALE_DELIVERY_DATE_UPDATE");
    assert.deepEqual(Object.keys(sent.payload).sort(), ["delivery_date", "id", "reason"]);
    await expect(page.getByRole("dialog", { name: "Detalle de venta", exact: true })).toBeVisible();
    await page.getByRole("dialog").getByRole("button", { name: "Cerrar", exact: true }).click();
    await expect(page.getByRole("dialog")).not.toBeVisible();
    await page.reload();
    const after = await state();
    assert.equal(after.sales.find((x) => x.id === id).delivery_date, "2026-10-01");
    for (const key of ["saleItems", "payments", "inventoryMovements", "paymentApplications"]) {
      assert.deepEqual(after[key], before[key], key);
    }
    assert.deepEqual(errors, []);
  },
);
