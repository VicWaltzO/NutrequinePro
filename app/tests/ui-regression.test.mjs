import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createUiHarness } from "./helpers/ui-harness.mjs";

test("vistas por rol, rutas antiguas y formularios conservan la referencia del rediseño corporativo", () => {
  const baseline = JSON.parse(readFileSync(new URL("./fixtures/ui-corporate.json", import.meta.url), "utf8"));
  const current = createUiHarness().snapshots({
    // NQP12 changes only column headers. Keep the existing golden for every cell,
    // form control and surrounding screen; new headers are checked separately.
    normalize: (html) =>
      html
        // The only new navigation control; micros has its own interactive E2E.
        .replace('<button type="button" class="">Microinsumos</button>', "")
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
