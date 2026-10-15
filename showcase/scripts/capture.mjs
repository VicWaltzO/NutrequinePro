import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import path from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import { dir, appDir, loadPlaywright, binaries } from "./runtime.mjs";
import { demoFixture as f } from "../data/demo-fixture.mjs";
import { config } from "../src/config.mjs";
import {
  stock,
  saleSummary,
  productionSummary,
  balanceSummary,
} from "../../app/lib/domain.mjs";
import { readExecutionProfile } from "../../app/scripts/execution-profile.mjs";

const base = "http://127.0.0.1:5175";
const rehearsal = process.argv.includes("--rehearse");
const runId = `${Date.now()}-${rehearsal ? "rehearsal" : "capture"}`;
const stateDir = path.join(dir, ".local-state", runId);
const capturesDir = path.join(dir, "assets", "captures");
const qaDir = path.join(dir, "qa");
const source = path.join(capturesDir, "source.webm");
const rawDir = path.join(dir, ".raw", runId);
const handleSeconds = 0.3;
const modulePlan = [
  ["summary", "Resumen", "dashboard", 3],
  ["production", "Producción", "productions", 5],
  ["inventory", "Inventario", "inventory", 4],
  ["sales", "Ventas", "sales", 7],
  ["collections", "Cobranza", "collections", 7],
  ["expenses", "Gastos", "expenses", 3],
  ["balance", "Balance", "balance", 4],
  ["customers", "Clientes", "customers", 3],
  ["configuration", "Configuración", "config", 2],
];
const cursor = config.cursor;
for (const item of modulePlan)
  item[3] = config.scenes.find((scene) => scene.id === item[0]).duration;
const playwright = loadPlaywright();
const checks = [],
  errors = [],
  failedRequests = [],
  moduleAssertions = [],
  scenes = [];
const serverOutput = [];
let server, browser, context, page, epoch, calibrationCue, activeScene;
let mousePosition = { x: 1830, y: 900 };
const started = Date.now();
await Promise.all([
  mkdir(qaDir, { recursive: true }),
  mkdir(capturesDir, { recursive: true }),
  mkdir(rawDir, { recursive: true }),
]);

function check(name, actual, expected) {
  assert.deepEqual(actual, expected, name);
  checks.push({ name, actual, expected, passed: true });
}
const now = () => (Date.now() - epoch) / 1000;
const pause = (ms) => page.waitForTimeout(ms);

