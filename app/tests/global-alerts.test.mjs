import { test } from "node:test";
import assert from "node:assert/strict";
import { createUiHarness } from "./helpers/ui-harness.mjs";
import { preparationFixture } from "./helpers/preparation-fixture.mjs";
import { microAlerts } from "../features/microinsumos/domain/alerts.mjs";

const file = "features/microinsumos/components/GlobalMicroAlerts.tsx";
const render = (preventive, extra = {}) =>
  createUiHarness().renderComponent(file, "MicroAlertBanner", {
    preventive,
    loading: false,
    error: false,
    ...extra,
  });

test("A38: ocho ingredientes compartidos por dos fórmulas, una franja y ocho detalles; resolución pura", () => {
  const { s } = preparationFixture();
  s.microIngredients = Array.from({ length: 8 }, (_, i) => ({
    ...s.microIngredients[0],
    id: `micro-${i}`,
    operational_id: i + 1,
    name: `Ingrediente sintético ${i + 1}`,
  }));
  s.microOpenings = s.microIngredients.map((m, i) => ({
    ...s.microOpenings[0],
    id: `opening-${i}`,
    micro_ingredient_id: m.id,
    quantity_grams: i,
  }));
  s.microFormulaLines = s.microFormulas.flatMap((f) =>
    s.microIngredients.map((m) => ({
      formula_id: f.id,
      micro_ingredient_id: m.id,
      dose_grams: 1,
    })),
  );
  const before = structuredClone(s);
  const preventive = microAlerts(s, s.microFormulas, []).preventive;
  assert.equal(preventive.items.length, 8);
  assert.deepEqual(
    preventive.items.map((i) => i.missing_hundredths),
    [2000, 1900, 1800, 1700, 1600, 1500, 1400, 1300],
  );
  const html = render(preventive);
  assert.equal((html.match(/<section/g) ?? []).length, 1);
  assert.equal((html.match(/<details/g) ?? []).length, 1);
  assert.equal((html.match(/<li>/g) ?? []).length, 8);
  assert.match(html, /8 microinsumos requieren reposición/);
  assert.deepEqual(s, before);
  s.microOpenings.forEach((o) => {
    o.quantity_grams = 20;
  });
  assert.equal(render(microAlerts(s, s.microFormulas, []).preventive), "");
});

test("A38: centésimas, saldo desconocido y familias sin autorizar no fingen suficiencia", () => {
  const preventive = {
    unavailable_families: ["ROSADO"],
    items: [
      {
        micro_ingredient_id: "one",
        operational_id: 1,
        name: "Precisión",
        status: "LOW",
        missing_hundredths: 1,
      },
      { micro_ingredient_id: "two", operational_id: 2, name: "Sin apertura", status: "UNAVAILABLE" },
      { micro_ingredient_id: "three", operational_id: 3, name: "Cubierto", status: "COVERED" },
    ],
  };
  const html = render(preventive);
  assert.match(html, /1 microinsumo requiere reposición/);
  assert.match(html, /1 con saldo no disponible/);
  assert.match(html, /Faltan 0.01 g/);
  assert.match(html, /Rosado/);
  assert.equal((html.match(/<li>/g) ?? []).length, 2);
  for (const extra of [{ loading: true }, { error: true }]) {
    const pending = render(preventive, extra);
    assert.doesNotMatch(pending, /Precisión|Sin apertura|requiere reposición/);
    assert.match(pending, /role="status"/);
  }
  assert.notEqual(render({ unavailable_families: ["ROSADO"], items: [] }), "");
});
