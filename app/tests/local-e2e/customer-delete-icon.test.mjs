import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { chromium, expect } from "playwright/test";
import { localAppFixture } from "../helpers/local-app-server.mjs";
import { cashCreditScenario } from "../helpers/regression-scenarios.mjs";
import { customerSummary } from "../../lib/domain.mjs";

test("Clientes: papelera accesible, confirmación y baja lógica por roles", { timeout: 240000 }, async (t) => {
  const server = await localAppFixture();
  t.after(server.stop);
  const browser = await chromium.launch({ channel: process.env.REGRESSION_BROWSER_CHANNEL || undefined });
  t.after(() => browser.close());
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, hasTouch: true });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(server.baseURL);
  await page.getByLabel("Usuario", { exact: true }).fill("admin.local");
  await page.getByLabel("Contraseña", { exact: true }).fill(server.password);
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await page.locator(".sidebar-footer").waitFor({ state: "attached" });
  const session = await (await context.request.get(server.baseURL + "/api/auth/session")).json();
  const state = async () => (await (await context.request.get(server.baseURL + "/api/state")).json()).state;
  const run = async (type, payload, request_id = randomUUID()) => {
    const response = await context.request.post(server.baseURL + "/api/command", {
      headers: { Origin: server.baseURL, "X-CSRF-Token": session.csrf_token },
      data: { type, payload, request_id },
    });
    const body = await response.json();
    assert.equal(response.status(), 200, body.error ?? type);
    return body.result;
  };
  const scenario = await cashCreditScenario({ run, state });
  const emptyName = "Cliente sin historial sintético";
  const emptyId = await run("CUSTOMER_SAVE", { name: emptyName });
  await page.reload();
  await page.locator(".sidebar-footer").waitFor({ state: "attached" });
  await page.evaluate(() => (location.hash = "customers"));
  const name = "Cliente escenario portable";
  const button = page.getByRole("button", { name: "Eliminar cliente " + name, exact: true });
  const row = page.getByRole("row").filter({ has: button });
  const dialog = page.getByRole("dialog");
  const writes = [];
  page.on("request", (request) => {
    if (request.url().endsWith("/api/command")) writes.push(request.postDataJSON());
  });
  for (const mobile of [false, true]) {
    await page.setViewportSize(mobile ? { width: 390, height: 844 } : { width: 1440, height: 1000 });
    for (const theme of ["light", "dark"]) {
      if ((await page.locator("html").getAttribute("data-theme")) !== theme)
        await page
          .getByRole("button", {
            name: theme === "dark" ? "Activar modo oscuro" : "Activar modo claro",
            exact: true,
          })
          .click();
      await button.scrollIntoViewIfNeeded();
      await expect(button).toHaveAttribute("type", "button");
      await expect(button).toHaveAttribute("title", "Eliminar cliente");
      assert.equal(await button.innerText(), "");
      await expect(button.locator("svg.lucide-trash-2")).toHaveAttribute("aria-hidden", "true");
      await expect(row.getByRole("button", { name: "Editar", exact: true })).toBeVisible();
      await row.getByRole("button", { name: "Editar", exact: true }).focus();
      await page.keyboard.press("Tab");
      await expect(button).toBeFocused();
      await expect(button).toHaveCSS("color", theme === "dark" ? "rgb(255, 178, 186)" : "rgb(172, 48, 60)");
      const metrics = await button.evaluate((node) => {
        const css = getComputedStyle(node);
        const rgb = (value) =>
          value
            .match(/[\d.]+/g)
            .slice(0, 3)
            .map(Number);
        const luminance = (color) =>
          rgb(color)
            .map((v) => {
              v /= 255;
              return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
            })
            .reduce((a, v, i) => a + v * [0.2126, 0.7152, 0.0722][i], 0);
        const surface = getComputedStyle(node.closest("td")).backgroundColor;
        let parent = node.parentElement;
        let background = surface;
        while (background === "rgba(0, 0, 0, 0)" && parent) {
          background = getComputedStyle(parent).backgroundColor;
          parent = parent.parentElement;
        }
        const a = luminance(css.color),
          b = luminance(background);
        return {
          color: css.color,
          svg: getComputedStyle(node.querySelector("svg")).stroke,
          danger: css.getPropertyValue("--danger").trim(),
          outline: css.outlineStyle,
          outlineWidth: css.outlineWidth,
          contrast: (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05),
          width: node.getBoundingClientRect().width,
          height: node.getBoundingClientRect().height,
        };
      });
      assert.equal(metrics.color, theme === "dark" ? "rgb(255, 178, 186)" : "rgb(172, 48, 60)");
      assert.equal(metrics.svg, metrics.color);
      assert.ok(metrics.contrast >= 3);
      assert.equal(metrics.outline, "solid");
      assert.equal(metrics.outlineWidth, "2px");
      assert.ok(metrics.width >= (mobile ? 44 : 40) && metrics.height >= (mobile ? 44 : 40));
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      assert.equal(await page.locator("main table thead th").last().getByRole("button").count(), 0);
      writeFileSync(
        join(server.evidence, `${mobile ? "mobile" : "desktop"}-${theme}-metrics.json`),
        JSON.stringify(metrics, null, 2),
      );
      await page.screenshot({
        path: join(server.evidence, `${mobile ? "mobile" : "desktop"}-${theme}-focus.png`),
        animations: "disabled",
      });
      const before = await state();
      for (const key of ["Enter", "Space"]) {
        await page.keyboard.press(key);
        await expect(dialog).toBeVisible();
        await expect(
          dialog.getByRole("heading", { name: "Eliminar " + name + " de la lista", exact: true }),
        ).toBeVisible();
        await expect(dialog).toContainText("Sus ventas, pagos, saldos e historial se conservan.");
        assert.deepEqual(await state(), before);
        if (key === "Enter") await dialog.getByRole("button", { name: "Cancelar", exact: true }).click();
        else await page.keyboard.press("Escape");
        await expect(dialog).not.toBeVisible();
        await expect(button).toBeFocused();
        assert.deepEqual(await state(), before);
      }
      if (mobile) await button.tap();
      else await button.click();
      await expect(dialog).toBeVisible();
      await page.screenshot({
        path: join(server.evidence, `${mobile ? "mobile" : "desktop"}-${theme}-modal.png`),
        animations: "disabled",
      });
      await dialog.getByRole("button", { name: "Cancelar", exact: true }).click();
      await expect(dialog).not.toBeVisible();
    }
  }
  assert.deepEqual(writes, [], "Abrir y cancelar no escriben");
  writeFileSync(join(server.evidence, "customer-accessibility.yml"), await row.ariaSnapshot());
  for (const [customerName, id] of [
    [name, scenario.customer],
    [emptyName, emptyId],
  ]) {
    const before = await state();
    await page.getByRole("button", { name: "Eliminar cliente " + customerName, exact: true }).click();
    await dialog.getByRole("button", { name: "Eliminar de la lista", exact: true }).click();
    await expect(dialog).not.toBeVisible();
    await expect(
      page.getByRole("button", { name: "Eliminar cliente " + customerName, exact: true }),
    ).toHaveCount(0);
    assert.equal(writes.at(-1).type, "CUSTOMER_DELETE");
    assert.deepEqual(writes.at(-1).payload, { id });
    const after = await state();
    for (const field of Object.keys(before))
      if (!["customers", "audit", "corrections", "correctionFields", "revision"].includes(field))
        assert.deepEqual(after[field], before[field], field);
    assert.deepEqual(customerSummary(after, id), customerSummary(before, id));
    assert.deepEqual(after.audit.slice(0, before.audit.length), before.audit);
    assert.equal(after.customers.find((c) => c.id === id).is_active, false);
    assert.ok(after.customers.find((c) => c.id === id).deleted_at);
    assert.ok(after.audit.some((a) => a.action === "CUSTOMER_DELETE"));
    await page.reload();
    await page.locator(".sidebar-footer").waitFor({ state: "attached" });
    await expect(
      page.getByRole("button", { name: "Eliminar cliente " + customerName, exact: true }),
    ).toHaveCount(0);
  }
  for (const role of ["VIEWER", "OPERATOR"]) {
    const login = "delete-" + role;
    const password = randomUUID() + randomUUID();
    await run("USER_SAVE", { id: login, name: role + " sintético", role });
    assert.equal(
      (
        await context.request.post(server.baseURL + "/api/auth/credentials", {
          headers: { Origin: server.baseURL, "X-CSRF-Token": session.csrf_token },
          data: { user_id: login, login, password },
        })
      ).status(),
      200,
    );
    const id = await run("CUSTOMER_SAVE", { name: "Cliente permiso " + role });
    const account = await browser.newContext();
    await account.request.post(server.baseURL + "/api/auth/login", {
      headers: { Origin: server.baseURL },
      data: { login, password },
    });
    const actorSession = await (await account.request.get(server.baseURL + "/api/auth/session")).json();
    const actorPage = await account.newPage();
    await actorPage.goto(server.baseURL + "/#customers");
    await expect(actorPage.locator(".sidebar-footer")).toBeVisible();
    const trigger = actorPage.getByRole("button", {
      name: "Eliminar cliente Cliente permiso " + role,
      exact: true,
    });
    await expect(trigger).toHaveCount(role === "VIEWER" ? 0 : 1);
    const before = await state();
    const response = await account.request.post(server.baseURL + "/api/command", {
      headers: { Origin: server.baseURL, "X-CSRF-Token": actorSession.csrf_token },
      data: { type: "CUSTOMER_DELETE", payload: { id }, request_id: randomUUID() },
    });
    assert.equal(response.status(), role === "VIEWER" ? 403 : 200);
    if (role === "VIEWER") assert.deepEqual(await state(), before);
    else assert.ok((await state()).customers.find((c) => c.id === id).deleted_at);
    await account.close();
  }
  assert.deepEqual(errors, []);
  console.log("Evidencia papelera Clientes:", server.evidence);
});
