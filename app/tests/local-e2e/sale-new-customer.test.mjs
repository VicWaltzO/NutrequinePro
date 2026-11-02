import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { writeFileSync } from "node:fs";
import { chromium, expect } from "playwright/test";
import { localAppFixture } from "../helpers/local-app-server.mjs";

test(
  "NQP26-19: Nuevo accesible, teclado, cancelación sin escritura, selección y roles",
  { timeout: 180000 },
  async (t) => {
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
    await expect(page.locator(".sidebar-footer")).toBeVisible();
    const session = await (await context.request.get(server.baseURL + "/api/auth/session")).json();
    const state = async () => (await (await context.request.get(server.baseURL + "/api/state")).json()).state;
    const command = async (type, payload) => {
      const result = await context.request.post(server.baseURL + "/api/command", {
        headers: { Origin: server.baseURL, "X-CSRF-Token": session.csrf_token },
        data: { type, payload, request_id: randomUUID() },
      });
      assert.equal(result.status(), 200, await result.text());
      return result.json();
    };
    await page.getByRole("button", { name: "Nueva venta", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Nueva venta", exact: true });
    const trigger = dialog.getByRole("button", { name: "Crear nuevo cliente", exact: true });
    const input = dialog.getByLabel("Nombre del nuevo cliente", { exact: true });
    const before = await state();
    const measurements = [];
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
      for (const theme of ["light", "dark"]) {
        await page.emulateMedia({ colorScheme: theme });
        await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
        await expect(trigger).toHaveText("Nuevo");
        await expect(trigger.locator("svg")).toHaveAttribute("aria-hidden", "true");
        await expect(trigger).toHaveAttribute("type", "button");
        await expect(trigger).toHaveAttribute("aria-expanded", "false");
        await expect(dialog.getByRole("button", { name: "Crear sede", exact: true })).toHaveCount(1);
        await trigger.focus();
        await page.keyboard.press("Tab");
        await expect(dialog.getByLabel("Cliente", { exact: true })).toBeFocused();
        await page.keyboard.press("Shift+Tab");
        await expect(trigger).toBeFocused();
        const computed = await trigger.evaluate((element) => {
          const css = getComputedStyle(element),
            rect = element.getBoundingClientRect();
          return {
            width: rect.width,
            height: rect.height,
            border: css.borderTopWidth,
            borderStyle: css.borderTopStyle,
            outline: css.outlineStyle,
            outlineWidth: css.outlineWidth,
            color: css.color,
            background: css.backgroundColor,
          };
        });
        assert.equal(computed.border, "1px");
        assert.equal(computed.borderStyle, "solid");
        assert.notEqual(computed.outline, "none");
        if (width === 390) assert.ok(computed.height >= 44 && computed.width >= 44);
        measurements.push({ width, theme, ...computed });
        await page.screenshot({
          path: join(server.evidence, `nqp19-${width}-${theme}-closed.png`),
          animations: "disabled",
        });
        await page.keyboard.press("Enter");
        await expect(trigger).toHaveAttribute("aria-expanded", "true");
        await expect(trigger).toHaveAttribute("aria-controls", "sale-quick-create");
        await expect(dialog.locator("#sale-quick-create")).toBeVisible();
        await expect(trigger).toBeFocused();
        await input.fill("Alta sintética cancelada");
        await page.screenshot({
          path: join(server.evidence, `nqp19-${width}-${theme}-open.png`),
          animations: "disabled",
        });
        await trigger.focus();
        await page.keyboard.press("Space");
        await expect(input).toHaveCount(0);
        await expect(trigger).toBeFocused();
        if (width === 390) await trigger.tap();
        else await trigger.click();
        await input.fill("Otro intento cancelado");
        await dialog.getByRole("button", { name: "Cancelar creación", exact: true }).click();
        await expect(input).toHaveCount(0);
        await expect(trigger).toBeFocused();
        // The footer deliberately bleeds into modal padding; measure the affected client region.
        assert.ok(await dialog.locator(".sale-client").evaluate((e) => e.scrollWidth <= e.clientWidth));
        assert.ok(await page.locator(".modal-body").evaluate((e) => e.scrollWidth <= e.clientWidth));
      }
    }
    assert.deepEqual(await state(), before, "Abrir/colapsar/cancelar no escribe ni altera auditoría");
    const selectedBefore = await dialog.getByLabel("Cliente", { exact: true }).inputValue();
    await trigger.click();
    await input.fill("Cliente único sintético NQP19");
    const pending = page.waitForResponse(
      (r) => r.url().endsWith("/api/command") && r.request().postDataJSON()?.type === "CUSTOMER_SAVE",
    );
    await dialog.getByRole("button", { name: "Guardar cliente", exact: true }).click();
    const response = await pending;
    assert.equal(response.status(), 200, await response.text());
    const saved = await response.json();
    const payload = response.request().postDataJSON().payload;
    assert.equal(payload.name, "Cliente único sintético NQP19");
    assert.equal(payload.is_active, true);
    assert.equal(payload.confirm_duplicate, false);
    await expect(dialog.getByLabel("Cliente", { exact: true })).toHaveValue(saved.result);
    await expect(dialog.getByLabel("Cliente", { exact: true })).toBeFocused();
    assert.notEqual(saved.result, selectedBefore);
    const after = await state();
    for (const key of Object.keys(before))
      if (!["customers", "audit", "revision"].includes(key)) assert.deepEqual(after[key], before[key], key);
    const names = await dialog.getByLabel("Cliente", { exact: true }).locator("option").allTextContents();
    assert.ok(names.includes("Cliente único sintético NQP19"));
    writeFileSync(join(server.evidence, "nqp19-measurements.json"), JSON.stringify(measurements, null, 2));
    for (const role of ["OPERATOR", "VIEWER"]) {
      const login = "nqp19-" + role,
        password = randomUUID() + randomUUID();
      await command("USER_SAVE", { id: login, name: role + " sintético", role });
      const credentials = await context.request.post(server.baseURL + "/api/auth/credentials", {
        headers: { Origin: server.baseURL, "X-CSRF-Token": session.csrf_token },
        data: { user_id: login, login, password },
      });
      assert.equal(credentials.status(), 200);
      const account = await browser.newContext();
      await account.request.post(server.baseURL + "/api/auth/login", {
        headers: { Origin: server.baseURL },
        data: { login, password },
      });
      const actorSession = await (await account.request.get(server.baseURL + "/api/auth/session")).json();
      const actorPage = await account.newPage();
      await actorPage.goto(server.baseURL + "/#sales");
      await expect(actorPage.locator(".sidebar-footer")).toBeVisible();
      const newSale = actorPage.getByRole("button", { name: "Nueva venta", exact: true });
      await expect(newSale).toHaveCount(role === "VIEWER" ? 0 : 1);
      const snapshot = await state();
      if (role === "OPERATOR") {
        await newSale.click();
        await actorPage.getByRole("button", { name: "Crear nuevo cliente", exact: true }).click();
        await actorPage
          .getByLabel("Nombre del nuevo cliente", { exact: true })
          .fill("Operador sintético NQP19");
        await actorPage.getByRole("button", { name: "Guardar cliente", exact: true }).click();
        await expect(
          actorPage
            .getByRole("dialog", { name: "Nueva venta", exact: true })
            .getByLabel("Cliente", { exact: true })
            .locator("option:checked"),
        ).toHaveText("Operador sintético NQP19");
      } else {
        const rejected = await account.request.post(server.baseURL + "/api/command", {
          headers: { Origin: server.baseURL, "X-CSRF-Token": actorSession.csrf_token },
          data: {
            type: "CUSTOMER_SAVE",
            payload: { name: "Rechazado sintético NQP19" },
            request_id: randomUUID(),
          },
        });
        assert.equal(rejected.status(), 403);
        assert.deepEqual(await state(), snapshot);
      }
      await account.close();
    }
    assert.deepEqual(errors, []);
    console.log("NQP26-19 evidence: " + server.evidence);
  },
);