async function waitForServer() {
  const deadline = Date.now() + 120000;
  while (Date.now() < deadline) {
    if (server?.exitCode != null)
      throw new Error(
        `Servidor terminó: ${serverOutput.join("").slice(-1600)}`,
      );
    try {
      const response = await fetch(base, {
        redirect: "manual",
        signal: AbortSignal.timeout(4000),
      });
      if (response.status < 500) return;
    } catch {
      /* Only the owned local server is being awaited. */
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  throw new Error("El servidor local no respondió en 120 segundos.");
}
async function startServer() {
  assert.equal(
    readExecutionProfile(),
    "portable",
    "Captura requiere el perfil portable local.",
  );
  let occupied = false;
  try {
    await fetch(base, { signal: AbortSignal.timeout(2500) });
    occupied = true;
  } catch {
    /* no listener */
  }
  assert.equal(
    occupied,
    false,
    "Puerto 5175 ocupado; no se reutiliza una base desconocida.",
  );
  assert.ok(stateDir.startsWith(path.join(dir, ".local-state") + path.sep));
  server = spawn(
    process.execPath,
    [
      "scripts/run-framework.mjs",
      "dev",
      "--host",
      "127.0.0.1",
      "--port",
      "5175",
      "--strictPort",
    ],
    {
      cwd: appDir,
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
  await waitForServer();
}
function observe(p) {
  p.on("pageerror", (error) => errors.push(error.message));
  p.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  p.on("requestfailed", (request) => {
    if (request.failure()?.errorText !== "net::ERR_ABORTED")
      failedRequests.push({
        pathname: new URL(request.url()).pathname,
        error: request.failure()?.errorText,
      });
  });
  p.on("response", (response) => {
    if (response.status() >= 400)
      failedRequests.push({
        pathname: new URL(response.url()).pathname,
        status: response.status(),
      });
  });
}
async function localContext(options = {}) {
  const c = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 1,
    locale: "es-PE",
    timezoneId: "America/Lima",
    colorScheme: "light",
    ...options,
  });
  await c.route("**/*", (route) => {
    const url = new URL(route.request().url());
    return ["http:", "https:"].includes(url.protocol) && url.origin !== base
      ? route.abort("blockedbyclient")
      : route.continue();
  });
  return c;
}
async function getState(c = context) {
  const response = await c.request.get(`${base}/api/state`);
  assert.equal(response.status(), 200);
  return (await response.json()).state;
}
async function command(c, type, payload) {
  const response = await c.request.post(`${base}/api/command`, {
    data: { request_id: crypto.randomUUID(), type, payload },
  });
  const data = await response.json();
  assert.equal(
    response.status(),
    200,
    `${type}: ${data.error || "respuesta inválida"}`,
  );
  return data;
}
async function readyView(p, title) {
  await p
    .getByRole("heading", { name: title, exact: true })
    .first()
    .waitFor({ timeout: 120000 });
  await p.evaluate(() => document.fonts.ready);
  const images = p.locator("img");
  for (let i = 0; i < (await images.count()); i++)
    await images.nth(i).evaluate((img) => img.decode());
  await p.locator(".loading-screen").waitFor({ state: "hidden" });
}
async function prepare(c) {
  const p = await c.newPage();
  observe(p);
  await p.goto(`${base}/signin-with-chatgpt?return_to=%2F`);
  await readyView(p, "Resumen");
  const seed = await getState(c);
  check(
    "Base nueva aislada: sin operaciones",
    [
      seed.sales.length,
      seed.productions.length,
      seed.payments.length,
      seed.customers.length,
      seed.expenses.length,
    ],
    [0, 0, 0, 0, 0],
  );
  await command(c, "USER_SAVE", {
    id: seed.users[0].id,
    name: f.userName,
    role: "ADMIN",
    is_active: true,
  });
  for (const [i, site] of seed.sites.entries())
    await command(c, "SITE_SAVE", {
      id: site.id,
      name: `Sede Demo ${String(i + 1).padStart(2, "0")}`,
      is_active: true,
    });
  for (const [i, product] of seed.products.entries())
    await command(c, "PRODUCT_SAVE", {
      id: product.id,
      name: product.name,
      category: product.category,
      default_sale_price: f.productPrices[i],
      standard_bag_weight_kg: product.standard_bag_weight_kg / 1000,
      bags_per_nucleus: product.bags_per_nucleus,
      commercial_weight_per_nucleus_kg:
        product.commercial_weight_per_nucleus_kg / 1000,
      is_sellable: product.is_sellable,
      is_active: true,
    });
  for (const [i, ingredient] of seed.ingredients.entries())
    await command(c, "INGREDIENT_SAVE", {
      id: ingredient.id,
      name: ingredient.name,
      current_price_per_kg: f.ingredientPrices[i],
      is_active: true,
    });
  await command(c, "CONFIG_SAVE", {
    company_name: "Nutrequine Pro",
    tax_id: "",
    address: "",
    phone: "",
    contact_email: "",
    default_nucleus_cost: f.nucleusCost,
    default_packaging_cost: f.packagingCost,
    default_payment_condition: "CREDIT",
    default_payment_method: "TRANSFER",
    expense_categories: seed.config.expense_categories,
  });
  const customer = (
    await command(c, "CUSTOMER_SAVE", {
      name: f.customerName,
      notes: f.note,
      site_ids: ["site-1"],
      is_active: true,
    })
  ).result;
  const historical = (
    await command(c, "CUSTOMER_SAVE", {
      name: f.historicalCustomerName,
      notes: f.note,
      site_ids: ["site-1"],
      is_active: true,
    })
  ).result;
  const baseline = await command(c, "PRODUCTION_SAVE", {
    production_date: f.day,
    notes: "Lote Demo de inventario",
    products: ["prod-1", "prod-2", "prod-3"].map((product_id) => ({
      product_id,
      nuclei_count: 1,
    })),
    nucleus_cost: f.nucleusCost,
    packaging_cost: f.packagingCost,
    nucleus_paid: true,
    packaging_paid: true,
    costs: [
      {
        category: "FREIGHT",
        description: "Flete Demo",
        amount: f.baselineFreight,
        is_paid: true,
      },
    ],
    confirm: true,
  });
  await command(c, "PRODUCTION_RECONCILE", {
    id: baseline.result,
    reason: f.note,
    ingredients: baseline.state.productionIngredients
      .filter(
        (x) => x.production_id === baseline.result && x.is_current !== false,
      )
      .map((x) => ({
        id: x.id,
        discount_amount: 0,
        actual_charge: x.theoretical_net_cost / 100,
        is_paid: true,
      })),
    costs: baseline.state.productionCosts
      .filter(
        (x) => x.production_id === baseline.result && x.is_current !== false,
      )
      .map((x) => ({ id: x.id, amount: x.amount / 100, is_paid: true })),
  });
  await command(c, "PRODUCTION_CLOSE", { id: baseline.result });
  const prior = await command(c, "SALE_SAVE", {
    customer_id: historical,
    site_id: "site-1",
    sale_date: f.day,
    payment_condition: "CASH",
    paid_amount: 6660,
    payment_date: f.day,
    payment_method: "TRANSFER",
    reference: "DEMO-PREPARACION",
    notes: f.note,
    items: ["prod-1", "prod-2", "prod-3"].map((product_id, i) => ({
      product_id,
      quantity: 30,
      unit_weight_kg: 25,
      unit_price: f.productPrices[i],
    })),
    confirm: true,
    deliver: true,
  });
  check(
    "Venta ficticia previa",
    saleSummary(
      prior.state,
      prior.state.sales.find((x) => x.id === prior.result),
    ).total,
    666000,
  );
  const draftInput = {
    production_date: f.day,
    notes: "Lote Demo 001",
    products: [{ product_id: "prod-2", nuclei_count: 1 }],
    nucleus_cost: f.nucleusCost,
    packaging_cost: f.packagingCost,
    nucleus_paid: true,
    packaging_paid: true,
    costs: [
      {
        category: "FREIGHT",
        description: "Flete Demo",
        amount: f.productionFreight,
        is_paid: true,
      },
    ],
    confirm: false,
  };
  const draft = await command(c, "PRODUCTION_SAVE", draftInput);
  draftInput.id = draft.result;
  draftInput.ingredients = draft.state.productionIngredients
    .filter((x) => x.production_id === draft.result && x.is_current !== false)
    .map((x) => ({
      ingredient_id: x.ingredient_id,
      discount_amount: 0,
      actual_charge: x.theoretical_net_cost / 100,
      is_paid: true,
    }));
  const saved = await command(c, "PRODUCTION_SAVE", draftInput);
  const expense = await command(c, "EXPENSE_CREATE", {
    date: f.day,
    ...f.expense,
    site_id: "site-1",
    notes: f.note,
  });
  const initial = expense.state;
  check("Stock inicial Hi-Performance", stock(initial, "prod-2").quantity, 10);
  check("Saldo inicial", balanceSummary(initial).receivable, 0);
  check(
    "Gasto ficticio persistido",
    initial.expenses.find((x) => x.id === expense.result).amount,
    8500,
  );
  // Warm all real views before recording so module compilation stays outside the clips.
  for (const [, title, hash] of modulePlan) {
    await p.goto(`${base}/#${hash}`);
    await readyView(p, title);
  }
  await p.close();
  return {
    customer,
    historical,
    production: saved.result,
    productionCode: saved.state.productions.find((x) => x.id === saved.result)
      .code,
    expense: expense.result,
    initial: balanceSummary(initial),
  };
}

async function installPointerOverlay(p) {
  await p.evaluate((settings) => {
    const style = document.createElement("style");
    style.textContent = `html,body,body *{cursor:none!important}#showcase-pointer-overlay{position:fixed;inset:0;width:100vw;height:100vh;margin:0;padding:0;border:0;max-width:none;max-height:none;background:transparent;overflow:visible;pointer-events:none!important;z-index:2147483647}#showcase-pointer-overlay *{pointer-events:none!important}.showcase-pointer{position:absolute;left:0;top:0;width:${24 * settings.scale}px;height:${31 * settings.scale}px;filter:drop-shadow(0 1px 2px #fff9);will-change:transform}.showcase-click{position:absolute;width:18px;height:18px;margin:-9px;border:2px solid ${settings.pulseColor};border-radius:50%;box-sizing:border-box;animation:showcase-real-click ${settings.pulseDurationMs}ms ease-out forwards}@keyframes showcase-real-click{from{transform:scale(.6);opacity:.9}to{transform:scale(2.8);opacity:0}}`;
    document.head.append(style);
    const layer = document.createElement("div");
    layer.id = "showcase-pointer-overlay";
    layer.setAttribute("popover", "manual");
    layer.innerHTML = `<svg class="showcase-pointer" viewBox="0 0 24 31" aria-hidden="true"><path d="M2 2L2 25L8.4 19.7L13.3 29L17.2 26.8L12.4 17.9L21 17.4Z" fill="${settings.color}" stroke="#fff" stroke-width="1.7" stroke-linejoin="round"/></svg>`;
    document.body.append(layer);
    layer.showPopover();
    const pointer = layer.querySelector("svg");
    window.__showcaseEvents = [];
    let frontDialog = null;
    const front = () => {
      const openDialog = document.querySelector("dialog[open]");
      if (openDialog !== frontDialog) {
        layer.hidePopover();
        layer.showPopover();
        frontDialog = openDialog;
      }
    };
    document.addEventListener(
      "pointermove",
      (event) => {
        front();
        pointer.style.transform = `translate(${event.clientX}px,${event.clientY}px)`;
        window.__showcaseEvents.push({
          kind: "move",
          wall: Date.now(),
          x: event.clientX,
          y: event.clientY,
        });
      },
      { capture: true },
    );
    document.addEventListener(
      "pointerdown",
      (event) => {
        front();
        const ring = document.createElement("div");
        ring.className = "showcase-click";
        ring.style.left = `${event.clientX}px`;
        ring.style.top = `${event.clientY}px`;
        layer.append(ring);
        setTimeout(() => ring.remove(), settings.pulseDurationMs + 30);
        window.__showcaseEvents.push({
          kind: "click",
          wall: Date.now(),
          x: event.clientX,
          y: event.clientY,
          target:
            window.__showcaseTarget ||
            event.target.textContent?.trim().slice(0, 80) ||
            event.target.tagName,
        });
      },
      { capture: true },
    );
  }, cursor);
  await p.mouse.move(mousePosition.x, mousePosition.y);
}
async function moveTo(x, y, duration = 340) {
  const from = { ...mousePosition };
  const beginning = Date.now();
  // Match the 30 FPS delivery; native pointer events remain continuous and eased.
  const steps = Math.max(8, Math.round(duration / 32));
  for (let step = 1; step <= steps; step++) {
    const t = step / steps,
      easing = t * t * (3 - 2 * t);
    await page.mouse.move(
      from.x + (x - from.x) * easing,
      from.y + (y - from.y) * easing,
    );
    const remaining = beginning + duration * t - Date.now();
    if (remaining > 0) await pause(remaining);
  }
  mousePosition = { x, y };
}
async function boxFor(locator) {
  let box = await locator.boundingBox();
  if (!box) {
    await locator.waitFor({ state: "visible" });
    box = await locator.boundingBox();
  }
  assert.ok(box, "El objetivo del cursor debe ser visible.");
  if (
    box.y < 0 ||
    box.y + box.height > 1080 ||
    box.x < 0 ||
    box.x + box.width > 1920
  ) {
    await locator.scrollIntoViewIfNeeded();
    box = await locator.boundingBox();
    assert.ok(box);
  }
  return box;
}
async function pointAt(locator, duration = 340) {
  const box = await boxFor(locator);
  await moveTo(box.x + box.width / 2, box.y + box.height / 2, duration);
  return box;
}
async function click(locator, target, duration = 340) {
  const box = await pointAt(locator, duration);
  await page.evaluate((label) => {
    window.__showcaseTarget = label;
  }, target);
  await pause(35);
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2, {
    delay: 45,
  });
  await pause(70);
  return box;
}
async function choose(locator, value, target, duration = 230) {
  await click(locator, target, duration);
  await page.keyboard.press("Escape");
  await locator.selectOption(value);
  await pause(80);
}
async function type(locator, value, target, duration = 230) {
  await click(locator, target, duration);
  await page.keyboard.press("ControlOrMeta+A");
  // Native text insertion into the focused input (the same input event as a paste).
  await page.keyboard.insertText(String(value));
  await pause(80);
}
async function submit(locator, typeName) {
  const pending = page.waitForResponse(
    (response) =>
      response.url() === `${base}/api/command` &&
      response.request().postDataJSON()?.type === typeName,
  );
  await click(locator, typeName, 290);
  const response = await pending,
    data = await response.json();
  check(`HTTP ${typeName}`, response.status(), 200);
  return data;
}
async function navigation(id, title, hash) {
  const locator = page
    .locator("nav")
    .getByRole("button", { name: title, exact: true });
  const box = await pointAt(locator, id === "production" ? 450 : 350);
  const before = now();
  await page.evaluate((label) => {
    window.__showcaseTarget = label;
  }, `Navegar: ${title}`);
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2, {
    delay: 45,
  });
  const after = now();
  if (id === "production")
    calibrationCue = {
      before,
      after,
      pixel: {
        x: Math.floor(box.x + box.width - 42),
        y: Math.floor(box.y + 7),
      },
    };
  // Fonts and brand images were decoded before capture; only await the real view change here.
  await page
    .getByRole("heading", { name: title, exact: true })
    .first()
    .waitFor();
  check(`Ruta de ${title}`, new URL(page.url()).hash, `#${hash}`);
  moduleAssertions.push({
    id,
    title,
    hash: `#${hash}`,
    headingVisible: true,
    passed: true,
  });
  await pause(180);
}
async function screenshot(name) {
  const filename = `${rehearsal ? "rehearsal-" : ""}${name}.png`;
  await page.screenshot({ path: path.join(qaDir, filename) });
  activeScene?.screenshots.push(`../qa/${filename}`);
}
async function scene(id, action) {
  const [, title, hash, targetSeconds] = modulePlan.find(
    (entry) => entry[0] === id,
  );
  const handleStart = now();
  await pause(handleSeconds * 1000);
  activeScene = {
    id,
    title,
    start: now(),
    targetSeconds,
    screenshots: [],
    handles: { before: handleSeconds, after: handleSeconds },
  };
  const beginning = Date.now();
  await action({ title, hash });
  const remaining = targetSeconds * 1000 - (Date.now() - beginning);
  if (remaining > 0) await pause(remaining);
  activeScene.end = now();
  if (!activeScene.screenshots.length) await screenshot(id);
  await pause(handleSeconds * 1000);
  activeScene.handles.handleStart = handleStart;
  activeScene.handles.handleEnd = now();
  const events = await page.evaluate(() => window.__showcaseEvents);
  activeScene.clicks = events
    .filter(
      (event) =>
        event.kind === "click" &&
        (event.wall - epoch) / 1000 >= activeScene.start &&
        (event.wall - epoch) / 1000 <= activeScene.end,
    )
    .map(({ wall, ...event }) => ({
      ...event,
      at: (wall - epoch) / 1000 - activeScene.start,
    }));
  activeScene.pointer = events
    .filter(
      (event) =>
        event.kind === "move" &&
        (event.wall - epoch) / 1000 >= handleStart &&
        (event.wall - epoch) / 1000 <= activeScene.handles.handleEnd,
    )
    .map(({ wall, ...event }) => ({
      ...event,
      at: (wall - epoch) / 1000 - activeScene.start,
    }));
  activeScene.speed = (activeScene.end - activeScene.start) / targetSeconds;
  assert.ok(
    activeScene.speed < 1.35,
    `${id} dura demasiado para una interacción legible: ${activeScene.speed.toFixed(2)}×`,
  );
  assert.equal(
    await page.locator(".error[role=alert]").count(),
    0,
    "No se captura una pantalla de error.",
  );
  const visible = await page.locator("body").innerText();
  assert.ok(
    !visible.includes("local_seedy") && !visible.includes("ID autenticado"),
    "No mostrar identificadores autenticados.",
  );
  assert.ok(
    !/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(visible),
    "No mostrar correos.",
  );
  activeScene.safeDemoOnly = true;
  scenes.push(activeScene);
  console.log(
    `Verificado: ${title}; ${activeScene.clicks.length} clics reales; ${activeScene.speed.toFixed(2)}×`,
  );
  activeScene = null;
}
async function expectText(locator, value) {
  await locator
    .filter({ hasText: value })
    .first()
    .waitFor({ state: "visible" });
}
async function binaryOutput(binary, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(binary, args, {
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const chunks = [],
      diagnostics = [];
    child.stdout.on("data", (chunk) => chunks.push(chunk));
    child.stderr.on("data", (chunk) => diagnostics.push(chunk));
    child.once("error", reject);
    child.once("close", (code) =>
      code === 0
        ? resolve(Buffer.concat(chunks))
        : reject(new Error(Buffer.concat(diagnostics).toString())),
    );
  });
}
async function alignVideo() {
  const { ffmpeg, ffprobe } = binaries();
  const { x, y } = calibrationCue.pixel;
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
  check(
    "Calibración: muestras y frames",
    pixels.length / 64,
    metadata.frames.length,
  );
  const averages = metadata.frames.map(
    (_, i) =>
      pixels
        .subarray(i * 64, (i + 1) * 64)
        .reduce((sum, value) => sum + value, 0) / 64,
  );
  const frame = averages.findIndex(
    (value, i) => value < 80 && averages[i + 1] < 80 && averages[i + 2] < 80,
  );
  assert.ok(
    frame > 0,
    "Debe identificarse el cambio real de navegación a Producción.",
  );
  const mediaTime = Number(metadata.frames[frame].best_effort_timestamp_time),
    wallTime = (calibrationCue.before + calibrationCue.after) / 2,
    offset = mediaTime - wallTime;
  assert.ok(
    offset >= -5 && offset <= 0.5,
    "Desfase de captura requiere revisión.",
  );
  for (const item of scenes) {
    item.wallStart = item.start;
    item.wallEnd = item.end;
    item.start += offset;
    item.end += offset;
    item.handles.handleStart += offset;
    item.handles.handleEnd += offset;
    assert.ok(item.handles.handleStart >= 0);
  }
  check(
    "Calibración: transición auténtica",
    averages[frame] < 80 && averages[frame - 1] >= 80,
    true,
  );
  return {
    method:
      "First actual Producción navigation activation: native 8×8 sidebar background",
    pixel: calibrationCue.pixel,
    wallBefore: calibrationCue.before,
    wallAfter: calibrationCue.after,
    sourceFrame: frame,
    videoCueTime: mediaTime,
    offsetSeconds: offset,
    toleranceSeconds: (calibrationCue.after - calibrationCue.before) / 2 + 0.04,
  };
}
async function stopOwnedServer() {
  if (!server || server.exitCode != null) return;
  if (process.platform === "win32")
    await new Promise((resolve) => {
      const child = spawn(
        "taskkill",
        ["/PID", String(server.pid), "/T", "/F"],
        { windowsHide: true, stdio: "ignore" },
      );
      child.once("close", resolve);
    });
  else server.kill("SIGTERM");
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
  context = await localContext({
    storageState,
    ...(!rehearsal
      ? { recordVideo: { dir: rawDir, size: { width: 1920, height: 1080 } } }
      : {}),
  });
  epoch = Date.now();
  page = await context.newPage();
  observe(page);
  await page.goto(`${base}/#dashboard`);
  await readyView(page, "Resumen");
  await page.getByText(f.userName, { exact: true }).waitFor();
  await installPointerOverlay(page);
  await pause(600);
  let demoSale, saleCode, demoPayment, final;
  await scene("summary", async () => {
    moduleAssertions.push({
      id: "summary",
      title: "Resumen",
      hash: "#dashboard",
      headingVisible: true,
      passed: true,
    });
    check("Resumen inicial sin deuda", fixtures.initial.receivable, 0);
    await pointAt(
      page
        .locator(".metric")
        .filter({ hasText: "Ventas registradas" })
        .locator("strong"),
      750,
    );
    await pause(250);
    await pointAt(
      page.locator(".product-card").filter({ hasText: "Hi-Performance" }),
      650,
    );
    await screenshot("summary-wide");
  });
  await scene("production", async ({ title, hash }) => {
    await navigation("production", title, hash);
    await click(
      page.getByRole("button", { name: fixtures.productionCode, exact: true }),
      "Abrir producción",
      350,
    );
    await page.getByText("Lote Demo 001", { exact: true }).waitFor();
    await pause(200);
    const result = await submit(
      page.getByRole("button", { name: "Confirmar producción", exact: true }),
      "PRODUCTION_CONFIRM",
    );
    const production = result.state.productions.find(
        (x) => x.id === fixtures.production,
      ),
      p = productionSummary(result.state, production);
    check("Producción confirmada", production.status, "CONFIRMED");
    check("Producción: 40 sacos y 1000 kg", [p.bags, p.weight], [40, 1000000]);
    check("Costo real producción", p.real, 133640);
    check("Costos conciliados", p.reconciled, true);
    check(
      "Producción aumenta stock: 10 a 50",
      stock(result.state, "prod-2").quantity,
      50,
    );
    await expectText(page.locator(".badge"), "Confirmada");
    await screenshot("production-confirmed");
    await pointAt(
      page.getByRole("heading", {
        name: "Costos de insumos y diferencias",
        exact: true,
      }),
      240,
    );
    await page
      .locator(".modal-body")
      .evaluate((el) => el.scrollTo({ top: 275, behavior: "smooth" }));
    await pause(350);
    await screenshot("production-costs");
  });
  await click(
    page.getByRole("button", { name: "Cerrar", exact: true }),
    "Cerrar detalle de producción",
    230,
  );
  await scene("inventory", async ({ title, hash }) => {
    await navigation("inventory", title, hash);
    await pointAt(
      page.locator(".product-card").filter({ hasText: "Hi-Performance" }),
      650,
    );
    const row = page.getByRole("row").filter({ hasText: "Hi-Performance" });
    await expectText(row, "50");
    check(
      "Inventario muestra 50 sacos",
      stock(await getState(), "prod-2").quantity,
      50,
    );
    await pause(750);
    await click(
      page.getByRole("button", { name: "Movimientos", exact: true }),
      "Ver movimientos de inventario",
      350,
    );
    await page
      .getByRole("columnheader", { name: "Origen", exact: true })
      .waitFor();
    await expectText(page.locator("tbody"), fixtures.productionCode);
    check(
      "Inventario enlaza producción real",
      (await getState()).inventoryMovements.some(
        (x) =>
          x.source_id === fixtures.production &&
          x.item_type === "PRODUCT" &&
          x.quantity === 40,
      ),
      true,
    );
    await screenshot("inventory-traceability");
  });
  await scene("sales", async ({ title, hash }) => {
    await navigation("sales", title, hash);
    await click(
      page.getByRole("button", { name: "Nueva venta", exact: true }),
      "Nueva venta",
      350,
    );
    await choose(
      page.getByRole("dialog").getByLabel("Cliente", { exact: true }),
      fixtures.customer,
      "Seleccionar Cliente Demo",
      220,
    );
    await choose(
      page.getByLabel("Producto", { exact: true }),
      "prod-2",
      "Seleccionar Hi-Performance",
      220,
    );
    check(
      "Autocompletado precio",
      await page.getByLabel("Precio por saco", { exact: true }).inputValue(),
      "72",
    );
    check(
      "Autocompletado peso",
      await page.getByLabel("Peso por saco", { exact: true }).inputValue(),
      "25",
    );
    await type(
      page.getByLabel("Cantidad de sacos", { exact: true }),
      10,
      "Escribir 10 sacos",
      220,
    );
    await expectText(page.locator(".total-line strong"), "720.00");
    await pause(500);
    await screenshot("sales-total");
    const result = await submit(
      page.getByRole("button", { name: "Confirmar venta", exact: true }),
      "SALE_SAVE",
    );
    demoSale = result.result;
    const sale = result.state.sales.find((x) => x.id === demoSale),
      summary = saleSummary(result.state, sale);
    saleCode = sale.code;
    check(
      "Venta crédito entregada",
      [sale.payment_condition, sale.commercial_status, sale.fulfillment_status],
      ["CREDIT", "CONFIRMED", "DELIVERED"],
    );
    check(
      "Venta: 720 sin pago",
      [summary.total, summary.paid, summary.balance],
      [72000, 0, 72000],
    );
    check(
      "Venta reduce stock: 50 a 40",
      stock(result.state, "prod-2").quantity,
      40,
    );
    await page.getByRole("heading", { name: saleCode, exact: true }).waitFor();
    await pause(450);
    await screenshot("sales-confirmed");
  });
  await click(
    page.getByRole("button", { name: "Cerrar", exact: true }),
    "Cerrar detalle de venta",
    230,
  );
  await scene("collections", async ({ title, hash }) => {
    await navigation("collections", title, hash);
    await click(
      page.getByRole("button", { name: saleCode, exact: true }),
      "Consultar saldo venta",
      290,
    );
    await click(
      page
        .getByRole("dialog")
        .getByRole("button", { name: "Registrar pago", exact: true }),
      "Registrar pago parcial",
      270,
    );
    await type(
      page.getByLabel("Monto recibido S/", { exact: true }),
      300,
      "Escribir pago 300",
      220,
    );
    await type(
      page.getByLabel(`Aplicar a ${saleCode}`, { exact: true }),
      300,
      "Aplicar pago a venta",
      220,
    );
    await expectText(page.locator(".total-line"), "300.00");
    await pause(180);
    const result = await submit(
      page
        .getByRole("dialog")
        .getByRole("button", { name: "Registrar pago", exact: true }),
      "PAYMENT_CREATE",
    );
    demoPayment = result.result;
    const summary = saleSummary(
      result.state,
      result.state.sales.find((x) => x.id === demoSale),
    );
    check(
      "Pago parcial: 720/300/420",
      [summary.total, summary.paid, summary.balance, summary.financial_status],
      [72000, 30000, 42000, "PARTIAL"],
    );
    check(
      "Pago aplicado a la venta creada",
      result.state.paymentApplications.some(
        (x) =>
          x.payment_id === demoPayment &&
          x.sale_id === demoSale &&
          x.applied_amount === 30000,
      ),
      true,
    );
    await click(
      page
        .getByRole("dialog")
        .getByRole("button", { name: saleCode, exact: true }),
      "Ver saldo después del pago",
      280,
    );
    const balance = page
      .getByRole("dialog")
      .locator(".metric")
      .filter({ hasText: "Saldo" })
      .locator("strong");
    await expectText(balance, "420.00");
    await pointAt(balance, 350);
    await pause(450);
  });
  await click(
    page.getByRole("button", { name: "Cerrar", exact: true }),
    "Cerrar saldo",
    230,
  );
  await scene("expenses", async ({ title, hash }) => {
    await navigation("expenses", title, hash);
    const row = page
      .getByRole("row")
      .filter({ hasText: f.expense.description });
    await expectText(row, "85.00");
    await pointAt(row.getByRole("cell").nth(2), 500);
    await pause(400);
    await pointAt(row.getByRole("cell").nth(3), 500);
    const expense = (await getState()).expenses.find(
      (x) => x.id === fixtures.expense,
    );
    check(
      "Gasto confirmado y relación ficticia",
      [expense.amount, expense.status, expense.site_id],
      [8500, "CONFIRMED", "site-1"],
    );
    await screenshot("expenses-real-row");
  });
  await scene("balance", async ({ title, hash }) => {
    await navigation("balance", title, hash);
    final = await getState();
    const b = balanceSummary(final);
    check(
      "Balance ventas/cobros/deuda",
      [b.sales, b.collections, b.receivable],
      [738000, 696000, 42000],
    );
    check(
      "Balance costos/gasto/estimado/caja",
      [b.costs, b.logistics, b.estimated_result, b.cash_result],
      [533550, 8500, 195950, 153950],
    );
    await page
      .getByRole("heading", {
        name: "Resultado comercial estimado",
        exact: true,
      })
      .waitFor();
    await expectText(page.locator(".balance-lines").first(), "1,959.50");
    await pointAt(
      page
        .locator(".metric")
        .filter({ hasText: "Cobros reales" })
        .locator("strong"),
      500,
    );
    await pause(250);
    await pointAt(
      page.locator(".balance-lines").first().locator("div").last(),
      600,
    );
    await screenshot("balance-estimated");
  });
  await scene("customers", async ({ title, hash }) => {
    await navigation("customers", title, hash);
    await click(
      page.getByRole("button", { name: f.customerName, exact: true }),
      "Abrir cuenta Cliente Demo",
      350,
    );
    await page
      .getByRole("dialog")
      .getByRole("heading", { name: f.customerName, exact: true })
      .waitFor();
    await expectText(
      page
        .getByRole("dialog")
        .locator(".metric")
        .filter({ hasText: "Deuda pendiente" }),
      "420.00",
    );
    check(
      "Cliente tiene saldo de demo",
      saleSummary(
        final,
        final.sales.find((x) => x.id === demoSale),
      ).balance,
      42000,
    );
    await pointAt(page.getByRole("dialog").locator(".metric").first(), 450);
    await screenshot("customers-account");
  });
  await click(
    page.getByRole("button", { name: "Cerrar", exact: true }),
    "Cerrar cuenta cliente",
    230,
  );
  await scene("configuration", async ({ title, hash }) => {
    await navigation("configuration", title, hash);
    await page
      .getByRole("heading", { name: "Valores predeterminados", exact: true })
      .waitFor();
    await pointAt(
      page.getByRole("button", { name: "Productos", exact: true }),
      380,
    );
    check(
      "Configuración visible sin contacto privado",
      [
        final.config.tax_id,
        final.config.address,
        final.config.phone,
        final.config.contact_email,
      ],
      ["", "", "", ""],
    );
    await screenshot("configuration-safe");
  });
  const counts = [
    final.sales.length,
    final.productions.length,
    final.payments.length,
    final.expenses.length,
  ];
  await page.reload();
  await readyView(page, "Configuración");
  const persisted = await getState();
  check(
    "Recarga sin duplicados",
    [
      persisted.sales.length,
      persisted.productions.length,
      persisted.payments.length,
      persisted.expenses.length,
    ],
    counts,
  );
  check(
    "Persistencia saldo 420",
    saleSummary(
      persisted,
      persisted.sales.find((x) => x.id === demoSale),
    ).balance,
    42000,
  );
  check(
    "Inventario final consistente",
    [
      stock(persisted, "prod-1").quantity,
      stock(persisted, "prod-2").quantity,
      stock(persisted, "prod-3").quantity,
    ],
    [10, 40, 10],
  );
  check(
    "Nueve módulos verificados",
    moduleAssertions.map((x) => x.id),
    modulePlan.map((x) => x[0]),
  );
  check(
    "Tres secuencias principales tienen clics reales",
    ["production", "sales", "collections"].every(
      (id) => scenes.find((x) => x.id === id).clicks.length >= 3,
    ),
    true,
  );
  check("Errores de navegador", errors, []);
  check("Solicitudes fallidas", failedRequests, []);
  const video = page.video();
  await context.close();
  context = null;
  let alignment;
  if (!rehearsal) {
    await video.saveAs(source);
    alignment = await alignVideo();
  }
  const report = {
    passed: true,
    runId,
    mode: rehearsal ? "rehearsal" : "capture",
    localOnly: true,
    externalRequestsBlocked: true,
    stateIsolated: true,
    viewport: [1920, 1080],
    locale: "es-PE",
    timezone: "America/Lima",
    browser: await browser.version(),
    pointerOverlay: {
      ...cursor,
      eventSource: "native Playwright mouse / DOM pointermove and pointerdown",
      noSyntheticBusinessUI: true,
    },
    checks,
    moduleAssertions,
    errors,
    failedRequests,
    scenes,
    alignment,
    elapsedSeconds: (Date.now() - started) / 1000,
  };
  await writeFile(
    path.join(qaDir, rehearsal ? "rehearsal-e2e.json" : "e2e.json"),
    JSON.stringify(report, null, 2) + "\n",
  );
  if (!rehearsal)
    await writeFile(
      path.join(dir, "data", "capture.json"),
      JSON.stringify(
        {
          source: "../assets/captures/source.webm",
          viewport: [1920, 1080],
          fpsTarget: 30,
          cursor,
          alignment,
          scenes,
        },
        null,
        2,
      ) + "\n",
    );
  console.log(
    `OK: ${checks.length} comprobaciones, 9 módulos, sin errores. ${rehearsal ? "Ensayo" : "Captura auténtica guardada"}.`,
  );
} catch (error) {
  await writeFile(
    path.join(
      qaDir,
      rehearsal ? "rehearsal-failure.json" : "capture-failure.json",
    ),
    JSON.stringify(
      {
        passed: false,
        runId,
        error: error.message,
        checks,
        moduleAssertions,
        errors,
        failedRequests,
        scenes,
        failedScene: activeScene,
      },
      null,
      2,
    ) + "\n",
  );
  throw error;
} finally {
  if (context) await context.close();
  if (browser) await browser.close();
  await stopOwnedServer();
}
