import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createUiHarness } from "./helpers/ui-harness.mjs";

// Only this exact new SSR loading segment is isolated from the historical golden.
// Requiring it immediately inside main also tests presence, uniqueness and order.
// Loaded content, grouping, precision and resolution have their own unit/E2E tests.
const alertHarness = createUiHarness();
const globalAlerts = `<div class="global-alerts">${alertHarness.renderComponent(
  "features/microinsumos/components/GlobalMicroAlerts.tsx",
  "default",
  { state: alertHarness.state(), context: "dashboard" },
)}</div>`;
const mainOpening = '<main id="main-content" tabindex="-1">';
function isolateGlobalAlerts(html) {
  assert.equal(html.split(globalAlerts).length - 1, 1, "Una única franja global SSR debe existir");
  assert.ok(html.includes(mainOpening + globalAlerts), "La franja global debe preceder al contenido de main");
  return html.replace(mainOpening + globalAlerts, mainOpening);
}

test("vistas por rol, rutas antiguas y formularios conservan la referencia del rediseño corporativo", () => {
  const baseline = JSON.parse(readFileSync(new URL("./fixtures/ui-corporate.json", import.meta.url), "utf8"));
  const current = createUiHarness().snapshots({
    // NQP12 changes only column headers. Keep the existing golden for every cell,
    // form control and surrounding screen; new headers are checked separately.
    normalize: (html) =>
      isolateGlobalAlerts(html)
        // The only new navigation control; micros has its own interactive E2E.
        .replace('<button type="button" class="">Microinsumos</button>', "")
        // NQP33 adds this tab; its valuation flow has dedicated interactive coverage.
        .replace('<button type="button" class="">Valoración</button>', "")
        // NQP33 economic detail is asserted below and through its interactive E2E.
        .replace(/<section class="panel" aria-label="Costo histórico comercial">[\s\S]*?<\/section>/g, "")
        // NQP29 adds only this tab to legacy routes; its flow is covered by E2E.
        .replace('<button type="button" class="">Jornadas</button>', "")
        .replace(
          /<th scope="col"><button type="button" class="table-sort"[^>]*><span>([^<]*)<\/span><svg[\s\S]*?<\/svg><\/button><\/th>/g,
          "<th>$1</th>",
        )
        .replace(/<th scope="col">/g, "<th>"),
  });
  assert.deepEqual(Object.keys(current), Object.keys(baseline.snapshots));
  for (const [scenario, expected] of Object.entries(baseline.snapshots)) {
    assert.equal(current[scenario], expected, `Cambió el HTML del escenario ${scenario}`);
  }
});

test("NQP38: aislamiento exacto exige franja única, posición global y conserva HTML adyacente", () => {
  const historical = "<h1>Contenido histórico</h1>";
  const html = mainOpening + globalAlerts + historical + "</main>";
  assert.equal(isolateGlobalAlerts(html), mainOpening + historical + "</main>");
  assert.throws(() => isolateGlobalAlerts(html.replace(globalAlerts, "")), /única franja/);
  assert.throws(
    () => isolateGlobalAlerts(html.replace(globalAlerts, globalAlerts + globalAlerts)),
    /única franja/,
  );
  assert.throws(() => isolateGlobalAlerts(mainOpening + historical + globalAlerts + "</main>"), /preceder/);
  const changed = html.replace(historical, "<h1>Cambio colateral</h1>");
  assert.notEqual(isolateGlobalAlerts(changed), mainOpening + historical + "</main>");
});

test("NQP29 navegación ofrece jornada por rol sin cambiar el ingreso histórico", () => {
  const harness = createUiHarness();
  for (const role of ["ADMIN", "OPERATOR", "VIEWER"]) {
    assert.match(harness.render("productions", role), />Jornadas<\/button>/);
    const html = harness.render("productions/journeys", role);
    assert.match(html, /Órdenes de jornada/);
    if (role === "VIEWER") assert.doesNotMatch(html, />Nueva jornada<\/button>/);
    else assert.match(html, />Nueva jornada<\/button>/);
  }
});

test("NQP33 valoración visible en tres roles y escritura restringida a ADMIN", () => {
  const harness = createUiHarness();
  for (const role of ["ADMIN", "OPERATOR", "VIEWER"]) {
    const html = harness.render("inventory/valuation", role);
    assert.match(html, /Valoración comercial/);
    assert.match(html, /saldo físico actual como apertura pendiente/);
    if (role === "ADMIN") assert.match(html, />Iniciar valoración comercial<\/button>/);
    else assert.doesNotMatch(html, /aria-label="Registrar valoración comercial"/);
  }
});
