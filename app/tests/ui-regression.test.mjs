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
