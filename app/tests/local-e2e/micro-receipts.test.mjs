import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { chromium, expect } from "playwright/test";
import { localAppFixture } from "../helpers/local-app-server.mjs";

test(
  "compras operativas UI: dos renglones, error sin efectos, borrador, recepción, foco y 1440/390 claro/oscuro",
  { timeout: 180000 },
  async (t) => {
    const f = await localAppFixture();
    t.after(f.stop);
    console.log("NQP26-22 E2E evidence: " + f.evidence);
    const browser = await chromium.launch({ channel: process.env.REGRESSION_BROWSER_CHANNEL || undefined });
    t.after(() => browser.close());
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: "es-PE" });
    const login = await context.request.post(f.baseURL + "/api/auth/login", {
      headers: { Origin: f.baseURL },
      data: { login: "admin.local", password: f.password },
    });
    const session = await login.json();
    const command = async (type, payload) => {
      const r = await context.request.post(f.baseURL + "/api/command", {
        headers: { Origin: f.baseURL, "X-CSRF-Token": session.csrf_token },
        data: { type, payload, request_id: randomUUID() },
      });
      assert.equal(r.status(), 200, await r.text());
      return (await r.json()).result;
    };
    const ids = [];
    for (const [i, name] of ["Zeta sintética", "Ácido sintético"].entries()) {
      const id = await command("MICRO_SAVE", { name, operational_id: i + 1, is_active: true });
      ids.push(id);
      await command("MICRO_OPEN", {
        micro_ingredient_id: id,
        quantity_kg: "5",
        unit_cost: "2",
        cutoff_date: i ? "2026-10-20" : "2026-10-30",
        measurement: "REAL",
        source: "Pesaje de ensayo",
      });
    }
    const unknownCostId = await command("MICRO_SAVE", {
      name: "Sin costo sintético",
      operational_id: 3,
      is_active: true,
    });
    await command("MICRO_OPEN", {
      micro_ingredient_id: unknownCostId,
      quantity_kg: "5",
      cutoff_date: "2026-10-20",
      measurement: "REAL",
      source: "Recuento sintético sin precio",
    });
    const state = async () => (await (await context.request.get(f.baseURL + "/api/state")).json()).state;
    const before = await state();
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(f.baseURL + "/#inventory/micros");
    const area = page.locator(".operational-purchases");
    await expect(area.getByText("Aún no hay compras operativas registradas.")).toBeVisible();
    await area.getByRole("button", { name: "Registrar compra operativa", exact: true }).click();
    await expect(area.getByLabel("Proveedor de compra", { exact: true })).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(area.getByLabel("Referencia de compra", { exact: true })).toBeFocused();
    await area.getByLabel("Proveedor de compra", { exact: true }).fill("Proveedor ficticio UI");
    await area.getByLabel("Referencia de compra", { exact: true }).fill("OP-UI-01");
    await area.getByLabel("Fecha de recepción y comprobante", { exact: true }).fill("2026-11-01");
    await area.getByLabel("Fuente / observaciones de compra", { exact: true }).fill("Documento sintético");
    await area.getByLabel("Total pagado por insumos (S/)", { exact: true }).fill("27");
    await area.getByLabel("Descuento total documentado (S/)", { exact: true }).fill("1");
    const options = await area
      .getByLabel("Microinsumo recibido 1", { exact: true })
      .locator("option")
      .allTextContents();
    assert.match(options[1], /Ácido/);
    await area.getByLabel("Microinsumo recibido 1", { exact: true }).selectOption(ids[0]);
    await area.getByLabel("Kg recibidos 1", { exact: true }).fill("5");
    await area.getByLabel("Precio por kg (S/) 1", { exact: true }).fill("4");
    await area.getByLabel("Importe bruto (S/) 1", { exact: true }).fill("20");
    await area.getByLabel("Descuento del artículo (S/) 1", { exact: true }).fill("1");
    await area.getByRole("button", { name: "Añadir artículo recibido", exact: true }).click();
    await area.getByLabel("Microinsumo recibido 2", { exact: true }).selectOption(ids[1]);
    await area.getByLabel("Kg recibidos 2", { exact: true }).fill("2");
    await area.getByLabel("Precio por kg (S/) 2", { exact: true }).fill("4");
    await area.getByLabel("Importe bruto (S/) 2", { exact: true }).fill("7");
    await area.getByLabel("Revisé los gastos previos para evitar duplicados", { exact: true }).check();
    await area.getByLabel("Confirmo la recepción física y el pago de esta compra", { exact: true }).check();
    const save = async (name, status = 200) => {
      const pending = page.waitForResponse((r) => r.url().endsWith("/api/command"));
      await area.getByRole("button", { name, exact: true }).click();
      const r = await pending;
      assert.equal(r.status(), status, await r.text());
    };
    await save("Confirmar compra y recepción", 422);
    assert.deepEqual(await state(), before);
    await area.getByLabel("Importe bruto (S/) 2", { exact: true }).fill("8");
    await area.getByLabel("Fecha de recepción y comprobante", { exact: true }).fill("2026-10-25");
    await save("Confirmar compra y recepción", 422);
    await expect(
      page
        .getByRole("alert")
        .filter({ hasText: /La compra debe ser posterior al corte de cada microinsumo/ })
        .first(),
    ).toBeVisible();
    assert.deepEqual(await state(), before);
    await area.getByLabel("Fecha de recepción y comprobante", { exact: true }).fill("2026-11-01");
    await area.getByLabel("Descuento total documentado (S/)", { exact: true }).fill("2");
    await save("Confirmar compra y recepción", 422);
    await expect(
      page
        .getByRole("alert")
        .filter({ hasText: /Total y descuentos no concilian/ })
        .first(),
    ).toBeVisible();
    assert.deepEqual(await state(), before);
    await area.getByLabel("Descuento total documentado (S/)", { exact: true }).fill("1");
    await area.getByLabel("Kg recibidos 2", { exact: true }).fill("0");
    await save("Confirmar compra y recepción", 422);
    await expect(
      page
        .getByRole("alert")
        .filter({ hasText: /Cantidad recibida debe ser mayor que cero/ })
        .first(),
    ).toBeVisible();
    assert.deepEqual(await state(), before);
    await area.getByLabel("Kg recibidos 2", { exact: true }).fill("2");
    await area.getByLabel("Microinsumo recibido 2", { exact: true }).selectOption(unknownCostId);
    await save("Confirmar compra y recepción", 422);
    await expect(
      page
        .getByRole("alert")
        .filter({ hasText: /Apertura sin costo probado/ })
        .first(),
    ).toBeVisible();
    assert.deepEqual(await state(), before);
    await area.getByLabel("Microinsumo recibido 2", { exact: true }).selectOption(ids[1]);
    for (const width of [1440, 390])
      for (const theme of ["light", "dark"]) {
        await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
        await page.evaluate((theme) => {
          document.documentElement.dataset.theme = theme;
        }, theme);
        await area.scrollIntoViewIfNeeded();
        await page.screenshot({
          path: join(f.evidence, `op-form-${width}-${theme}.png`),
          fullPage: true,
          animations: "disabled",
        });
        assert.equal(
          await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
          true,
        );
      }
    await save("Guardar borrador operativo");
    assert.equal((await state()).expenses.length, before.expenses.length);
    assert.equal((await state()).microLedgers.length, 0);
    await expect(area.getByRole("button", { name: "Registrar compra operativa", exact: true })).toBeFocused();
    await area.locator("summary").filter({ hasText: "OP-UI-01" }).click();
    await area.getByRole("button", { name: "Completar OP-UI-01", exact: true }).click();
    await area.getByLabel("Revisé los gastos previos para evitar duplicados", { exact: true }).check();
    await area.getByLabel("Confirmo la recepción física y el pago de esta compra", { exact: true }).check();
    for (const width of [1440, 390])
      for (const theme of ["light", "dark"]) {
        await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
        await page.evaluate((theme) => {
          document.documentElement.dataset.theme = theme;
        }, theme);
        await area.getByLabel("Proveedor de compra", { exact: true }).scrollIntoViewIfNeeded();
        await page.screenshot({
          path: join(f.evidence, `op-clean-form-${width}-${theme}.png`),
          animations: "disabled",
        });
        await area
          .getByRole("button", { name: "Confirmar compra y recepción", exact: true })
          .scrollIntoViewIfNeeded();
        await page.screenshot({
          path: join(f.evidence, `op-actions-${width}-${theme}.png`),
          animations: "disabled",
        });
      }
    await save("Confirmar compra y recepción");
    let after = await state();
    assert.equal(after.expenses.length, before.expenses.length + 1);
    assert.equal(after.expenses.at(-1).amount, 2700);
    assert.equal(after.microValuationEvents.length, 2);
    assert.equal(after.microLedgers[0].ledger.quantity_grams, 10000);
    assert.deepEqual(after.microOpenings, before.microOpenings);
    await page.reload();
    await expect(area.getByText(/Stock físico: 10/)).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Corregir saldo de Zeta sintética", exact: true }),
    ).toBeDisabled();
    for (const width of [1440, 390])
      for (const theme of ["light", "dark"]) {
        await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
        await page.evaluate((theme) => {
          document.documentElement.dataset.theme = theme;
        }, theme);
        await area.scrollIntoViewIfNeeded();
        await page.screenshot({
          path: join(f.evidence, `op-list-${width}-${theme}.png`),
          fullPage: true,
          animations: "disabled",
        });
      }
    after = await state();
    assert.equal(after.microValuationEvents.length, 2);
    assert.equal(after.expenses.length, before.expenses.length + 1);
    await area.getByRole("button", { name: "Registrar compra operativa", exact: true }).click();
    await area.getByLabel("Proveedor de compra", { exact: true }).fill("Proveedor ficticio UI");
    await area.getByLabel("Referencia de compra", { exact: true }).fill("OP-UI-01");
    await save("Guardar borrador operativo", 422);
    await expect(
      page
        .getByRole("alert")
        .filter({ hasText: /Comprobante ya registrado en compras históricas u operativas/ })
        .first(),
    ).toBeVisible();
    assert.deepEqual(await state(), after);
    await area.getByRole("button", { name: "Cancelar compra", exact: true }).click();
    for (const role of ["OPERATOR", "VIEWER"]) {
      const id = "receipt-ui-" + role.toLowerCase(),
        password = randomUUID() + randomUUID();
      await command("USER_SAVE", { id, name: "Consulta de ensayo " + role, role, is_active: true });
      const credential = await context.request.post(f.baseURL + "/api/auth/credentials", {
        headers: { Origin: f.baseURL, "X-CSRF-Token": session.csrf_token },
        data: { user_id: id, login: id, password },
      });
      assert.equal(credential.status(), 200);
      const account = await browser.newContext();
      const signed = await account.request.post(f.baseURL + "/api/auth/login", {
        headers: { Origin: f.baseURL },
        data: { login: id, password },
      });
      assert.equal(signed.status(), 200);
      const readPage = await account.newPage();
      await readPage.goto(f.baseURL + "/#inventory/micros");
      const readArea = readPage.locator(".operational-purchases");
      await expect(
        readArea.getByRole("button", { name: "Registrar compra operativa", exact: true }),
      ).toHaveCount(0);
      await expect(readArea.getByText(/Stock físico: 10/)).toBeVisible();
      await account.close();
    }
    assert.deepEqual(errors, []);
  },
);
