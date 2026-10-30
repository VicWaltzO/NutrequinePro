import { test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { chromium, expect } from "playwright/test";
import { localAppFixture } from "../helpers/local-app-server.mjs";

const confirmation = "Confirmo vincular esta sede al cliente al confirmar la venta";
test(
  "D10: destino puntual, vínculo confirmado, selección, alta rápida, teclado y cuatro vistas",
  { timeout: 180000 },
  async (t) => {
    const server = await localAppFixture({ development: process.env.UI_REVIEW_DEV === "1" });
    t.after(server.stop);
    console.log("NQP26-10 evidencias sintéticas: " + server.evidence);
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
    const run = async (type, payload) => {
      const r = await request.post(server.baseURL + "/api/command", {
        headers: { Origin: server.baseURL, "X-CSRF-Token": session.csrf_token },
        data: { type, payload, request_id: randomUUID() },
      });
      assert.equal(r.status(), 200, await r.text());
      return (await r.json()).result;
    };
    const customer = await run("CUSTOMER_SAVE", { name: "Cliente destino puntual", site_ids: ["site-1"] });
    const otherCustomer = await run("CUSTOMER_SAVE", { name: "Persona independiente" });
    const site = await run("SITE_SAVE", { name: "Álamo destino sintético" });
    const site2 = await run("SITE_SAVE", { name: "Zeta destino sintético" });
    await page.goto(server.baseURL + "/#sales");
    await page.reload();
    await page.getByRole("button", { name: "Nueva venta", exact: true }).click();
    const dialog = page.getByRole("dialog");
    const customerSelect = dialog.getByLabel("Cliente", { exact: true });
    const siteSelect = dialog.getByLabel("Sede destino", { exact: true });
    const warning = dialog.locator("#sale-site-context");
    const save = dialog.getByRole("button", { name: "Confirmar venta", exact: true });
    await customerSelect.selectOption(customer);
    await expect(siteSelect).toHaveValue("site-1");
    await expect(warning).toHaveCount(0);
    await siteSelect.selectOption(site);
    await expect(warning).toContainText("Cliente destino puntual");
    await expect(warning).toContainText("Álamo destino sintético");
    await expect(dialog.getByRole("radio", { name: "Solo esta venta", exact: true })).toBeChecked();
    const before = await state();
    await dialog.getByRole("radio", { name: "Vincular sede", exact: true }).check();
    await expect(save).toBeDisabled();
    const check = dialog.getByLabel(confirmation, { exact: true });
    await check.focus();
    await page.keyboard.press("Space");
    await expect(check).toBeChecked();
    assert.deepEqual(await state(), before, "Elegir y aceptar en UI no escribe relación");
    for (const width of [1440, 390])
      for (const theme of ["light", "dark"]) {
        await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
        await page.evaluate((theme) => {
          document.documentElement.dataset.theme = theme;
          localStorage.setItem("nutrequine-theme", theme);
        }, theme);
        await check.focus();
        await dialog
          .locator(".sale-site-choice")
          .evaluate((element) => element.scrollIntoView({ block: "center" }));
        await expect(warning).toBeVisible();
        const warningBounds = await warning.boundingBox();
        const checkBounds = await check.boundingBox();
        const bodyBounds = await dialog.locator(".modal-body").boundingBox();
        const footerBounds = await dialog.locator(".form-footer").boundingBox();
        assert.ok(warningBounds.y >= bodyBounds.y && checkBounds.y + checkBounds.height <= footerBounds.y);
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
        await page.screenshot({
          path: join(server.evidence, `sale-site-${width}-${theme}.png`),
          fullPage: true,
        });
      }
    await siteSelect.selectOption(site2);
    await expect(dialog.getByRole("radio", { name: "Solo esta venta", exact: true })).toBeChecked();
    await expect(check).toHaveCount(0);
    await dialog.getByRole("radio", { name: "Vincular sede", exact: true }).check();
    await check.check();
    await customerSelect.selectOption(otherCustomer);
    await expect(dialog.getByRole("radio", { name: "Solo esta venta", exact: true })).toBeChecked();
    await customerSelect.selectOption(customer);
    await expect(warning).toHaveCount(0);
    await siteSelect.selectOption(site);
    await dialog.getByRole("button", { name: "Agregar Potripregnant", exact: true }).click();
    await dialog.getByLabel("Entrega", { exact: true }).selectOption("future");
    async function confirmSale() {
      const response = page.waitForResponse(
        (r) => r.url().endsWith("/api/command") && r.request().postDataJSON()?.type === "SALE_SAVE",
      );
      await save.click();
      const r = await response;
      assert.equal(r.status(), 200, await r.text());
      await expect(page.getByRole("dialog", { name: "Detalle de venta", exact: true })).toBeVisible();
      await dialog.getByRole("button", { name: "Cerrar", exact: true }).click();
      await expect(dialog).not.toBeVisible();
      return r.request().postDataJSON();
    }
    const oneTime = await confirmSale();
    assert.equal(oneTime.payload.site_link_mode, "ONE_TIME");
    let s = await state();
    assert.deepEqual(s.customerSites, before.customerSites);
    const historical = structuredClone(s.sales);
    assert.equal(s.sales.at(-1).site_id, site);
    await page.getByRole("button", { name: "Nueva venta", exact: true }).click();
    await customerSelect.selectOption(customer);
    await dialog.getByRole("button", { name: "Crear sede", exact: true }).click();
    await dialog.getByLabel("Nombre de sede", { exact: true }).fill("Sede creada sin asociación");
    const created = page.waitForResponse(
      (r) => r.url().endsWith("/api/command") && r.request().postDataJSON()?.type === "SITE_SAVE",
    );
    await dialog.getByRole("button", { name: "Guardar sede", exact: true }).click();
    assert.equal((await created).status(), 200);
    await expect(warning).toContainText("Sede creada sin asociación");
    s = await state();
    assert.deepEqual(s.customerSites, before.customerSites);
    const newSite = s.sites.find((x) => x.name === "Sede creada sin asociación").id;
    await dialog.getByRole("radio", { name: "Vincular sede", exact: true }).check();
    await check.check();
    await dialog.getByRole("button", { name: "Agregar Potripregnant", exact: true }).click();
    await dialog.getByLabel("Entrega", { exact: true }).selectOption("future");
    const linked = await confirmSale();
    assert.equal(linked.payload.site_link_mode, "LINK");
    assert.equal(linked.payload.confirm_site_link, true);
    s = await state();
    assert.equal(
      s.customerSites.filter((x) => x.customer_id === customer && x.site_id === newSite).length,
      1,
    );
    assert.deepEqual(s.sales.slice(0, historical.length), historical);
    await page.getByRole("button", { name: /Guardar una venta en borrador/ }).click();
    await customerSelect.selectOption(customer);
    await siteSelect.selectOption(site2);
    await expect(dialog.getByText(/borrador guardará el destino sin vincularlo/)).toBeVisible();
    await expect(dialog.getByRole("radio")).toHaveCount(0);
    await dialog.getByRole("button", { name: "Agregar Potripregnant", exact: true }).click();
    await dialog.getByLabel("Entrega", { exact: true }).selectOption("future");
    const draftResponse = page.waitForResponse(
      (r) => r.url().endsWith("/api/command") && r.request().postDataJSON()?.type === "SALE_SAVE",
    );
    await dialog.getByRole("button", { name: "Guardar borrador", exact: true }).click();
    const draftResult = await draftResponse;
    assert.equal(draftResult.status(), 200, await draftResult.text());
    const draftId = (await draftResult.json()).result;
    await expect(page.getByRole("dialog", { name: "Detalle de venta", exact: true })).toBeVisible();
    await dialog.getByRole("button", { name: "Cerrar", exact: true }).click();
    const afterDraft = await state();
    assert.deepEqual(afterDraft.customerSites, s.customerSites);
    assert.equal(afterDraft.sales.find((x) => x.id === draftId).site_id, site2);
    await server.stop();
    await server.start();
    assert.deepEqual((await state()).customerSites, afterDraft.customerSites);
    assert.equal((await state()).sales.find((x) => x.id === draftId).site_id, site2);
    assert.deepEqual(errors, []);
  },
);
