import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { randomUUID, createHash } from "node:crypto";
import { readFile, writeFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { startLocalTestServer } from "../helpers/local-test-server.mjs";
import { cashCreditScenario, scenarioDate } from "../helpers/regression-scenarios.mjs";
import { stock, saleSummary, paymentSummary, balanceSummary } from "../../lib/domain.mjs";

function playwright() {
  const require = createRequire(import.meta.url);
  const candidates = [
    "playwright",
    fileURLToPath(new URL("../../demo-linkedin/node_modules/playwright", import.meta.url)),
    fileURLToPath(new URL("../../../showcase/node_modules/playwright", import.meta.url)),
  ];
  for (const candidate of candidates) {
    try {
      return require(candidate);
    } catch (error) {
      if (error.code !== "MODULE_NOT_FOUND") throw error;
    }
  }
  throw new Error(
    "Install the existing Playwright test tool in demo-linkedin or showcase before E2E; no dependencies are added automatically.",
  );
}

test("Regresión 02: HTTP de red y navegador sobre D1 sintético aislado", { timeout: 420000 }, async (t) => {
  const server = await startLocalTestServer();
  console.log("Evidence: " + server.evidenceDir);
  t.after(server.stop);
  const { chromium, request } = playwright();
  const api = await request.newContext({ baseURL: server.baseURL });
  t.after(() => api.dispose());
  const checks = [];
  const browser = await chromium.launch({
    channel: process.env.REGRESSION_BROWSER_CHANNEL || "chrome",
    headless: true,
  });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    locale: "es-PE",
    colorScheme: "light",
  });
  await context.tracing.start({ screenshots: true, snapshots: true });
  const page = await context.newPage();
  page.setDefaultTimeout(45000);
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push({ message: error.message, stack: error.stack }));
  t.after(async () => {
    await context.tracing.stop({ path: path.join(server.evidenceDir, "trace.zip") });
    const screenshots = [];
    for (const name of (await readdir(server.evidenceDir)).filter((name) => name.endsWith(".png"))) {
      const bytes = await readFile(path.join(server.evidenceDir, name));
      screenshots.push({ name, sha256: createHash("sha256").update(bytes).digest("hex") });
    }
    await writeFile(
      path.join(server.evidenceDir, "results.json"),
      JSON.stringify(
        {
          runAt: new Date().toISOString(),
          synthetic: true,
          baseURL: server.baseURL,
          stateDir: server.stateDir,
          checks,
          pageErrors,
          screenshots,
        },
        null,
        2,
      ) + "\n",
    );
    await context.close();
    await browser.close();
  });

  async function step(id, title, action) {
    let passed = false;
    await t.test(id + ": " + title, async () => {
      try {
        await action();
        if (page.url() !== "about:blank")
          await page.screenshot({ path: path.join(server.evidenceDir, id + ".png"), fullPage: true });
        checks.push({ id, title, status: "passed" });
        passed = true;
      } catch (error) {
        checks.push({ id, title, status: "failed", error: error.message });
        if (page.url() !== "about:blank")
          await page.screenshot({ path: path.join(server.evidenceDir, id + "-failure.png"), fullPage: true });
        throw error;
      }
    });
    if (!passed)
      throw new Error(
        "Dependent browser scenario stopped after " + id + "; remaining steps were not executed.",
      );
  }
  async function state() {
    const response = await api.get("/api/state");
    assert.equal(response.status(), 200);
    return (await response.json()).state;
  }
  async function networkCommand(type, payload, request_id = randomUUID()) {
    const response = await api.post("/api/command", {
      data: { type, payload, request_id },
      headers: { Origin: server.baseURL },
    });
    assert.equal(response.status(), 200, JSON.stringify(await response.json()));
    return (await response.json()).result;
  }
  async function navigate(hash, title) {
    await page.locator("nav").getByRole("button", { name: title, exact: true }).click();
    await page.getByRole("heading", { level: 1, name: title, exact: true }).waitFor();
    assert.equal(new URL(page.url()).hash, "#" + hash);
  }
  const dialog = () => page.getByRole("dialog");
  async function submit(button, type) {
    const pending = page.waitForResponse((response) => {
      if (!response.url().endsWith("/api/command") || response.request().method() !== "POST") return false;
      return response.request().postDataJSON().type === type;
    });
    await button.click();
    const response = await pending;
    const body = await response.json();
    assert.equal(response.status(), 200, JSON.stringify(body));
    return body;
  }
  async function close() {
    if (await dialog().isVisible())
      await dialog().getByRole("button", { name: "Cerrar", exact: true }).click();
  }
  async function newSale({ quantity, price, cash = false }) {
    await navigate("sales", "Ventas");
    await page.getByRole("button", { name: "Nueva venta", exact: true }).click();
    await dialog().getByLabel("Fecha de venta", { exact: true }).fill(scenarioDate);
    await dialog().getByLabel("Cliente", { exact: true }).selectOption(customer);
    await dialog().getByLabel("Sede destino", { exact: true }).selectOption("site-1");
    await dialog().getByLabel("Producto", { exact: true }).selectOption("prod-1");
    await dialog().getByLabel("Cantidad de sacos", { exact: true }).fill(String(quantity));
    await dialog().getByLabel("Peso por saco", { exact: true }).fill("17.001");
    await dialog().getByLabel("Precio por saco", { exact: true }).fill(price);
    await dialog()
      .getByLabel("Condición", { exact: true })
      .selectOption(cash ? "CASH" : "CREDIT");
    await dialog()
      .getByLabel("Entrega", { exact: true })
      .selectOption(cash ? "immediate" : "future");
    if (cash) {
      await dialog().getByLabel("Monto pagado S/", { exact: true }).fill("150.03");
      await dialog().getByLabel("Método de pago", { exact: true }).selectOption("TRANSFER");
      await dialog().getByLabel("Fecha del pago", { exact: true }).fill(scenarioDate);
    }
    return submit(dialog().getByRole("button", { name: "Confirmar venta", exact: true }), "SALE_SAVE");
  }

  let customer, production, firstSale, secondSale, payment;
  await step("N01", "401 de red y cabeceras de identidad falsificadas no autentican", async () => {
    assert.equal((await api.get("/api/state")).status(), 401);
    assert.equal((await api.post("/api/command", { data: {} })).status(), 401);
    assert.equal(
      (
        await api.get("/api/state", {
          headers: {
            "oai-authenticated-user-id": "spoofed",
            "oai-authenticated-user-email": "spoofed@example.invalid",
          },
        })
      ).status(),
      401,
    );
  });
  await step("N02", "sesión portable y contratos de error de red conservan el estado", async () => {
    await api.get("/signin-with-chatgpt?return_to=%2F");
    const before = await state();
    assert.equal(before.sales.length, 0);
    assert.equal((await api.get("/api/state")).headers()["cache-control"], "no-store");
    const responses = [
      await api.post("/api/command", { data: { type: "UNKNOWN", request_id: "bad-command" } }),
      await api.post("/api/command", { data: {}, headers: { Origin: "https://foreign.invalid" } }),
      await api.post("/api/command", {
        data: Buffer.from("x".repeat(250001)),
        headers: { "Content-Type": "application/json" },
      }),
      await api.post("/api/command", {
        data: Buffer.from("{invalid"),
        headers: { "Content-Type": "application/json" },
      }),
    ];
    assert.deepEqual(
      responses.map((response) => response.status()),
      [422, 403, 413, 503],
    );
    assert.deepEqual(await state(), before);
  });
  await step("N03", "escenario portable reutilizado por HTTP real con D1 local", async () => {
    await cashCreditScenario({ run: networkCommand, state });
  });
  await step("B01", "administrador crea cliente en formulario y la recarga lo conserva", async () => {
    await page.goto(server.baseURL + "/signin-with-chatgpt?return_to=%2F");
    await page.getByRole("heading", { level: 1, name: "Resumen", exact: true }).waitFor();
    await navigate("customers", "Clientes");
    await page.getByRole("button", { name: "Nuevo cliente", exact: true }).click();
    await dialog().getByLabel("Nombre", { exact: true }).fill("Cliente navegador sintético 02");
    const body = await submit(
      dialog().getByRole("button", { name: "Guardar", exact: true }),
      "CUSTOMER_SAVE",
    );
    customer = body.result;
    await page.reload();
    await page.getByRole("button", { name: "Cliente navegador sintético 02", exact: true }).waitFor();
    assert.equal(
      (await state()).customers.find((row) => row.id === customer).name,
      "Cliente navegador sintético 02",
    );
  });
  await step("B02", "lote DRAFT se confirma desde detalle y produce cuarenta sacos", async () => {
    const beforeStock = stock(await state(), "prod-1").quantity;
    await navigate("productions", "Producción");
    await page.getByRole("button", { name: "Nueva producción", exact: true }).click();
    await dialog().getByLabel("Fecha de producción", { exact: true }).fill(scenarioDate);
    await dialog().getByLabel("Potripregnant · 40 sacos / núcleo", { exact: true }).fill("1");
    await dialog().getByLabel("Guardar como", { exact: true }).selectOption("no");
    const saved = await submit(
      dialog().getByRole("button", { name: "Guardar lote a producir", exact: true }),
      "PRODUCTION_SAVE",
    );
    production = saved.result;
    assert.equal(stock(saved.state, "prod-1").quantity, beforeStock);
    const code = saved.state.productions.find((row) => row.id === production).code;
    await close();
    await page.getByRole("button", { name: code, exact: true }).click();
    const confirmed = await submit(
      dialog().getByRole("button", { name: "Confirmar producción", exact: true }),
      "PRODUCTION_CONFIRM",
    );
    assert.equal(stock(confirmed.state, "prod-1").quantity, beforeStock + 40);
    assert.equal(confirmed.state.productions.find((row) => row.id === production).status, "CONFIRMED");
    await close();
  });
  await step("B03", "venta contado entregada guarda céntimos, gramos y saldo a favor", async () => {
    const result = await newSale({ quantity: 2, price: "73.01", cash: true });
    firstSale = result.result;
    payment = result.state.payments.find((row) => row.customer_id === customer).id;
    assert.equal(saleSummary(result.state, { id: firstSale }).total, 14602);
    assert.equal(
      paymentSummary(
        result.state,
        result.state.payments.find((row) => row.id === payment),
      ).available,
      401,
    );
    assert.equal(result.state.sales.find((row) => row.id === firstSale).fulfillment_status, "DELIVERED");
    await close();
  });
  await step("B04", "venta futura se entrega y reutiliza excedente sin otro cobro", async () => {
    const saved = await newSale({ quantity: 1, price: "10.01" });
    secondSale = saved.result;
    assert.equal(saved.state.sales.find((row) => row.id === secondSale).fulfillment_status, "PENDING");
    await submit(dialog().getByRole("button", { name: "Registrar entrega", exact: true }), "SALE_DELIVER");
    await close();
    await navigate("collections", "Cobranza");
    await page.getByRole("button", { name: "Historial de pagos", exact: true }).click();
    const current = await state();
    await page
      .getByRole("button", { name: current.payments.find((row) => row.id === payment).code, exact: true })
      .click();
    await dialog().getByRole("button", { name: "Aplicar saldo a favor a una venta", exact: true }).click();
    const saleCode = current.sales.find((row) => row.id === secondSale).code;
    await dialog()
      .getByLabel("Aplicar a " + saleCode, { exact: true })
      .fill("4.01");
    const applied = await submit(
      dialog().getByRole("button", { name: "Aplicar saldo a favor", exact: true }),
      "PAYMENT_APPLY_CREDIT",
    );
    assert.equal(saleSummary(applied.state, { id: secondSale }).balance, 600);
    assert.equal(applied.state.payments.filter((row) => row.customer_id === customer).length, 1);
    await close();
  });
  await step("B05", "rectificación de venta conserva motivo e historia", async () => {
    await navigate("sales", "Ventas");
    const current = await state();
    await page
      .getByRole("button", { name: current.sales.find((row) => row.id === secondSale).code, exact: true })
      .click();
    await dialog().getByRole("button", { name: "Rectificar", exact: true }).click();
    await dialog().getByLabel("Precio por saco", { exact: true }).fill("12.01");
    await dialog().getByLabel("Motivo de rectificación", { exact: true }).fill("Rectificación sintética 02");
    const result = await submit(
      dialog().getByRole("button", { name: "Registrar rectificación", exact: true }),
      "SALE_CORRECT",
    );
    assert.equal(saleSummary(result.state, { id: secondSale }).balance, 800);
    assert.equal(result.state.corrections.at(-1).reason, "Rectificación sintética 02");
    await close();
  });
  await step("B06", "devolución física agrega historia sin reducción económica implícita", async () => {
    const current = await state();
    await page
      .getByRole("button", { name: current.sales.find((row) => row.id === firstSale).code, exact: true })
      .click();
    await dialog().getByRole("button", { name: "Devolución", exact: true }).click();
    await dialog().getByLabel("Sacos a devolver", { exact: true }).fill("1");
    await dialog().getByLabel("Fecha de devolución", { exact: true }).fill(scenarioDate);
    await dialog().getByLabel("Motivo de devolución", { exact: true }).fill("Devolución sintética 02");
    const result = await submit(
      dialog().getByRole("button", { name: "Confirmar devolución", exact: true }),
      "RETURN_CREATE",
    );
    assert.equal(saleSummary(result.state, { id: firstSale }).total, 14602);
    assert.equal(result.state.returnItems.at(-1).weight_kg, 17001);
    await close();
  });
  await step(
    "B07",
    "reversión del pago libera también su crédito y anulación no duplica retornos",
    async () => {
      await navigate("collections", "Cobranza");
      await page.getByRole("button", { name: "Historial de pagos", exact: true }).click();
      let current = await state();
      await page
        .getByRole("button", { name: current.payments.find((row) => row.id === payment).code, exact: true })
        .click();
      await dialog().getByRole("button", { name: "Registrar reversión de pago", exact: true }).click();
      await dialog().getByLabel("Motivo obligatorio", { exact: true }).fill("Reversión sintética 02");
      await dialog().getByLabel("Fecha de reversión", { exact: true }).fill(scenarioDate);
      const reversed = await submit(
        dialog().getByRole("button", { name: "Registrar operación", exact: true }),
        "PAYMENT_REVERSE",
      );
      assert.equal(saleSummary(reversed.state, { id: secondSale }).paid, 0);
      await close();
      await navigate("sales", "Ventas");
      current = await state();
      await page
        .getByRole("button", { name: current.sales.find((row) => row.id === firstSale).code, exact: true })
        .click();
      await dialog().getByRole("button", { name: "Anular", exact: true }).click();
      await dialog().getByLabel("Motivo obligatorio", { exact: true }).fill("Anulación sintética 02");
      const cancelled = await submit(
        dialog().getByRole("button", { name: "Registrar operación", exact: true }),
        "SALE_CANCEL",
      );
      assert.equal(stock(cancelled.state, "prod-1").quantity, 44);
      assert.equal(stock(cancelled.state, "prod-1").weight_kg, 1108004);
      assert.equal(cancelled.state.payments.filter((row) => row.customer_id === customer).length, 1);
      await close();
    },
  );
  await step("B08", "gasto, balance, tema, recarga y navegación móvil", async () => {
    await navigate("expenses", "Gastos");
    await page.getByRole("button", { name: "Registrar gasto", exact: true }).click();
    await dialog().getByLabel("Fecha", { exact: true }).fill(scenarioDate);
    await dialog().getByLabel("Descripción", { exact: true }).fill("Gasto sintético 02");
    await dialog().getByLabel("Monto pagado S/", { exact: true }).fill("0.01");
    await dialog().getByLabel("Categoría", { exact: true }).selectOption("OPERATING");
    const result = await submit(
      dialog().getByRole("button", { name: "Guardar", exact: true }),
      "EXPENSE_CREATE",
    );
    assert.equal(balanceSummary(result.state).other, 1);
    await navigate("balance", "Balance");
    await page.getByRole("button", { name: "Activar modo oscuro", exact: true }).click();
    await page.reload();
    await page.getByRole("heading", { level: 1, name: "Balance", exact: true }).waitFor();
    assert.equal(await page.locator("html").getAttribute("data-theme"), "dark");
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole("button", { name: "Abrir navegación", exact: true }).click();
    await page.locator("nav").getByRole("button", { name: "Inventario", exact: true }).click();
    await page.getByRole("heading", { level: 1, name: "Inventario", exact: true }).waitFor();
    assert.deepEqual(pageErrors, []);
  });
  await step("N04", "salida de sesión de red vuelve a 401 sin alterar operaciones", async () => {
    const logout = await api.get("/signout-with-chatgpt?return_to=%2F", { maxRedirects: 0 });
    assert.equal(logout.status(), 302);
    assert.equal((await api.get("/api/state")).status(), 401);
  });
});
