import { test } from "node:test";
import assert from "node:assert/strict";
import { chromium, expect } from "playwright/test";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { localAppFixture } from "../helpers/local-app-server.mjs";
import { cashCreditScenario, salePayload } from "../helpers/regression-scenarios.mjs";
import { customerProfile } from "../../features/clientes/domain/profile.mjs";

test(
  "navegación y clientes: movimiento, historial, filtros, sedes atómicas y persistencia offline",
  { timeout: 240000 },
  async (t) => {
    const server = await localAppFixture({ development: process.env.UI_REVIEW_DEV === "1" });
    t.after(server.stop);
    const browser = await chromium.launch({ channel: process.env.REGRESSION_BROWSER_CHANNEL || undefined });
    t.after(() => browser.close());
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: "es-PE" });
    const external = [];
    await context.route("**/*", (route) => {
      if (new URL(route.request().url()).origin === server.baseURL) return route.continue();
      external.push(route.request().url());
      return route.abort();
    });
    const page = await context.newPage();
    await page.addInitScript(() => {
      window.subtabAnimations = [];
      const animate = Element.prototype.animate;
      Element.prototype.animate = function (frames, options) {
        if (this.classList.contains("subtab-content"))
          window.subtabAnimations.push({ frames, duration: options.duration });
        return animate.call(this, frames, options);
      };
    });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(server.baseURL);
    await page.getByLabel("Usuario", { exact: true }).fill("admin.local");
    await page.getByLabel("Contraseña", { exact: true }).fill(server.password);
    await page.getByRole("button", { name: "Entrar", exact: true }).click();
    await expect(page.locator(".sidebar-footer")).toBeVisible();
    const session = await (await context.request.get(server.baseURL + "/api/auth/session")).json();
    const run = async (type, payload, requestId = randomUUID()) => {
      const response = await context.request.post(server.baseURL + "/api/command", {
        headers: { Origin: server.baseURL, "X-CSRF-Token": session.csrf_token },
        data: { type, payload, request_id: requestId },
      });
      const body = await response.json();
      assert.equal(response.status(), 200, body.error ?? type);
      return body.result;
    };
    const state = async () => (await (await context.request.get(server.baseURL + "/api/state")).json()).state;
    const scenario = await cashCreditScenario({ run, state });
    const emptyCustomer = await run("CUSTOMER_SAVE", { name: "Cliente sin actividad sintético" });
    await run("SALE_SAVE", salePayload(scenario.customer, { confirm: false }));
    await run("PAYMENT_REVERSE", {
      id: scenario.payment,
      date: "2026-10-16",
      reason: "Reversión sintética de navegación",
    });
    let current = await state();
    await run("RETURN_CREATE", {
      sale_id: scenario.firstSale,
      return_date: "2026-10-17",
      reason: "Devolución sintética de navegación",
      economic_amount: "73.01",
      items: [
        { sale_item_id: current.saleItems.find((row) => row.sale_id === scenario.firstSale).id, quantity: 1 },
      ],
    });
    await page.reload();
    await expect(page.locator(".sidebar-footer")).toBeVisible();
    const navigate = async (route) => {
      await page.evaluate((hash) => {
        location.hash = hash;
      }, route);
      const headings = {
        sales: "Ventas",
        collections: "Cobranza",
        productions: "Producción",
        inventory: "Inventario",
        customers: "Clientes",
        config: "Configuración",
      };
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(headings[route]);
    };
    const settle = async () =>
      page.locator("main .subtab-content").evaluate(async (node) => {
        // Let the selected tab commit before collecting its running animations.
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        await Promise.all(node.getAnimations().map((animation) => animation.finished.catch(() => {})));
      });
    const capture = async (name) => {
      await page.screenshot({
        path: join(server.evidence, name + ".png"),
        fullPage: true,
        animations: "disabled",
      });
    };

    for (const route of ["sales", "collections", "productions", "inventory", "customers", "config"]) {
      await navigate(route);
      const buttons = page.locator("main .tabs button");
      const count = await buttons.count();
      for (const index of [...Array(count).keys()].slice(1).concat([...Array(count - 1).keys()].reverse())) {
        const before = await page.evaluate(() => window.subtabAnimations.length);
        await buttons.nth(index).click();
        await expect(buttons.nth(index)).toHaveAttribute("aria-current", "page");
        await expect.poll(() => page.evaluate(() => window.subtabAnimations.length)).toBe(before + 1);
        const frames = await page.evaluate((before) => window.subtabAnimations.slice(before), before);
        assert.equal(frames.length, 1, route + " must animate exactly one content node");
        assert.equal(frames[0].duration, 440);
        assert.match(frames[0].frames[0].transform, /translateX\(-?16px\)/);
        await settle();
      }
    }
    await navigate("sales");
    const search = page.getByRole("textbox", { name: "Buscar registros", exact: true });
    await search.fill("portable");
    await search.evaluate((node) => {
      node.dataset.preserved = "yes";
    });
    await page.getByLabel("Desde", { exact: true }).fill("2026-10-01");
    await page.getByLabel("Estado", { exact: true }).selectOption("CONFIRMED");
    await page.getByRole("button", { name: "Ventas futuras", exact: true }).click();
    await expect(search).toHaveValue("portable");
    await expect(search).toHaveAttribute("data-preserved", "yes");
    await expect(page.getByLabel("Desde", { exact: true })).toHaveValue("2026-10-01");
    await expect(page.getByLabel("Estado", { exact: true })).toHaveValue("CONFIRMED");
    await settle();
    await search.fill("port");
    const animationsBeforeData = await page.evaluate(() => window.subtabAnimations.length);
    await page.getByRole("button", { name: "Actualizar datos", exact: true }).click();
    await page.getByRole("button", { name: "Ventas futuras", exact: true }).click();
    await settle();
    assert.equal(await page.evaluate(() => window.subtabAnimations.length), animationsBeforeData);
    assert.equal(
      await page.locator("main .subtab-content").evaluate((node) => node.getAnimations().length),
      0,
    );
    await page.getByRole("button", { name: "Borradores", exact: true }).click();
    await settle();
    const animationsBeforeBack = await page.evaluate(() => window.subtabAnimations.length);
    await page.goBack();
    await expect(page.locator('main .tabs [aria-current="page"]')).toHaveText("Ventas futuras");
    // aria-current can render before the content transition commits.
    await expect
      .poll(() => page.evaluate(() => window.subtabAnimations.length))
      .toBe(animationsBeforeBack + 1);
    const backward = await page.evaluate(
      (index) => window.subtabAnimations[index].frames[0].transform,
      animationsBeforeBack,
    );
    assert.equal(backward, "translateX(-16px)");
    await settle();
    await page.goForward();
    await expect(page.locator('main .tabs [aria-current="page"]')).toHaveText("Borradores");
    await settle();
    await page.locator("main .tabs").evaluate((node) => {
      const buttons = node.querySelectorAll("button");
      buttons[1].click();
      buttons[4].click();
      buttons[5].click();
    });
    await expect(page.locator('main .tabs [aria-current="page"]')).toHaveText("Anulaciones");
    assert.equal(await page.locator("main .subtab-content").count(), 1);
    await settle();
    const history = page.getByRole("button", { name: "Historial", exact: true });
    await history.focus();
    await page.keyboard.press("Enter");
    await expect(history).toBeFocused();
    await settle();
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.getByRole("button", { name: "Borradores", exact: true }).click();
    await expect
      .poll(() => page.locator("main .subtab-content").evaluate((node) => node.getAnimations().length))
      .toBe(0);
    assert.equal(
      await page.locator("main .tab-indicator").evaluate((node) => getComputedStyle(node).transitionDuration),
      "0s",
    );
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.getByRole("button", { name: "Historial", exact: true }).click();
    await page.emulateMedia({ reducedMotion: "reduce" });
    await expect
      .poll(() => page.locator("main .subtab-content").evaluate((node) => node.getAnimations().length))
      .toBe(0);
    await page.emulateMedia({ reducedMotion: "no-preference" });

    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole("button", { name: "Anulaciones", exact: true }).click();
    await expect(page.locator('main .tabs [aria-current="page"]')).toHaveText("Anulaciones");
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await settle();
    const activeBox = await page.locator('main .tabs [aria-current="page"]').boundingBox();
    assert.ok(activeBox && activeBox.x >= 0 && activeBox.x + activeBox.width <= 390);
    await page.setViewportSize({ width: 1440, height: 1000 });
    await navigate("customers");
    await page.getByRole("button", { name: "Cliente escenario portable", exact: true }).click();
    const dialog = page.getByRole("dialog");
    const profileTabs = dialog.locator(".tabs");
    current = await state();
    const expected = customerProfile(current, scenario.customer);
    await expect(dialog.locator(".customer-metrics dd").nth(4)).toHaveText(String(expected.count));
    const periodTotal = dialog.locator(".customer-summary p strong").first();
    const unfilteredTotal = await periodTotal.textContent();
    assert.ok(expected.sold > 0);
    for (const status of ["DRAFT", "CANCELLED", "CONFIRMED", "RECTIFIED"]) {
      await profileTabs.getByRole("button", { name: "Ventas", exact: true }).click();
      await dialog.getByLabel("Estado comercial", { exact: true }).selectOption(status);
      if (["DRAFT", "CANCELLED"].includes(status)) {
        await expect(dialog.getByRole("region", { name: "Ventas del cliente" })).toContainText(
          "0 ventas efectivas",
        );
      }
      await profileTabs.getByRole("button", { name: "Resumen", exact: true }).click();
      await expect(dialog.getByLabel("Estado comercial", { exact: true })).toHaveCount(0);
      await expect(periodTotal).toHaveText(unfilteredTotal);
      await expect(
        dialog.getByText("No hay actividad en el periodo seleccionado.", { exact: true }),
      ).toHaveCount(0);
    }
    await dialog.getByLabel("Desde", { exact: true }).fill("2026-11-01");
    await expect(periodTotal).not.toHaveText(unfilteredTotal);
    await expect(
      dialog.getByText("No hay actividad en el periodo seleccionado.", { exact: true }),
    ).toBeVisible();
    await dialog.getByLabel("Desde", { exact: true }).fill("");
    await expect(periodTotal).toHaveText(unfilteredTotal);
    await profileTabs.getByRole("button", { name: "Cobros y aplicaciones", exact: true }).click();
    await expect(dialog.getByRole("cell", { name: /^Revertido · aplicaciones sin efecto/ })).toBeVisible();
    assert.equal(await dialog.locator("tbody tr").count(), 1);
    await profileTabs.getByRole("button", { name: "Actividad", exact: true }).click();
    await expect(dialog.getByText("Devolución sintética de navegación", { exact: true })).toBeVisible();
    await dialog.getByLabel("Desde", { exact: true }).fill("2026-11-01");
    await expect(
      dialog.getByText("No hay actividad en el periodo seleccionado.", { exact: true }),
    ).toBeVisible();
    await dialog.getByLabel("Desde", { exact: true }).fill("");

    await profileTabs.getByRole("button", { name: "Sedes", exact: true }).click();
    await dialog.getByRole("button", { name: "Agregar sede", exact: true }).click();
    await dialog.getByRole("button", { name: "Vincular sede existente", exact: true }).click();
    const existing = current.sites.find((site) => site.is_active);
    await dialog.getByLabel("Buscar sede existente", { exact: true }).fill(existing.name);
    await dialog.getByRole("checkbox", { name: existing.name, exact: true }).check();
    await dialog.getByRole("button", { name: "Crear sede nueva", exact: true }).click();
    await dialog
      .getByLabel("Nombre de la nueva sede", { exact: true })
      .fill("  " + existing.name.toUpperCase() + "  ");
    await expect(
      dialog.getByRole("button", { name: "Preparar sede para guardar", exact: true }),
    ).toBeDisabled();
    await dialog.getByLabel("Nombre de la nueva sede", { exact: true }).fill("Sede contextual sintética");
    await dialog.getByRole("button", { name: "Preparar sede para guardar", exact: true }).click();
    await dialog.getByLabel("Sede principal", { exact: true }).selectOption("new:0");
    // Switching profile sections preserves the in-progress sites form.
    await profileTabs.getByRole("button", { name: "Resumen", exact: true }).click();
    await profileTabs.getByRole("button", { name: "Sedes", exact: true }).click();
    await expect(dialog.getByLabel("Sede principal", { exact: true })).toHaveValue("new:0");
    const saveResponse = page.waitForResponse(
      (response) =>
        response.url().endsWith("/api/command") &&
        response.request().postDataJSON().type === "CUSTOMER_SITES_SAVE",
    );
    await dialog.getByRole("button", { name: "Guardar sedes", exact: true }).click();
    assert.equal((await saveResponse).status(), 200);
    await expect(dialog.getByText("Sede contextual sintética · Principal", { exact: true })).toBeVisible();
    current = await state();
    const newSite = current.sites.find((site) => site.name === "Sede contextual sintética");
    assert.ok(newSite);
    await run("CUSTOMER_SITES_SAVE", {
      id: emptyCustomer,
      site_ids: [existing.id, newSite.id],
      default_site_id: existing.id,
    });
    assert.equal(
      (await state()).customerSites.find((link) => link.customer_id === scenario.customer && link.is_default)
        .site_id,
      newSite.id,
    );

    for (const theme of ["light", "dark"]) {
      if ((await page.locator("html").getAttribute("data-theme")) !== theme) {
        await dialog.getByRole("button", { name: "Cerrar", exact: true }).click();
        await page
          .getByRole("button", {
            name: theme === "dark" ? "Activar modo oscuro" : "Activar modo claro",
            exact: true,
          })
          .click();
        await page.getByRole("button", { name: "Cliente escenario portable", exact: true }).click();
      }
      await profileTabs.getByRole("button", { name: "Resumen", exact: true }).click();
      await capture("profile-desktop-" + theme);
      await profileTabs.getByRole("button", { name: "Sedes", exact: true }).click();
      await capture("sites-desktop-" + theme);
      await page.setViewportSize({ width: 390, height: 844 });
      await capture("profile-mobile-" + theme);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      await page.setViewportSize({ width: 1440, height: 1000 });
    }
    await dialog.getByRole("button", { name: "Cerrar", exact: true }).click();
    await capture("customers-desktop-dark");
    await page
      .getByRole("button", { name: "Nueva sede", exact: true })
      .count()
      .then((count) => assert.equal(count, 0));
    await page.getByRole("button", { name: "Sedes", exact: true }).click();
    await expect(page.getByRole("button", { name: "Nueva sede", exact: true })).toBeVisible();
    await navigate("sales");
    await capture("navigation-desktop-dark");
    await page.getByRole("button", { name: "Nueva venta", exact: true }).click();
    await dialog.getByLabel("Cliente", { exact: true }).selectOption(scenario.customer);
    await expect(dialog.getByLabel("Sede destino", { exact: true })).toHaveValue(newSite.id);
    await dialog.getByRole("button", { name: "Cerrar", exact: true }).click();
    await expect(dialog).not.toBeVisible();

    await navigate("customers");
    await page.getByRole("textbox", { name: "Buscar clientes o sedes", exact: true }).fill("");
    await page.getByRole("button", { name: "Nuevo cliente", exact: true }).click();
    await dialog.getByLabel("Nombre", { exact: true }).fill("Cliente contextual nuevo sintético");
    await dialog.getByLabel("Teléfono", { exact: true }).fill("000000000");
    await dialog.getByRole("button", { name: "Crear sede nueva", exact: true }).click();
    await dialog
      .getByLabel("Nombre de la nueva sede", { exact: true })
      .fill("Sede del nuevo cliente sintético");
    await dialog.getByRole("button", { name: "Preparar sede para guardar", exact: true }).click();
    await expect(dialog.getByLabel("Nombre", { exact: true })).toHaveValue(
      "Cliente contextual nuevo sintético",
    );
    await expect(dialog.getByLabel("Teléfono", { exact: true })).toHaveValue("000000000");
    const createdResponse = page.waitForResponse(
      (response) =>
        response.url().endsWith("/api/command") && response.request().postDataJSON().type === "CUSTOMER_SAVE",
    );
    await dialog.getByRole("button", { name: "Guardar", exact: true }).click();
    const createdBody = await (await createdResponse).json();
    await expect(dialog).not.toBeVisible();
    assert.ok(createdBody.state.customers.some((row) => row.name === "Cliente contextual nuevo sintético"));
    await page.getByRole("textbox", { name: "Buscar clientes o sedes", exact: true }).fill("");
    await expect(
      page.getByRole("button", { name: "Cliente contextual nuevo sintético", exact: true }),
    ).toBeVisible();
    const saved = await state();
    await server.stop();
    await server.start();
    await page.reload();
    await expect(page.locator(".sidebar-footer")).toBeVisible();
    assert.deepEqual(await state(), saved);
    assert.deepEqual(errors, []);
    assert.deepEqual(external, []);
    console.log("Navigation/customer evidence: " + server.evidence);
  },
);

