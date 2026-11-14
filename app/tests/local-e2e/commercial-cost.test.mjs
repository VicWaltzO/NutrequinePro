import { test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { chromium, expect } from "playwright/test";
import { localAppFixture } from "../helpers/local-app-server.mjs";
import { fixture } from "../helpers/commercial-cost-fixture.mjs";
import { openSqliteDatabase } from "../../lib/adapters/node-sqlite.mjs";
import { createStore } from "../../lib/application-store.mjs";
import {
  commercialCosts,
  costMoney,
  saleCommercialCost,
} from "../../features/inventario/domain/commercial-cost.mjs";
test(
  "NQP33 E2E operación abierta, reconocer, liquidar, retorno, ajuste, replay y vistas",
  { timeout: 240000 },
  async (t) => {
    const f = await localAppFixture();
    t.after(f.stop);
    console.log("NQP33 evidence: " + f.evidence);
    await f.stop();
    const db = openSqliteDatabase(f.database),
      store = createStore(() => db),
      before = await store.loadState(),
      synthetic = fixture();
    synthetic.users.push(...before.users);
    await store.persistState(before, synthetic);
    db.close();
    await f.start();
    const browser = await chromium.launch({ channel: process.env.REGRESSION_BROWSER_CHANNEL || undefined });
    t.after(() => browser.close());
    const context = await browser.newContext({ viewport: { width: 1440, height: 1050 }, locale: "es-PE" }),
      page = await context.newPage(),
      errors = [];
    page.on("pageerror", (e) => errors.push(e.message));

    const login = await context.request.post(f.baseURL + "/api/auth/login", {
      headers: { Origin: f.baseURL },
      data: { login: "admin.local", password: f.password },
    });
    assert.equal(login.status(), 200);
    const csrf = (await login.json()).csrf_token;
    const state = async () => (await (await context.request.get(f.baseURL + "/api/state")).json()).state;
    const run = async (type, payload) => {
      const r = await context.request.post(f.baseURL + "/api/command", {
        headers: { Origin: f.baseURL, "X-CSRF-Token": csrf },
        data: { type, payload, request_id: crypto.randomUUID() },
      });
      const body = await r.json();
      assert.equal(r.status(), 200, JSON.stringify(body));
      return body;
    };
    const go = async () => {
      await page.goto(f.baseURL + "/#inventory/valuation");
      await page.reload();
      await expect(page.getByRole("heading", { name: "Valoración comercial", exact: true })).toBeVisible();
    };
    await go();
    let form = page.getByRole("form", { name: "Registrar valoración comercial" });
    await form.getByLabel("Motivo de valoración", { exact: true }).fill("Inicio sintético");
    await form.getByRole("button", { name: "Iniciar valoración comercial", exact: true }).click();
    await expect(form.getByLabel("Acción económica")).toBeVisible();
    for (const q of [10, 20])
      await run("INVENTORY_ADJUST", {
        product_id: "prod-1",
        direction: "IN",
        quantity: q,
        weight_kg: q * 25,
        date: "2026-11-14",
        reason: "Entrada sintética",
      });
    await page.reload();
    const recognize = async (target, amount, lost = false) => {
      await go();
      form = page.getByRole("form", { name: "Registrar valoración comercial" });
      await form.getByLabel("Entrada pendiente", { exact: true }).selectOption(target);
      await form.getByLabel("Costo total reconocido S/", { exact: true }).fill(amount);
      await form.getByLabel("Referencia documental", { exact: true }).fill("DOC sintético");
      await form.getByLabel("Motivo de valoración", { exact: true }).fill("Aprobación sintética");
      if (lost) {
        let once = false;
        await page.route("**/api/command", async (route) => {
          if (route.request().postDataJSON()?.type === "COST_RECOGNIZE" && !once) {
            once = true;
            assert.equal((await route.fetch()).status(), 200);
            await route.abort("failed");
          } else await route.continue();
        });
      }
      assert.equal(await form.evaluate((el) => el.checkValidity()), true);
      await form.getByRole("button", { name: "Reconocer costo", exact: true }).click();
      if (lost) {
        await expect(form.getByRole("button", { name: "Reintentar valoración", exact: true })).toBeVisible();
        await form.getByRole("button", { name: "Reintentar valoración", exact: true }).click();
        await page.unroute("**/api/command");
      }
      await expect(form.getByLabel("Referencia documental", { exact: true })).toHaveValue("");
      assert.equal(
        commercialCosts(await state()).flows.find((f) => f.id === target).recognized,
        true,
        "Reconocimiento persistido",
      );
    };
    let s = await state(),
      flows = commercialCosts(s).flows;
    await recognize(flows[0].id, "1000", true);
    const sale = await run("SALE_SAVE", {
      customer_id: "cost-customer",
      site_id: "site-1",
      sale_date: "2026-11-14",
      payment_condition: "CREDIT",
      deliver: true,
      items: [{ product_id: "prod-1", quantity: 5, unit_weight_kg: 25, unit_price: 200 }],
    });
    s = await state();
    const saleId = sale.result,
      code = s.sales.find((v) => v.id === saleId).code;
    assert.equal(saleCommercialCost(s, saleId).status, "PENDING");
    await page.goto(f.baseURL + "/#sales");
    await page.reload();
    await page.getByRole("button", { name: code, exact: true }).click();
    await expect(page.getByRole("region", { name: "Costo histórico comercial" })).toContainText(
      "Costo y margen pendientes",
    );
    await page.keyboard.press("Escape");
    await recognize(flows[1].id, "3200");
    s = await state();
    assert.equal(saleCommercialCost(s, saleId).status, "PENDING");
    const protectedSales = JSON.stringify(s.sales),
      protectedMoves = JSON.stringify(s.inventoryMovements);
    await go();
    form = page.getByRole("form", { name: "Registrar valoración comercial" });
    await form.getByLabel("Acción económica").selectOption("COST_SETTLE");
    await form.getByLabel("Referencia documental", { exact: true }).fill("Liquidación DOC");
    await form.getByLabel(/Confirmo que todos/).check();
    await form.getByLabel("Motivo de valoración", { exact: true }).fill("Liquidar sintético");
    await form.getByLabel("Motivo de valoración", { exact: true }).focus();
    await page.keyboard.press("Tab");
    assert.notEqual(await page.evaluate(() => document.activeElement?.tagName), "BODY");
    for (const width of [1440, 390])
      for (const theme of ["light", "dark"]) {
        await page.setViewportSize({ width, height: 1000 });
        await page.evaluate((v) => (document.documentElement.dataset.theme = v), theme);
        await form.scrollIntoViewIfNeeded();
        await page.screenshot({ path: join(f.evidence, `valuation-${width}-${theme}.png`), fullPage: true });
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      }
    await form.getByRole("button", { name: "Liquidar pendientes", exact: true }).click();
    await expect(form.getByLabel("Referencia documental", { exact: true })).toHaveValue("");
    s = await state();
    assert.equal(costMoney(saleCommercialCost(s, saleId).cost), 70000);
    assert.equal(costMoney(commercialCosts(s).groups[0].value), 350000);
    assert.equal(JSON.stringify(s.sales), protectedSales);
    assert.equal(JSON.stringify(s.inventoryMovements), protectedMoves);
    await page.setViewportSize({ width: 1440, height: 1050 });
    await page.goto(f.baseURL + "/#sales");
    await page.reload();
    await page.getByRole("button", { name: code, exact: true }).click();
    await expect(page.getByRole("region", { name: "Costo histórico comercial" })).toContainText(
      "Costo reconocido:",
    );
    await page.keyboard.press("Escape");
    await run("RETURN_CREATE", {
      sale_id: saleId,
      return_date: "2026-11-14",
      reason: "Retorno",
      economic_amount: 0,
      items: [
        { sale_item_id: s.saleItems.find((i) => i.sale_id === saleId && i.is_current).id, quantity: 2 },
      ],
    });
    s = await state();
    assert.equal(costMoney(saleCommercialCost(s, saleId).cost), 42000);
    await go();
    form = page.getByRole("form", { name: "Registrar valoración comercial" });
    await form.getByLabel("Acción económica").selectOption("COST_ADJUST");
    await form.getByLabel("Existencias a ajustar").selectOption(commercialCosts(s).groups[0].key);
    await form.getByLabel("Importe del ajuste S/").fill("27");
    await form.getByLabel("Referencia documental", { exact: true }).fill("Ajuste DOC");
    await form.getByLabel("Motivo de valoración", { exact: true }).fill("Nuevo valor de existencias");
    await form.getByRole("button", { name: "Registrar ajuste de valor", exact: true }).click();
    await expect(form.getByLabel("Referencia documental", { exact: true })).toHaveValue("");
    s = await state();
    assert.equal(costMoney(saleCommercialCost(s, saleId).cost), 42000);
    await page.getByText("Historial de valoración", { exact: true }).click();
    await expect(page.getByRole("region", { name: "Valoración comercial", exact: true })).toContainText(
      "Ajuste DOC",
    );
    await page.screenshot({ path: join(f.evidence, "valuation-history.png"), fullPage: true });
    assert.deepEqual(errors, []);
  },
);
