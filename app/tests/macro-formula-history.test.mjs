import { test } from "node:test";
import assert from "node:assert/strict";
import { createUiHarness } from "./helpers/ui-harness.mjs";

const file = "features/produccion/components/MacroFormulaList.tsx";
const render = (h, state = h.state(), write = true) =>
  h.renderComponent(file, "default", { state, write, open: () => assert.fail("SSR no escribe") });
const activePart = (html) => html.split('<details class="formula-history">')[0];
const historyPart = (html) => html.split('<details class="formula-history">')[1];

test("A39: cuatro macros, v2/v3, fechas, dosis y lotes históricos sin mutación", () => {
  const h = createUiHarness();
  const initial = structuredClone(h.state());
  assert.equal(initial.formulas.filter((f) => f.is_active).length, 4);
  assert.equal((activePart(render(h)).match(/ · Activa/g) ?? []).length, 4);
  const first = initial.formulas[0];
  const ingredients = initial.formulaIngredients.filter((r) => r.formula_id === first.id);
  const batches = initial.productionProducts.filter((r) => r.formula_id === first.id);
  assert.ok(batches.length);
  for (const version of [2, 3]) {
    h.run("FORMULA_SAVE", {
      product_id: first.product_id,
      valid_from: `2026-10-${10 + version}`,
      ingredients: ingredients.map((r) => ({
        ingredient_id: r.ingredient_id,
        kg_per_nucleus: r.kg_per_nucleus / 1000 + version,
      })),
    });
    const before = structuredClone(h.state());
    const html = render(h);
    assert.equal((activePart(html).match(/ · Activa/g) ?? []).length, 4);
    assert.equal((historyPart(html).match(/ · Histórica/g) ?? []).length, version - 1);
    assert.ok(activePart(html).includes(`v${version} · Activa`));
    assert.ok(!activePart(html).includes("Histórica"));
    assert.ok(!historyPart(html).includes("Editar fórmula"));
    assert.ok(historyPart(html).includes("hasta 2026-10-12"));
    assert.deepEqual(structuredClone(h.state()), before);
    assert.deepEqual(
      structuredClone(h.state().productionProducts).filter((r) => r.formula_id === first.id),
      batches,
    );
    for (const key of ["productions", "productionIngredients", "productionCosts", "inventoryMovements"])
      assert.deepEqual(structuredClone(h.state()[key]), initial[key], key);
    assert.deepEqual(
      structuredClone(h.state().formulaIngredients).filter((r) => r.formula_id === first.id),
      ingredients,
    );
  }
  h.run("PRODUCTION_SAVE", {
    production_date: "2026-10-15",
    products: [{ product_id: first.product_id, nuclei_count: 1 }],
    confirm: true,
  });
  const newest = h.state().productionProducts.at(-1);
  assert.equal(
    newest.formula_id,
    h.state().formulas.find((f) => f.is_active && f.product_id === first.product_id).id,
  );
  assert.deepEqual(
    structuredClone(h.state().productionProducts).filter((r) => r.formula_id === first.id),
    batches,
  );
});

test("A39: roles vigentes, historial solo lectura, vacío y vínculos legados", () => {
  const h = createUiHarness();
  for (const role of ["ADMIN", "OPERATOR", "VIEWER"]) {
    const before = structuredClone(h.state());
    const html = h.render("productions/formulas", role);
    assert.ok(html.includes('aria-label="Fórmulas macro activas"'));
    assert.equal(html.includes("Editar fórmula"), role !== "VIEWER");
    assert.deepEqual(structuredClone(h.state()), before);
  }
  const state = structuredClone(h.state());
  state.formulas.forEach((f) => {
    f.is_active = false;
  });
  state.products[0].name = "Producto renombrado";
  state.ingredients[0].name = "Ingrediente renombrado";
  let html = render(h, state);
  assert.ok(activePart(html).includes("No hay fórmulas macro activas."));
  assert.ok(historyPart(html).includes("Producto renombrado"));
  assert.ok(historyPart(html).includes("Ingrediente renombrado"));
  assert.ok(!html.includes("Editar fórmula"));
  state.products = [];
  state.ingredients = [];
  html = render(h, state);
  assert.ok(html.includes("Producto no disponible"));
  assert.ok(html.includes("Insumo no disponible"));
  state.formulaIngredients = [];
  assert.ok(render(h, state).includes("Sin ingredientes registrados."));
  state.formulas = [];
  assert.ok(render(h, state).includes("No hay versiones históricas."));
});
