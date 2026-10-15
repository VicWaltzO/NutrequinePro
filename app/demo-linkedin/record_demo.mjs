import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { stock, saleSummary, productionSummary, balanceSummary } from "../lib/domain.mjs";
import { readExecutionProfile } from "../scripts/execution-profile.mjs";

const dir = fileURLToPath(new URL("./", import.meta.url));
const app = path.dirname(dir);
const base = "http://127.0.0.1:5174";
const rehearsal = process.argv.includes("--rehearse");
const existing = process.argv.includes("--existing-isolated");
const day = "2026-10-11";
const runId = `${Date.now()}-${rehearsal ? "rehearsal" : "capture"}`;
const stateDir = path.join(dir, ".local-state", runId);
const require = createRequire(import.meta.url);
// Prefer an installation in this directory; the Codex bundled runtime is a fallback.
const bundled = path.join(
  homedir(),
  ".cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright",
);
const shim = path.join(dir, ".tools/playwright");
if (!process.env.PLAYWRIGHT_BROWSERS_PATH && existsSync(path.join(shim, "ffmpeg-1011/ffmpeg-win64.exe"))) {
  process.env.PLAYWRIGHT_BROWSERS_PATH = shim;
}
let playwright;
try {
  playwright = require(process.env.PLAYWRIGHT_MODULE || "playwright");
} catch {
  playwright = require(bundled);
}

await mkdir(path.join(dir, "qa"), { recursive: true });
await mkdir(path.join(dir, ".raw", runId), { recursive: true });
let server, browser;
const errors = [],
  failedRequests = [],
  checks = [],
  shots = [];
