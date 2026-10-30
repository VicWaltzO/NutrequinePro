import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { writeFileSync } from "node:fs";
import { chromium, expect } from "playwright/test";
import { localAppFixture } from "../helpers/local-app-server.mjs";
import { cashCreditScenario, salePayload, productionPayload } from "../helpers/regression-scenarios.mjs";
import { saleSummary, productionSummary } from "../../lib/domain.mjs";

// Real browser/HTTP/SQLite; sorting itself must never emit a command.
test(
  "NQP12 global: áreas, detalles, formularios, teclado, temas y roles sin escritura al ordenar",
  { timeout: 360000 },
  async (t) => {
    const server = await localAppFixture();
    t.after(server.stop);
    const browser = await chromium.launch({ channel: process.env.REGRESSION_BROWSER_CHANNEL || undefined });
    t.after(() => browser.close());
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: "es-PE" });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(server.baseURL);
    await page.getByLabel("Usuario", { exact: true }).fill("admin.local");
    await page.getByLabel("Contraseña", { exact: true }).fill(server.password);
    await page.getByRole("button", { name: "Entrar", exact: true }).click();
    await page.locator("main").waitFor();
    const csrf = (await (await context.request.get(server.baseURL + "/api/auth/session")).json()).csrf_token;
    const run = async (type, payload, requestId = randomUUID()) => {
      const response = await context.request.post(server.baseURL + "/api/command", {
        headers: { Origin: server.baseURL, "X-CSRF-Token": csrf },
        data: { type, payload, request_id: requestId },
      });
      const body = await response.json();
      assert.equal(response.status(), 200, JSON.stringify(body));
      return body.result;
    };
    const state = async () => (await (await context.request.get(server.baseURL + "/api/state")).json()).state;
    const scenario = await cashCreditScenario({ run, state });
    const production = await run(
      "PRODUCTION_SAVE",
      productionPayload({
        products: [
          { product_id: "prod-1", nuclei_count: 1.25 },
          { product_id: "prod-2", nuclei_count: 2 },
        ],
      }),
    );
    const draftProduction = await run("PRODUCTION_SAVE", productionPayload({ confirm: false }));
    const pending = await run(
      "SALE_SAVE",
      salePayload(scenario.customer, {
        items: [
          { product_id: "prod-1", quantity: 1, unit_price: 9, unit_weight_kg: 25 },
          { product_id: "prod-2", quantity: 2, unit_price: 80, unit_weight_kg: 25 },
        ],
      }),
    );
    await run("SALE_SAVE", salePayload(scenario.customer, { confirm: false }));
    const cancelled = await run("SALE_SAVE", salePayload(scenario.customer, { confirm: false }));
    await run("SALE_CANCEL", { id: cancelled, reason: "Fixture NQP12" });
    await run("SALE_CORRECT", {
      id: pending,
      reason: "Fixture NQP12",
      items: [
        { product_id: "prod-1", quantity: 1, unit_price: 9, unit_weight_kg: 25 },
        { product_id: "prod-2", quantity: 3, unit_price: 80, unit_weight_kg: 25 },
      ],
    });
    let snapshot = await state();
    const deliveredItem = saleSummary(snapshot, { id: scenario.firstSale }).items[0];
    await run("RETURN_CREATE", {
      sale_id: scenario.firstSale,
      return_date: "2026-10-20",
      reason: "Fixture NQP12",
      economic_amount: 0,
      items: [{ sale_item_id: deliveredItem.id, quantity: 1 }],
    });
    await run("EXPENSE_CREATE", {
      date: "2026-10-20",
      category: "LOGISTICS",
      description: "Fixture NQP12",
      amount: 9,
    });
    const credit = await run("PAYMENT_CREATE", {
      customer_id: scenario.customer,
      payment_date: "2026-10-20",
      payment_method: "CASH",
      total_amount: 100,
      applications: [{ sale_id: pending, applied_amount: 9 }],
    });
    for (const [name, amount] of [
      ["Árbol 10", 100],
      ["arbol 2", 80],
      ["Cero 9", 9],
    ]) {
      const id = await run("CUSTOMER_SAVE", { name });
      await run(
        "SALE_SAVE",
        salePayload(id, {
          items: [{ product_id: "prod-1", quantity: 1, unit_price: amount, unit_weight_kg: 25 }],
        }),
      );
    }
    const accounts = [];
    for (const role of ["OPERATOR", "VIEWER"]) {
      const id = "sort-" + role,
        password = randomUUID() + randomUUID();
      await run("USER_SAVE", { id, name: role + " sintético", role });
      const r = await context.request.post(server.baseURL + "/api/auth/credentials", {
        headers: { Origin: server.baseURL, "X-CSRF-Token": csrf },
        data: { user_id: id, login: id, password },
      });
      assert.equal(r.status(), 200);
      accounts.push({ id, password, role });
    }
    snapshot = await state();
    await page.reload();
    const writes = [];
    page.on("request", (r) => {
      if (r.method() === "POST" && r.url().includes("/api/command")) writes.push(r.url());
    });
    const evidence = [];
    const go = async (route) => {
      await page.goto(server.baseURL + "/#" + route);
      await page.locator("main").waitFor();
      await page
        .locator("main")
        .evaluate((n) =>
          Promise.all(n.getAnimations({ subtree: true }).map((a) => a.finished.catch(() => {}))),
        );
    };
    const numericHeads = new Set([
      "Total",
      "Pagado",
      "Saldo",
      "Deuda",
      "Saldo a favor",
      "Monto",
      "Recibido",
      "Aplicado",
      "Disponible",
      "Aplicación",
      "Cantidad",
      "Cantidad física",
      "Cantidad comprometida",
      "Kg",
      "Kg físicos",
      "Kg / unidad",
      "Kg totales",
      "Kg comerciales",
      "Kg fórmula",
      "Kg / núcleo",
      "Kg por núcleo",
      "Precio base",
      "Precio actual S/ por kg",
      "Precio histórico",
      "Precio lista",
      "Precio aplicado",
      "Subtotal",
      "Costo consolidado",
      "Costo unitario",
      "Importe",
      "Bruto",
      "Descuento",
      "Neto teórico",
      "Cobro real",
      "Diferencia",
      "Teórico bruto",
      "Teórico neto",
      "Sacos",
      "Sacos / núcleo",
      "Kg / núcleo",
      "Núcleos",
      "Núcleos originales",
      "Versión",
      "Ventas registradas",
      "Cobros netos",
      "Reducción económica",
      "Venta (cantidad / kg)",
      "Saldo según movimientos (cantidad / kg)",
      "Faltan (cantidad / kg)",
      "Entregado",
      "Ya devuelto",
    ]);
    const numericOracle = async (table, th, heading, direction) => {
      if (!numericHeads.has(heading)) return;
      // Boolean Pagado cells (Sí/No) are tested by the typed boundary oracle.
      const index = await th.evaluate((node) => [...node.parentElement.children].indexOf(node));
      const texts = await table.locator("tbody > tr").evaluateAll(
        (rows, index) =>
          rows.map((row) => {
            const cell = row.children[index].cloneNode(true);
            cell.querySelectorAll("small").forEach((n) => n.remove());
            return cell.textContent.trim();
          }),
        index,
      );
      const values = texts.map((text) => {
        const match = text.match(/[-+]?\d[\d,]*(?:\.\d+)?/);
        return match ? Number(match[0].replaceAll(",", "")) : null;
      });
      for (let i = 1; i < values.length; i++) {
        if (values[i] === null) continue;
        assert.notEqual(values[i - 1], null, heading + ": nulos al final");
        assert.ok(
          direction === "asc" ? values[i - 1] <= values[i] : values[i - 1] >= values[i],
          heading + ": orden visible " + direction + " " + JSON.stringify(values),
        );
      }
    };
    const exercise = async (root, label, all = true) => {
      for (const details of await root.locator("details").all()) {
        if (await details.isVisible())
          await details.evaluate((n) => {
            n.open = true;
          });
      }
      const tables = root.locator("table:visible");
      let columns = 0;
      for (let ti = 0; ti < (await tables.count()); ti++) {
        const table = tables.nth(ti),
          original = await table.locator("tbody > tr").allTextContents();
        const buttons = table.locator("thead button.table-sort");
        const count = await buttons.count();
        for (let ci = 0; ci < count; ci++) {
          if (!all && ci > 0) break;
          const button = buttons.nth(ci),
            th = button.locator("..");
          const label = await button.innerText();
          await button.click();
          await expect(th).toHaveAttribute("aria-sort", "ascending");
          await numericOracle(table, th, label, "asc");
          assert.deepEqual(
            (await table.locator("tbody > tr").allTextContents()).sort(),
            [...original].sort(),
          );
          await button.focus();
          await page.keyboard.press("Enter");
          await expect(th).toHaveAttribute("aria-sort", "descending");
          await numericOracle(table, th, label, "desc");
          await expect(button).toBeFocused();
          await page.keyboard.press("Space");
          await expect(th).not.toHaveAttribute("aria-sort");
          await expect(button).toBeFocused();
          assert.deepEqual(await table.locator("tbody > tr").allTextContents(), original, label);
          columns++;
        }
      }
      evidence.push({ label, tables: await tables.count(), columns });
    };
    const routes = [
      "customers",
      "customers/sites",
      "sales",
      "sales/future",
      "sales/draft",
      "sales/cancelled",
      "sales/corrections",
      "sales/returns",
      "inventory",
      "inventory/movements",
      "productions",
      "productions/draft",
      "productions/ingredients",
      "productions/formulas",
      "collections",
      "collections/payments",
      "expenses",
      "config/products",
      "config/users",
      "config/audit",
      "balance",
      "dashboard",
    ];
    for (const route of routes) {
      await go(route);
      if (route === "dashboard") {
        assert.equal(await page.locator("main tbody tr").count(), 5);
        const codes = await page.locator("main tbody tr td:first-child button").allTextContents();
        assert.deepEqual(
          codes,
          snapshot.sales
            .slice(-5)
            .reverse()
            .map((x) => x.code),
        );
      }
      await exercise(page.locator("main"), route);
    }
    // Numeric debt has a real-world visible oracle, independently of the sort utility.
    await go("customers");
    await page.getByLabel("Buscar clientes o sedes", { exact: true }).fill("arbol");
    const debt = page.locator("main th").filter({ hasText: "Deuda" }).getByRole("button");
    await debt.click();
    const names = await page.locator("main tbody tr td:first-child").allTextContents();
    assert.ok(names[0].includes("arbol 2"));
    await debt.click();
    assert.ok((await page.locator("main tbody tr td:first-child").allTextContents())[0].includes("Árbol 10"));
    await debt.click();
    await page.getByLabel("Buscar clientes o sedes", { exact: true }).fill("");
    const dialog = page.getByRole("dialog");
    const close = async () => {
      await dialog.getByRole("button", { name: "Cerrar", exact: true }).click();
      await dialog.waitFor({ state: "hidden" });
    };
    const openRecord = async (route, id, collection) => {
      await go(route);
      await page
        .getByRole("button", { name: snapshot[collection].find((r) => r.id === id).code, exact: true })
        .first()
        .click();
      await dialog.waitFor();
    };
    await openRecord("sales", scenario.firstSale, "sales");
    await exercise(dialog, "sale-detail/return");
    await dialog.getByRole("button", { name: "Devolución", exact: true }).click();
    await exercise(dialog, "return-form");
    const returnRows = dialog.locator("tbody tr");
    const input = returnRows.first().locator("input");
    await input.fill("1");
    const selectedName = await returnRows.first().locator("td").first().innerText();
    await dialog.locator("th button").first().click();
    await expect(
      dialog
        .locator("tbody tr")
        .filter({ has: page.getByRole("cell", { name: selectedName, exact: true }) })
        .locator("input"),
    ).toHaveValue("1");
    await close();
    await openRecord("sales", pending, "sales");
    await exercise(dialog, "sale-detail/legacy/history");
    await dialog.getByRole("button", { name: "Registrar pago", exact: true }).click();
    await exercise(dialog, "payment-form");
    const apply = dialog.locator("tbody input").first();
    await apply.fill("1.23");
    const applyName = await apply.getAttribute("aria-label");
    await dialog.locator("th button").first().click();
    await expect(dialog.getByLabel(applyName, { exact: true })).toHaveValue("1.23");
    await close();
    await openRecord("collections/payments", credit, "payments");
    await exercise(dialog, "payment-detail");
    await dialog.getByRole("button", { name: "Aplicar saldo a favor a una venta", exact: true }).click();
    await exercise(dialog, "credit-form");
    await close();
    await openRecord("productions", production, "productions");
    await exercise(dialog, "production-detail");
    await dialog.getByRole("button", { name: "Rectificar cantidades", exact: true }).click();
    await exercise(dialog, "production-quantities");
    const corrected = dialog.getByLabel(/Núcleos corregidos/).first();
    await corrected.fill("3.25");
    const correctedLabel = await corrected.getAttribute("aria-label");
    const originalNuclei = await corrected.locator("..").locator("..").locator("td").nth(1).innerText();
    await dialog.locator("th button").first().click();
    await dialog.locator("th button").first().click();
    await expect(dialog.getByLabel(correctedLabel, { exact: true })).toHaveValue("3.25");
    assert.equal(
      await dialog
        .getByLabel(correctedLabel, { exact: true })
        .locator("..")
        .locator("..")
        .locator("td")
        .nth(1)
        .innerText(),
      originalNuclei,
    );
    await close();
    await openRecord("productions", production, "productions");
    await dialog.getByRole("button", { name: "Conciliar costos", exact: true }).click();
    await exercise(dialog, "reconcile-form");
    const reconcileRow = dialog.locator("tbody tr").first();
    const ingredient = await reconcileRow.locator("td").first().innerText();
    await reconcileRow.getByLabel("Cobro real", { exact: true }).fill("12.34");
    await dialog.locator("th button").first().click();
    await dialog.locator("th button").first().click();
    await expect(
      dialog
        .locator("tbody tr")
        .filter({ has: page.getByRole("cell", { name: ingredient, exact: true }) })
        .getByLabel("Cobro real", { exact: true }),
    ).toHaveValue("12.34");
    await close();
    await openRecord("productions/draft", draftProduction, "productions");
    await dialog.getByRole("button", { name: "Editar lote", exact: true }).click();
    await exercise(dialog, "production-form");
    const charge = dialog.getByLabel(/^Cobro real /).first();
    await charge.fill("12.34");
    const chargeLabel = await charge.getAttribute("aria-label");
    await dialog.locator("th button").first().click();
    await expect(dialog.getByLabel(chargeLabel, { exact: true })).toHaveValue("12.34");
    await close();
    await go("customers");
    await page.getByRole("button", { name: "Cliente escenario portable", exact: true }).click();
    await dialog.getByRole("button", { name: "Ventas", exact: true }).click();
    await exercise(dialog, "profile-sales");
    await dialog.getByRole("button", { name: "Cobros y aplicaciones", exact: true }).click();
    await exercise(dialog, "profile-payments");
    await close();
    // Both sizes and themes, all roles. The exhaustive column pass above is ADMIN.
    for (const account of [{ role: "ADMIN" }, ...accounts]) {
      let ctx = context,
        p = page;
      if (account.id) {
        ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
        p = await ctx.newPage();
        await p.goto(server.baseURL);
        await p.getByLabel("Usuario", { exact: true }).fill(account.id);
        await p.getByLabel("Contraseña", { exact: true }).fill(account.password);
        await p.getByRole("button", { name: "Entrar", exact: true }).click();
        await p.locator("main").waitFor();
      }
      for (const width of [1440, 390])
        for (const theme of ["light", "dark"]) {
          await p.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
          await p.evaluate((theme) => {
            localStorage.setItem("nutrequine-theme", theme);
            document.documentElement.dataset.theme = theme;
            window.dispatchEvent(new Event("nutrequine-theme-change"));
          }, theme);
          await p.goto(server.baseURL + "/#customers");
          await p.reload();
          await p.locator("main table").waitFor();
          await p.locator("main th button").first().click();
          await expect(p.locator("main th").first()).toHaveAttribute("aria-sort", "ascending");
          await p.screenshot({ path: join(server.evidence, `sort-${account.role}-${width}-${theme}.png`) });
        }
      if (account.id) await ctx.close();
    }
    assert.deepEqual(
      await state(),
      snapshot,
      "Sort must preserve the complete persisted state, audit, stock and revision",
    );
    assert.deepEqual(writes, []);
    assert.deepEqual(errors, []);
    // Explicit synthetic edits start only after proving that sorting emitted no writes.
    const saveForm = async (label, type) => {
      const invalid = await dialog.locator("form").evaluate((form) =>
        [...form.elements]
          .filter((field) => field.validity && !field.validity.valid)
          .map((field) => ({
            name: field.getAttribute("aria-label") ?? field.name,
            message: field.validationMessage,
          })),
      );
      assert.deepEqual(invalid, [], "Synthetic form must be valid before submission");
      const pendingResponse = page.waitForResponse(
        (r) => r.url().endsWith("/api/command") && r.request().postDataJSON()?.type === type,
      );
      await dialog.getByRole("button", { name: label, exact: true }).click();
      const response = await pendingResponse;
      assert.equal(response.status(), 200, await response.text());
      await dialog.locator("form").waitFor({ state: "hidden" });
      if (await dialog.isVisible()) await close();
      console.log("NQP12 saved synthetic form: " + type);
    };
    await openRecord("productions", production, "productions");
    await dialog.getByRole("button", { name: "Rectificar cantidades", exact: true }).click();
    const originals = productionSummary(await state(), { id: production }).products;
    const changed = originals[0];
    const changedName = snapshot.products.find((p) => p.id === changed.product_id).name;
    await dialog
      .getByLabel("Núcleos corregidos " + changedName, { exact: true })
      .fill(String(changed.nuclei_count + 0.25));
    await dialog.locator("th button").first().click();
    await dialog.locator("th button").first().click();
    await dialog.getByLabel("Motivo obligatorio", { exact: true }).fill("Rectificación sintética ordenada");
    await saveForm("Registrar rectificación", "PRODUCTION_CORRECT_QUANTITIES");
    const correctedProducts = productionSummary(await state(), { id: production }).products;
    for (const old of originals)
      assert.equal(
        correctedProducts.find((p) => p.product_id === old.product_id).nuclei_count,
        old.nuclei_count + (old.product_id === changed.product_id ? 0.25 : 0),
      );
    await openRecord("productions", production, "productions");
    await exercise(dialog, "production-history-after-quantities");
    await dialog.getByRole("button", { name: "Conciliar costos", exact: true }).click();
    const costRow = dialog.locator("tbody tr").first();
    const costName = await costRow.locator("td").first().innerText();
    await costRow.getByLabel("Cobro real", { exact: true }).fill("12.34");
    await dialog.locator("th button").first().click();
    await dialog.locator("th button").first().click();
    await saveForm("Guardar conciliación", "PRODUCTION_RECONCILE");
    const ingredientId = snapshot.ingredients.find((i) => i.name === costName).id;
    assert.equal(
      productionSummary(await state(), { id: production }).ingredients.find(
        (i) => i.ingredient_id === ingredientId,
      ).actual_charge,
      1234,
    );
    await openRecord("productions", production, "productions");
    await dialog.getByRole("button", { name: "Conciliar costos", exact: true }).click();
    await expect(
      dialog
        .locator("tbody tr")
        .filter({ has: page.getByRole("cell", { name: costName, exact: true }) })
        .getByLabel("Cobro real", { exact: true }),
    ).toHaveValue("12.34");
    await close();
    await openRecord("collections/payments", credit, "payments");
    await dialog.getByRole("button", { name: "Aplicar saldo a favor a una venta", exact: true }).click();
    const creditInput = dialog.locator("tbody input").first();
    const creditLabel = await creditInput.getAttribute("aria-label");
    const creditSale = snapshot.sales.find((x) => creditLabel === "Aplicar a " + x.code);
    const appliedBefore = (await state()).paymentApplications
      .filter((x) => x.payment_id === credit && x.sale_id === creditSale.id)
      .reduce((n, x) => n + x.applied_amount, 0);
    await creditInput.fill("1.23");
    await dialog.locator("th button").first().click();
    await dialog.locator("th button").first().click();
    await saveForm("Aplicar saldo a favor", "PAYMENT_APPLY_CREDIT");
    assert.equal(
      (await state()).paymentApplications
        .filter((x) => x.payment_id === credit && x.sale_id === creditSale.id)
        .reduce((n, x) => n + x.applied_amount, 0),
      appliedBefore + 123,
    );
    await openRecord("sales", pending, "sales");
    await dialog.getByRole("button", { name: "Registrar pago", exact: true }).click();
    await dialog.getByLabel("Monto recibido S/", { exact: true }).fill("2");
    await dialog.getByLabel("Método de pago", { exact: true }).selectOption("CASH");
    const paymentInput = dialog.getByLabel("Aplicar a " + snapshot.sales.find((x) => x.id === pending).code, {
      exact: true,
    });
    const paymentLabel = await paymentInput.getAttribute("aria-label");
    const paymentSale = snapshot.sales.find((x) => paymentLabel === "Aplicar a " + x.code);
    const priorPaymentIds = new Set((await state()).payments.map((x) => x.id));
    await paymentInput.fill("1.23");
    await dialog.locator("th button").first().click();
    await dialog.locator("th button").first().click();
    await saveForm("Registrar pago", "PAYMENT_CREATE");
    const paidState = await state();
    const newPayment = paidState.payments.find((x) => !priorPaymentIds.has(x.id));
    assert.ok(
      paidState.paymentApplications.some(
        (x) => x.payment_id === newPayment.id && x.sale_id === paymentSale.id && x.applied_amount === 123,
      ),
    );
    await openRecord("sales", scenario.firstSale, "sales");
    await dialog.getByRole("button", { name: "Devolución", exact: true }).click();
    const priorReturnIds = new Set((await state()).returns.map((x) => x.id));
    await dialog.locator("tbody input").first().fill("1");
    await dialog.locator("th button").first().click();
    await dialog.locator("th button").first().click();
    await dialog.getByLabel("Motivo de devolución", { exact: true }).fill("Devolución sintética ordenada");
    await saveForm("Confirmar devolución", "RETURN_CREATE");
    const returnedState = await state();
    const newReturn = returnedState.returns.find((x) => !priorReturnIds.has(x.id));
    assert.ok(
      returnedState.returnItems.some(
        (x) => x.return_id === newReturn.id && x.sale_item_id === deliveredItem.id && x.quantity === 1,
      ),
    );
    await openRecord("productions/draft", draftProduction, "productions");
    await dialog.getByRole("button", { name: "Editar lote", exact: true }).click();
    const draftCharge = dialog.getByLabel(/^Cobro real /).first();
    const draftChargeLabel = await draftCharge.getAttribute("aria-label");
    const draftIngredient = snapshot.ingredients.find((x) => draftChargeLabel === "Cobro real " + x.name);
    await draftCharge.fill("12.34");
    await dialog.locator("th button").first().click();
    await dialog.locator("th button").first().click();
    await saveForm("Guardar lote a producir", "PRODUCTION_SAVE");
    assert.equal(
      productionSummary(await state(), { id: draftProduction }).ingredients.find(
        (x) => x.ingredient_id === draftIngredient.id,
      ).actual_charge,
      1234,
    );
    await openRecord("productions/draft", draftProduction, "productions");
    await dialog.getByRole("button", { name: "Editar lote", exact: true }).click();
    await expect(dialog.getByLabel(draftChargeLabel, { exact: true })).toHaveValue("12.34");
    await close();
    assert.deepEqual(errors, []);
    writeFileSync(join(server.evidence, "sorting-coverage.json"), JSON.stringify(evidence, null, 2));
    console.log("NQP12 evidence: " + server.evidence);
  },
);