test(
  "clientes: permisos HTTP y de interfaz para VIEWER y OPERATOR, y fallo atómico del vínculo",
  { timeout: 120000 },
  async (t) => {
    const server = await localAppFixture({ development: process.env.UI_REVIEW_DEV === "1" });
    t.after(server.stop);
    const browser = await chromium.launch({ channel: process.env.REGRESSION_BROWSER_CHANNEL || undefined });
    t.after(() => browser.close());
    const admin = await browser.newContext();
    const response = await admin.request.post(server.baseURL + "/api/auth/login", {
      headers: { Origin: server.baseURL },
      data: { login: "admin.local", password: server.password },
    });
    const csrf = (await response.json()).csrf_token;
    const command = async (type, payload) => {
      const response = await admin.request.post(server.baseURL + "/api/command", {
        headers: { Origin: server.baseURL, "X-CSRF-Token": csrf },
        data: { type, payload, request_id: randomUUID() },
      });
      assert.equal(response.status(), 200);
      return (await response.json()).result;
    };
    const customer = await command("CUSTOMER_SAVE", { name: "Cliente de permisos sintético" });
    for (const role of ["VIEWER", "OPERATOR"]) {
      const user = "navigation-" + role;
      const password = randomUUID() + randomUUID();
      await command("USER_SAVE", { id: user, name: role + " sintético", role });
      const credential = await admin.request.post(server.baseURL + "/api/auth/credentials", {
        headers: { Origin: server.baseURL, "X-CSRF-Token": csrf },
        data: { user_id: user, login: user, password },
      });
      assert.equal(credential.status(), 200);
      const account = await browser.newContext();
      const page = await account.newPage();
      await page.goto(server.baseURL);
      await page.getByLabel("Usuario", { exact: true }).fill(user);
      await page.getByLabel("Contraseña", { exact: true }).fill(password);
      await page.getByRole("button", { name: "Entrar", exact: true }).click();
      await page.locator("nav").getByRole("button", { name: "Clientes", exact: true }).click();
      await page.getByRole("button", { name: "Cliente de permisos sintético", exact: true }).click();
      const dialog = page.getByRole("dialog");
      await dialog.getByRole("button", { name: "Sedes", exact: true }).click();
      assert.equal(
        await dialog.getByRole("button", { name: "Agregar sede", exact: true }).count(),
        role === "VIEWER" ? 0 : 1,
      );
      const session = await (await account.request.get(server.baseURL + "/api/auth/session")).json();
      const send = (payload) =>
        account.request.post(server.baseURL + "/api/command", {
          headers: { Origin: server.baseURL, "X-CSRF-Token": session.csrf_token },
          data: { type: "CUSTOMER_SITES_SAVE", payload, request_id: randomUUID() },
        });
      const before = (await (await account.request.get(server.baseURL + "/api/state")).json()).state;
      if (role === "VIEWER") {
        assert.equal(
          (await send({ id: customer, site_ids: [], new_sites: ["Sede no autorizada sintética"] })).status(),
          403,
        );
      } else {
        const result = await send({
          id: customer,
          site_ids: [],
          new_sites: ["Sede transitoria sintética"],
          default_site_id: "missing",
        });
        assert.equal(result.status(), 422);
      }
      assert.deepEqual(
        (await (await account.request.get(server.baseURL + "/api/state")).json()).state,
        before,
      );
      if (role === "OPERATOR") {
        const result = await send({ id: customer, site_ids: [], new_sites: ["Sede de operador sintética"] });
        assert.equal(result.status(), 200);
        await page.reload();
        await page.getByRole("button", { name: "Cliente de permisos sintético", exact: true }).click();
        await dialog.getByRole("button", { name: "Sedes", exact: true }).click();
        await expect(
          dialog.getByText("Sede de operador sintética · Principal", { exact: true }),
        ).toBeVisible();
      }
      await account.close();
    }
  },
);