const serverOutput = [];
const started = Date.now();
function check(name, actual, expected) {
  assert.deepEqual(actual, expected, name);
  checks.push({ name, actual, expected, passed: true });
}
async function ready() {
  const deadline = Date.now() + 120000;
  while (Date.now() < deadline) {
    if (server?.exitCode != null) throw new Error(`Servidor terminó: ${serverOutput.join("").slice(-1500)}`);
    try {
      if ((await fetch(base, { redirect: "manual", signal: AbortSignal.timeout(5000) })).status < 500) return;
    } catch {
      /* local server is starting */
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  throw new Error("El servidor local no respondió en 120 segundos.");
}
async function startServer() {
  assert.equal(
    readExecutionProfile(),
    "portable",
    "La demo requiere el perfil portable local, sin servicios de hosting.",
  );
  if (existing) {
    assert.equal(
      process.env.DEMO_EXISTING_ISOLATED,
      "1",
      "Solo se admite un servidor local D1 aislado confirmado.",
    );
    await ready();
    return;
  }
  try {
    await fetch(base, { redirect: "manual", signal: AbortSignal.timeout(5000) });
    throw new Error("Puerto 5174 ocupado. Detenga la instancia anterior antes de grabar.");
  } catch (error) {
    if (!error.cause) throw error;
  }
  server = spawn(
    process.execPath,
    ["scripts/run-framework.mjs", "dev", "--host", "127.0.0.1", "--port", "5174", "--strictPort"],
    {
      cwd: app,
      env: {
        ...process.env,
        NUTREQUINE_LOCAL_STATE_DIR: stateDir,
        WRANGLER_SEND_METRICS: "false",
        CLOUDFLARE_CF_FETCH_ENABLED: "false",
      },
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  server.stdout.on("data", (chunk) => serverOutput.push(chunk.toString()));
  server.stderr.on("data", (chunk) => serverOutput.push(chunk.toString()));
  server.on("error", (error) => errors.push(`server: ${error.message}`));
  await ready();
}
function observe(page) {
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("requestfailed", (request) => {
    if (request.failure()?.errorText !== "net::ERR_ABORTED")
      failedRequests.push({ pathname: new URL(request.url()).pathname, error: request.failure()?.errorText });
  });
  page.on("response", (response) => {
    if (response.status() >= 400)
      failedRequests.push({ pathname: new URL(response.url()).pathname, status: response.status() });
  });
}
async function localContext(options = {}) {
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 1,
    locale: "es-PE",
    timezoneId: "America/Lima",
    colorScheme: "light",
    ...options,
  });
  await context.route("**/*", (route) => {
    const url = new URL(route.request().url());
    if (["http:", "https:"].includes(url.protocol) && url.origin !== base)
      return route.abort("blockedbyclient");
    return route.continue();
  });
  return context;
}
async function getState(context) {
  const response = await context.request.get(`${base}/api/state`);
  assert.equal(response.status(), 200);
  return (await response.json()).state;
}
async function command(context, type, payload) {
  const response = await context.request.post(`${base}/api/command`, {
    data: { request_id: crypto.randomUUID(), type, payload },
  });
  const json = await response.json();
  assert.equal(response.status(), 200, `${type}: ${json.error || "respuesta inválida"}`);
  return json;
}
async function prepare(context) {
  const page = await context.newPage();
  observe(page);
  await page.goto(`${base}/signin-with-chatgpt?return_to=%2F`);
  await page.getByRole("heading", { name: "Resumen", exact: true }).waitFor({ timeout: 120000 });
  let s = await getState(context);
  check(
    "Base nueva: sin operaciones",
    [s.sales.length, s.productions.length, s.payments.length, s.customers.length],
    [0, 0, 0, 0],
  );
  await command(context, "USER_SAVE", {
    id: "local_seedy",
    name: "Usuario Demo",
    role: "ADMIN",
    is_active: true,
  });
  for (const [i, site] of s.sites.entries())
    await command(context, "SITE_SAVE", {
      id: site.id,
      name: `Sede Demo ${String(i + 1).padStart(2, "0")}`,
      is_active: true,
    });
  const prices = [76, 72, 74, 0];
  for (const [i, product] of s.products.entries())
    await command(context, "PRODUCT_SAVE", {
      id: product.id,
      name: product.name,
      category: product.category,
      default_sale_price: prices[i],
      standard_bag_weight_kg: product.standard_bag_weight_kg / 1000,
      bags_per_nucleus: product.bags_per_nucleus,
      commercial_weight_per_nucleus_kg: product.commercial_weight_per_nucleus_kg / 1000,
      is_sellable: product.is_sellable,
      is_active: true,
    });
  const ingredientPrices = [1.8, 1.9, 1.2, 0.9, 5, 1, 1.3, 0.4, 0.5, 3];
  for (const [i, ingredient] of s.ingredients.entries())
    await command(context, "INGREDIENT_SAVE", {
      id: ingredient.id,
      name: ingredient.name,
      current_price_per_kg: ingredientPrices[i],
      is_active: true,
    });
  await command(context, "CONFIG_SAVE", {
    company_name: "Nutrequine Pro",
    default_nucleus_cost: 180,
    default_packaging_cost: 1,
    default_payment_condition: "CREDIT",
    default_payment_method: "TRANSFER",
    expense_categories: s.config.expense_categories,
  });
  const customer = (
    await command(context, "CUSTOMER_SAVE", {
      name: "Cliente Demo",
      notes: "Datos ficticios para demostración",
      site_ids: ["site-1"],
      is_active: true,
    })
  ).result;
  const historical = (
    await command(context, "CUSTOMER_SAVE", {
      name: "Cliente Demo Histórico",
      site_ids: ["site-1"],
      is_active: true,
    })
  ).result;
  const baseline = await command(context, "PRODUCTION_SAVE", {
    production_date: day,
    notes: "Lote Demo de inventario",
    products: ["prod-1", "prod-2", "prod-3"].map((product_id) => ({ product_id, nuclei_count: 1 })),
    nucleus_cost: 180,
    packaging_cost: 1,
    nucleus_paid: true,
    packaging_paid: true,
    costs: [{ category: "FREIGHT", description: "Flete Demo", amount: 75, is_paid: true }],
    confirm: true,
  });
  await command(context, "PRODUCTION_RECONCILE", {
    id: baseline.result,
    reason: "Costos ficticios de preparación",
    ingredients: baseline.state.productionIngredients
      .filter((x) => x.production_id === baseline.result && x.is_current !== false)
      .map((x) => ({
        id: x.id,
        discount_amount: 0,
        actual_charge: x.theoretical_net_cost / 100,
        is_paid: true,
      })),
    costs: baseline.state.productionCosts
      .filter((x) => x.production_id === baseline.result && x.is_current !== false)
      .map((x) => ({ id: x.id, amount: x.amount / 100, is_paid: true })),
  });
  await command(context, "PRODUCTION_CLOSE", { id: baseline.result });
  const prior = await command(context, "SALE_SAVE", {
    customer_id: historical,
    site_id: "site-1",
    sale_date: day,
    payment_condition: "CASH",
    paid_amount: 6660,
    payment_date: day,
    payment_method: "TRANSFER",
    reference: "DEMO-PREPARACION",
    notes: "Venta ficticia previa",
    items: ["prod-1", "prod-2", "prod-3"].map((product_id, i) => ({
      product_id,
      quantity: 30,
      unit_weight_kg: 25,
      unit_price: prices[i],
    })),
    confirm: true,
    deliver: true,
  });
  check(
    "Venta de preparación",
    saleSummary(
      prior.state,
      prior.state.sales.find((x) => x.id === prior.result),
    ).total,
    666000,
  );
  // Use the app's computed ingredient costs as the input of a fully reconciled test draft.
  const draftInput = {
    production_date: day,
    notes: "Lote Demo 001",
    products: [{ product_id: "prod-2", nuclei_count: 1 }],
    nucleus_cost: 180,
    packaging_cost: 1,
    nucleus_paid: true,
    packaging_paid: true,
    costs: [{ category: "FREIGHT", description: "Flete Demo", amount: 50, is_paid: true }],
    confirm: false,
  };
  const draft = await command(context, "PRODUCTION_SAVE", draftInput);
  draftInput.id = draft.result;
  draftInput.ingredients = draft.state.productionIngredients
    .filter((x) => x.production_id === draft.result && x.is_current !== false)
    .map((x) => ({
      ingredient_id: x.ingredient_id,
      discount_amount: 0,
      actual_charge: x.theoretical_net_cost / 100,
      is_paid: true,
    }));
  const saved = await command(context, "PRODUCTION_SAVE", draftInput);
  const productionCode = saved.state.productions.find((x) => x.id === saved.result).code;
  check("Stock inicial Hi-Performance", stock(saved.state, "prod-2").quantity, 10);
  await page.close();
  return { customer, production: draft.result, productionCode, initial: balanceSummary(saved.state) };
}
async function expectText(locator, text) {
  await locator.filter({ hasText: text }).first().waitFor({ state: "visible" });
}
async function submitUI(page, locator, type) {
  const responsePromise = page.waitForResponse(
    (r) => r.url() === `${base}/api/command` && r.request().postDataJSON()?.type === type,
  );
  await locator.click();
  const response = await responsePromise;
  const result = await response.json();
  check(`HTTP ${type}`, response.status(), 200);
  return result;
}
async function scene(page, name, seconds, action) {
  const start = (Date.now() - recordingEpoch) / 1000;
  const startWall = Date.now();
  activeHighlights = [];
  activeSceneStart = start;
  await action();
  const remaining = seconds * 1000 + 350 - (Date.now() - startWall);
  if (remaining > 0) await page.waitForTimeout(remaining); // Deliberate reading time after verified readiness.
  const end = (Date.now() - recordingEpoch) / 1000;
  assert.ok(
    end - start <= seconds * 1.35,
    `La escena ${name} tarda demasiado; revise selección antes del montaje.`,
  );
  shots.push({ name, start, end, seconds, speed: (end - start) / seconds, highlights: activeHighlights });
  await page.screenshot({ path: path.join(dir, "qa", `${name}.png`) });
  console.log(`Verificado: ${name} (${(end - start).toFixed(2)} s bruto)`);
}
let recordingEpoch, activeSceneStart, activeHighlights, calibrationCue;
async function highlight(locator, duration = 0.7) {
  const box = await locator.boundingBox();
  assert.ok(box, "El elemento resaltado debe ser visible.");
  activeHighlights.push({ at: (Date.now() - recordingEpoch) / 1000 - activeSceneStart, duration, box });
}
async function binaryOutput(binary, args) {
  return await new Promise((resolve, reject) => {
    const child = spawn(binary, args, { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
    const chunks = [],
      diagnostics = [];
    child.stdout.on("data", (chunk) => chunks.push(chunk));
    child.stderr.on("data", (chunk) => diagnostics.push(chunk));
    child.once("error", reject);
    child.once("close", (code) =>
      code === 0 ? resolve(Buffer.concat(chunks)) : reject(new Error(Buffer.concat(diagnostics).toString())),
    );
  });
}
async function alignVideo(source) {
  const ffmpeg = process.env.FFMPEG_BINARY || path.join(dir, ".tools", "ffmpeg.exe");
  const ffprobe = process.env.FFPROBE_BINARY || path.join(dir, ".tools", "ffprobe.exe");
  const { x, y } = calibrationCue.pixel;
  // Measure an authentic navigation-state change, without adding a visual marker to the UI.
  const pixels = await binaryOutput(ffmpeg, [
    "-v",
    "error",
    "-i",
    source,
    "-vf",
    `crop=8:8:${x}:${y},format=gray`,
    "-fps_mode",
    "passthrough",
    "-f",
    "rawvideo",
    "pipe:1",
  ]);
  const metadata = JSON.parse(
    (
      await binaryOutput(ffprobe, [
        "-v",
        "error",
        "-select_streams",
        "v:0",
        "-show_frames",
        "-show_entries",
        "frame=best_effort_timestamp_time",
        "-of",
        "json",
        source,
      ])
    ).toString(),
  );
  check("Calibración: muestras y frames coinciden", pixels.length / 64, metadata.frames.length);
  const averages = metadata.frames.map(
    (_, i) => pixels.subarray(i * 64, (i + 1) * 64).reduce((sum, value) => sum + value, 0) / 64,
  );
  const index = averages.findIndex((value, i) => value < 80 && averages[i + 1] < 80 && averages[i + 2] < 80);
  assert.ok(index > 0, "No se detectó el cambio real de navegación para alinear el bruto.");
  const mediaTime = Number(metadata.frames[index].best_effort_timestamp_time);
  const wallTime = (calibrationCue.before + calibrationCue.after) / 2;
  const offset = mediaTime - wallTime;
  assert.ok(
    offset <= 0.2 && offset >= -3,
    "Desfase de captura inesperado; requiere inspección antes de montar.",
  );
  for (const scene of shots) {
    scene.wallStart = scene.start;
    scene.wallEnd = scene.end;
    scene.start += offset;
    scene.end += offset;
    assert.ok(scene.start >= 0, "La escena comienza antes del primer frame capturado.");
  }
  check("Calibración: navegación real identificada", averages[index] < 80 && averages[index - 1] >= 80, true);
  return {
    method: "First authentic Producción navigation activation, sampled at native 8×8 background region",
    pixel: calibrationCue.pixel,
    wallBefore: calibrationCue.before,
    wallAfter: calibrationCue.after,
    videoCueTime: mediaTime,
    sourceFrame: index,
    offsetSeconds: offset,
    toleranceSeconds: (calibrationCue.after - calibrationCue.before) / 2 + 0.04,
  };
}
try {
  await startServer();
  browser = await playwright.chromium.launch({
    channel: process.env.DEMO_BROWSER_CHANNEL || "chrome",
    headless: true,
  });
  const warm = await localContext();
  const fixtures = await prepare(warm);
  const storageState = await warm.storageState();
  await warm.close();
  const context = await localContext({
    storageState,
    ...(rehearsal
      ? {}
      : { recordVideo: { dir: path.join(dir, ".raw", runId), size: { width: 1920, height: 1080 } } }),
  });
  recordingEpoch = Date.now();
  const page = await context.newPage();
  observe(page);
  await page.goto(`${base}/#dashboard`);
  await page.getByRole("heading", { name: "Resumen", exact: true }).waitFor();
  await page.getByText("Usuario Demo", { exact: true }).waitFor();
  await page.evaluate(() => document.fonts.ready);
  const images = page.locator("img");
  for (let i = 0; i < (await images.count()); i++) await images.nth(i).evaluate((img) => img.decode());
  const screenshot = (name) => page.screenshot({ path: path.join(dir, "qa", `${name}.png`) });
  await scene(page, "01-resumen", 3, async () => {
    check("Resumen inicial sin deuda", fixtures.initial.receivable, 0);
    await screenshot("inicio");
  });
  await scene(page, "02-produccion", 7, async () => {
    const navigation = page.locator("nav").getByRole("button", { name: "Producción", exact: true });
    const box = await navigation.boundingBox();
    const before = (Date.now() - recordingEpoch) / 1000;
    await navigation.click();
    calibrationCue = {
      before,
      after: (Date.now() - recordingEpoch) / 1000,
      pixel: { x: Math.floor(box.x + box.width - 42), y: Math.floor(box.y + 7) },
    };
    await page.getByRole("heading", { name: "Producción", exact: true }).waitFor();
    await page.getByRole("button", { name: fixtures.productionCode, exact: true }).click();
    await page.getByText("Lote Demo 001", { exact: true }).waitFor();
    await page.waitForTimeout(850);
    await highlight(page.getByRole("button", { name: "Confirmar producción", exact: true }), 0.3);
    await page.waitForTimeout(400);
    const result = await submitUI(
      page,
      page.getByRole("button", { name: "Confirmar producción", exact: true }),
      "PRODUCTION_CONFIRM",
    );
    check(
      "Lote confirmado",
      result.state.productions.find((x) => x.id === fixtures.production).status,
      "CONFIRMED",
    );
    check("Producción aumenta stock en 40 sacos", stock(result.state, "prod-2").quantity, 50);
    const p = productionSummary(
      result.state,
      result.state.productions.find((x) => x.id === fixtures.production),
    );
    check("Producción: sacos y kg", [p.bags, p.weight], [40, 1000000]);
    check("Costos conciliados", p.reconciled, true);
    await expectText(page.locator(".badge"), "Confirmada");
    await screenshot("produccion-confirmada");
    await page.waitForTimeout(650);
    // Real scroll within the native detail dialog, no content replacement.
    await page.locator(".modal-body").evaluate((el) => el.scrollTo({ top: 310, behavior: "smooth" }));
    await page.getByRole("heading", { name: "Costos de insumos y diferencias", exact: true }).waitFor();
    await page.waitForTimeout(650);
    await screenshot("produccion-costos");
  });
  await page.getByRole("button", { name: "Cerrar", exact: true }).click();
  await page.locator("nav").getByRole("button", { name: "Ventas", exact: true }).click();
  await page.getByRole("heading", { name: "Ventas", exact: true }).waitFor();
  await page.getByRole("button", { name: "Nueva venta", exact: true }).click();
  await page.getByRole("dialog").getByLabel("Cliente", { exact: true }).selectOption(fixtures.customer);
  await page.getByLabel("Fecha de venta", { exact: true }).fill(day);
  await page.getByLabel("Sede destino", { exact: true }).selectOption("site-1");
  let demoSale, saleCode;
  await scene(page, "03-ventas", 7, async () => {
    await page.waitForTimeout(350);
    await page.getByLabel("Producto", { exact: true }).selectOption("prod-2");
    check(
      "Precio autocompletado",
      await page.getByLabel("Precio por saco", { exact: true }).inputValue(),
      "72",
    );
    check("Peso autocompletado", await page.getByLabel("Peso por saco", { exact: true }).inputValue(), "25");
    await page.waitForTimeout(750);
    await page.getByLabel("Cantidad de sacos", { exact: true }).fill("10");
    await expectText(page.locator(".total-line strong"), "720.00");
    await screenshot("venta-total");
    await highlight(page.locator(".total-line strong"));
    await page.waitForTimeout(1050);
    const result = await submitUI(
      page,
      page.getByRole("button", { name: "Confirmar venta", exact: true }),
      "SALE_SAVE",
    );
    demoSale = result.result;
    const sale = result.state.sales.find((x) => x.id === demoSale);
    saleCode = sale.code;
    const summary = saleSummary(result.state, sale);
    check(
      "Venta crédito entregada",
      [sale.payment_condition, sale.commercial_status, sale.fulfillment_status],
      ["CREDIT", "CONFIRMED", "DELIVERED"],
    );
    check("Venta: total y deuda", [summary.total, summary.paid, summary.balance], [72000, 0, 72000]);
    check("Venta descuenta 10 sacos", stock(result.state, "prod-2").quantity, 40);
    await page.getByRole("heading", { name: saleCode, exact: true }).waitFor();
    await expectText(
      page.getByRole("dialog").locator(".metric").filter({ hasText: "Saldo" }).locator("strong"),
      "720.00",
    );
  });
  await page.getByRole("button", { name: "Cerrar", exact: true }).click();
  await page.locator("nav").getByRole("button", { name: "Cobranza", exact: true }).click();
  await page.getByRole("heading", { name: "Cobranza", exact: true }).waitFor();
  await scene(page, "04-cobranza", 8, async () => {
    await page.getByRole("button", { name: saleCode, exact: true }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Registrar pago", exact: true }).click();
    await page.getByLabel("Fecha del pago", { exact: true }).fill(day);
    await page.getByLabel("Monto recibido S/", { exact: true }).fill("300");
    await page.getByLabel(`Aplicar a ${saleCode}`, { exact: true }).fill("300");
    await page.getByLabel("Método de pago", { exact: true }).selectOption("TRANSFER");
    await expectText(page.locator(".total-line"), "300.00");
    await screenshot("pago-aplicacion");
    await page.waitForTimeout(950);
    const result = await submitUI(
      page,
      page.getByRole("dialog").getByRole("button", { name: "Registrar pago", exact: true }),
      "PAYMENT_CREATE",
    );
    const summary = saleSummary(
      result.state,
      result.state.sales.find((x) => x.id === demoSale),
    );
    check(
      "Pago reduce saldo",
      [summary.total, summary.paid, summary.balance, summary.financial_status],
      [72000, 30000, 42000, "PARTIAL"],
    );
    check(
      "Pago auténtico aplicado a venta",
      result.state.paymentApplications.some(
        (x) => x.payment_id === result.result && x.sale_id === demoSale && x.applied_amount === 30000,
      ),
      true,
    );
    await page.getByRole("dialog").getByRole("button", { name: saleCode, exact: true }).click();
    await expectText(
      page.getByRole("dialog").locator(".metric").filter({ hasText: "Saldo" }).locator("strong"),
      "420.00",
    );
    await expectText(page.locator(".badge"), "Pago parcial");
    await highlight(
      page.getByRole("dialog").locator(".metric").filter({ hasText: "Saldo" }).locator("strong"),
    );
    await screenshot("saldo-despues");
  });
  await page.getByRole("button", { name: "Cerrar", exact: true }).click();
  await page.locator("nav").getByRole("button", { name: "Resumen", exact: true }).click();
  await page.getByRole("heading", { name: "Resumen", exact: true }).waitFor();
  let final;
  await scene(page, "05-resumen-final", 5, async () => {
    final = await getState(context);
    const b = balanceSummary(final);
    check(
      "Resumen final ventas/cobros/deuda",
      [b.sales, b.collections, b.receivable],
      [738000, 696000, 42000],
    );
    check(
      "Resumen final stock",
      [stock(final, "prod-1").quantity, stock(final, "prod-2").quantity, stock(final, "prod-3").quantity],
      [10, 40, 10],
    );
    await expectText(
      page.locator(".metric").filter({ hasText: "Saldo por cobrar" }).locator("strong"),
      "420.00",
    );
    await page.waitForTimeout(700);
    await screenshot("final");
  });
  const counts = [final.sales.length, final.productions.length, final.payments.length];
  await page.reload();
  await page.getByRole("heading", { name: "Resumen", exact: true }).waitFor();
  const persisted = await getState(context);
  check(
    "Recarga conserva sin duplicar",
    [persisted.sales.length, persisted.productions.length, persisted.payments.length],
    counts,
  );
  check(
    "Persistencia del saldo",
    saleSummary(
      persisted,
      persisted.sales.find((x) => x.id === demoSale),
    ).balance,
    42000,
  );
  check("Errores de navegador", errors, []);
  check("Fallos de red", failedRequests, []);
  const video = page.video();
  await context.close();
  let alignment;
  if (!rehearsal) {
    const source = path.join(dir, "showcase_source.webm");
    await video.saveAs(source);
    alignment = await alignVideo(source);
    await writeFile(path.join(dir, "qa", "alignment.json"), JSON.stringify(alignment, null, 2) + "\n");
  }
  const report = {
    runId,
    mode: rehearsal ? "rehearsal" : "capture",
    localOnly: true,
    externalRequestsBlocked: true,
    viewport: [1920, 1080],
    locale: "es-PE",
    timezone: "America/Lima",
    browser: await browser.version(),
    checks,
    errors,
    failedRequests,
    shots,
    alignment,
    elapsedSeconds: (Date.now() - started) / 1000,
  };
  await writeFile(
    path.join(dir, "qa", rehearsal ? "rehearsal-e2e.json" : "e2e.json"),
    JSON.stringify(report, null, 2) + "\n",
  );
  if (!rehearsal)
    await writeFile(
      path.join(dir, "shots.json"),
      JSON.stringify(
        { source: "showcase_source.webm", viewport: [1920, 1080], alignment, scenes: shots },
        null,
        2,
      ) + "\n",
    );
  console.log(
    `OK: ${checks.length} comprobaciones, sin errores. ${rehearsal ? "Ensayo E2E" : "Captura original guardada"}.`,
  );
} finally {
  if (browser) await browser.close();
  if (server && server.exitCode == null) {
    // Stop this script's own process tree. No unrelated listener is terminated.
    if (process.platform === "win32")
      await new Promise((resolve) => {
        const child = spawn("taskkill", ["/PID", String(server.pid), "/T", "/F"], {
          windowsHide: true,
          stdio: "ignore",
        });
        child.once("exit", resolve);
      });
    else server.kill("SIGTERM");
  }
}
