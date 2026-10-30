import { test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { chromium, expect } from "playwright/test";
import { localAppFixture } from "../helpers/local-app-server.mjs";
import { customerDuplicateReview } from "../../features/clientes/domain/name-matches.mjs";

const confirmation = "Confirmo que es un cliente diferente con nombre similar";
test(
  "D09: Clientes y alta rápida, revisión obsoleta, teclado, 390/1440 claro/oscuro",
  { timeout: 180000 },
  async (t) => {
    const server = await localAppFixture();
    t.after(server.stop);
    console.log("NQP26-09 evidencias sintéticas: " + server.evidence);
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
    const run = async (payload) => {
      const response = await request.post(server.baseURL + "/api/command", {
        headers: { Origin: server.baseURL, "X-CSRF-Token": session.csrf_token },
        data: { type: "CUSTOMER_SAVE", payload, request_id: randomUUID() },
      });
      assert.equal(response.status(), 200, await response.text());
      return response.json();
    };
    await run({ name: "Gonzalo Andrade", tax_id: "SINTETICO-09" });
    let s = await state();
    await run({
      name: "Gonzalo Andrada",
      is_active: false,
      confirm_duplicate: true,
      duplicate_review: customerDuplicateReview(s.customers, "Gonzalo Andrada"),
    });
    await page.goto(server.baseURL + "/#customers");
    await page.reload();
    await page.getByRole("button", { name: "Nuevo cliente", exact: true }).click();
    const dialog = page.getByRole("dialog");
    const name = dialog.getByLabel("Nombre", { exact: true });
    const save = dialog.getByRole("button", { name: "Guardar", exact: true });
    const check = dialog.getByLabel(confirmation, { exact: true });
    await name.fill("Gonzálo-Andrade");
    await expect(dialog.locator(".customer-name-warning li")).toHaveCount(2);
    await expect(save).toBeDisabled();
    await expect(name).toHaveAttribute("aria-describedby", "customer-name-matches");
    await dialog.locator("summary").first().focus();
    await page.keyboard.press("Enter");
    await expect(dialog.getByText("SINTETICO-09", { exact: true })).toBeVisible();
    await dialog.locator("summary").first().focus();
    await page.keyboard.press("Enter");
    await check.focus();
    await page.keyboard.press("Space");
    await expect(check).toBeChecked();
    await name.fill("Gonzalo Andrade");
    await expect(check).not.toBeChecked();
    await expect(save).toBeDisabled();
    for (const width of [1440, 390])
      for (const theme of ["light", "dark"]) {
        await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
        await page.evaluate((theme) => {
          document.documentElement.dataset.theme = theme;
          localStorage.setItem("nutrequine-theme", theme);
        }, theme);
        await name.scrollIntoViewIfNeeded();
        await check.focus();
        const bounds = await name.boundingBox();
        const warning = await dialog.locator(".customer-name-warning").boundingBox();
        assert.ok(warning.y >= bounds.y + bounds.height && warning.y - bounds.y - bounds.height < 40);
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
        await page.screenshot({
          path: join(server.evidence, `customer-name-${width}-${theme}.png`),
          fullPage: true,
        });
      }
    await check.check();
    // A different operator adds a homonym after this form was reviewed.
    s = await state();
    await run({
      name: "GONZALO ANDRADE",
      confirm_duplicate: true,
      duplicate_review: customerDuplicateReview(s.customers, "GONZALO ANDRADE"),
    });
    const beforeStale = await state();
    const rejected = page.waitForResponse(
      (r) => r.url().endsWith("/api/command") && r.request().postDataJSON()?.type === "CUSTOMER_SAVE",
    );
    await save.click();
    assert.equal((await rejected).status(), 422);
    await expect(dialog.locator(".customer-name-warning li")).toHaveCount(3);
    await expect(check).not.toBeChecked();
    await expect(save).toBeDisabled();
    assert.deepEqual(await state(), beforeStale);
    await check.check();
    const saved = page.waitForResponse(
      (r) => r.url().endsWith("/api/command") && r.request().postDataJSON()?.type === "CUSTOMER_SAVE",
    );
    await save.click();
    assert.equal((await saved).status(), 200);
    await expect(dialog).not.toBeVisible();
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(server.baseURL + "/#sales");
    await page.getByRole("button", { name: "Nueva venta", exact: true }).click();
    await dialog.getByRole("button", { name: "Crear cliente", exact: true }).click();
    const quick = dialog.getByLabel("Nombre del nuevo cliente", { exact: true });
    await quick.fill("Gonzalo Andrdae");
    const quickSave = dialog.getByRole("button", { name: "Guardar cliente", exact: true });
    await expect(dialog.locator(".customer-name-warning")).toContainText("Nombre similar");
    await expect(quickSave).toBeDisabled();
    await dialog.getByLabel(confirmation, { exact: true }).check();
    await quick.fill("Gonzalo Andrade");
    await expect(dialog.getByLabel(confirmation, { exact: true })).not.toBeChecked();
    await expect(quickSave).toBeDisabled();
    await dialog.getByLabel(confirmation, { exact: true }).check();
    const quickResult = page.waitForResponse(
      (r) => r.url().endsWith("/api/command") && r.request().postDataJSON()?.type === "CUSTOMER_SAVE",
    );
    await quickSave.click();
    const response = await quickResult;
    assert.equal(response.status(), 200, await response.text());
    assert.equal(response.request().postDataJSON().payload.confirm_duplicate, true);
    assert.equal(typeof response.request().postDataJSON().payload.duplicate_review, "string");
    await expect(dialog.getByLabel("Cliente", { exact: true })).not.toHaveValue("");
    // The server commits, but the browser loses the response. The next click must
    // replay the identical body/request_id, rather than acknowledging its own new row.
    await dialog.getByRole("button", { name: "Crear cliente", exact: true }).click();
    await dialog.getByLabel("Nombre del nuevo cliente", { exact: true }).fill("Gonzalo Andrade");
    await dialog.getByLabel(confirmation, { exact: true }).check();
    const beforeLost = await state();
    let lostPayload;
    await page.route(
      "**/api/command",
      async (route) => {
        lostPayload = route.request().postDataJSON();
        const committed = await route.fetch();
        assert.equal(committed.status(), 200);
        await route.abort("failed");
      },
      { times: 1 },
    );
    await dialog.getByRole("button", { name: "Guardar cliente", exact: true }).click();
    await expect(dialog.getByText(/Conserve el formulario/)).toBeVisible();
    await expect(dialog.getByLabel(confirmation, { exact: true })).toBeChecked();
    const afterLost = await state();
    assert.equal(afterLost.customers.length, beforeLost.customers.length + 1);
    const retried = page.waitForResponse(
      (r) =>
        r.url().endsWith("/api/command") && r.request().postDataJSON()?.request_id === lostPayload.request_id,
    );
    await dialog.getByRole("button", { name: "Guardar cliente", exact: true }).click();
    const replayed = await retried;
    assert.equal(replayed.status(), 200);
    assert.deepEqual(replayed.request().postDataJSON(), lostPayload);
    assert.deepEqual(await state(), afterLost);
    await expect(dialog.getByLabel("Nombre del nuevo cliente", { exact: true })).toHaveCount(0);
    assert.deepEqual(errors, []);
  },
);
