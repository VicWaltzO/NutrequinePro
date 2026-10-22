import { test } from "node:test";
import assert from "node:assert/strict";
import { seedState, executeCommand, productionSummary } from "../lib/domain.mjs";
import { productionFormPreview } from "../features/produccion/hooks/production-form-preview.ts";
import {
  initialProductionIngredients,
  resolveProductionIngredient,
} from "../features/produccion/hooks/production-ingredient-input.ts";

const actor = {
  id: "ux-production-admin",
  name: "Administrador sintético UX",
  role: "ADMIN",
  is_active: true,
};
const payload = {
  production_date: "2026-10-22",
  products: [{ product_id: "prod-1", nuclei_count: 1 }],
  confirm: false,
};
const values = { nucleus_cost: 250, packaging_cost: 1.1 };
function session() {
  let state = seedState();
  state.users.push(actor);
  return {
    state: () => state,
    run(type, input) {
      const result = executeCommand(state, { type, payload: input }, actor);
      state = result.state;
      return result.result;
    },
  };
}

test("captura nueva: precio de lote y descuento recalculan en céntimos, sin mutar maestros", () => {
  const state = seedState();
  const before = structuredClone(state);
  const row = resolveProductionIngredient(state.ingredients[0], 122000, {
    ingredient_id: "ing-1",
    price_per_kg: "2.11",
    discount_enabled: true,
    discount_amount: "0.03",
  });
  assert.equal(row.gross, 25742);
  assert.equal(row.net, 25739);
  assert.equal(row.input.actual_charge, 257.39);
  assert.equal(row.input.is_paid, true);
  assert.equal(row.input.actual_charge_mode, "auto");
  assert.equal(row.manual, false);
  assert.deepEqual(state, before);
});

test("descuento oculto es cero; borrador puede restaurarse, exceso y entradas inválidas bloquean", () => {
  const ingredient = seedState().ingredients[0];
  const draft = { ingredient_id: ingredient.id, discount_amount: "10.01", discount_enabled: false };
  assert.equal(resolveProductionIngredient(ingredient, 122000, draft).input.discount_amount, 0);
  assert.equal(
    resolveProductionIngredient(ingredient, 122000, { ...draft, discount_enabled: true }).input
      .discount_amount,
    "10.01",
  );
  assert.match(
    resolveProductionIngredient(ingredient, 122000, {
      ...draft,
      discount_amount: 999,
      discount_enabled: true,
    }).error,
    /descuento/i,
  );
  for (const price of ["", "-1", "2.111", "NaN", "Infinity", "1e3", "1000000000000"])
    assert.ok(
      resolveProductionIngredient(ingredient, 122000, { ingredient_id: ingredient.id, price_per_kg: price })
        .error,
      price,
    );
});

test("cobro manual sobrevive a cambios; restablecer lo vincula otra vez al neto", () => {
  const ingredient = seedState().ingredients[0];
  const draft = {
    ingredient_id: ingredient.id,
    actual_mode: "manual",
    actual_charge: "7.03",
    price_per_kg: "2.11",
    discount_enabled: true,
    discount_amount: "0.03",
  };
  assert.equal(resolveProductionIngredient(ingredient, 244000, draft).input.actual_charge, "7.03");
  assert.equal(
    resolveProductionIngredient(ingredient, 244000, { ...draft, actual_mode: "auto" }).input.actual_charge,
    514.81,
  );
  assert.equal(
    resolveProductionIngredient(ingredient, 244000, { ...draft, actual_charge: null }).input.actual_charge,
    null,
  );
});

test("varios productos consolidan cantidades y admiten varios pendientes sin marcar otros costos", () => {
  const state = seedState();
  const result = productionFormPreview(
    state,
    { "prod-1": 2, "prod-2": 1 },
    {
      "ing-1": { ingredient_id: "ing-1", is_paid: false },
      "ing-2": { ingredient_id: "ing-2", is_paid: false },
    },
    [],
    values,
  );
  assert.equal(result.bags, 120);
  assert.equal(
    result.ingredients.reduce((sum, row) => sum + row.w, 0),
    2961000,
  );
  assert.equal(result.ingredientInputs.filter((row) => !row.is_paid).length, 2);
  assert.equal(
    result.ingredientInputs.length,
    new Set(result.ingredientInputs.map((row) => row.ingredient_id)).size,
  );
  assert.ok(result.ingredientInputs.every((row) => row.actual_charge !== null));
  assert.equal(values.nucleus_paid, undefined);
  assert.ok(result.ingredientInputs.every((row) => !("discount_enabled" in row) && !("actual_mode" in row)));
});

test("borrador histórico: abrir conserva precio, nulos, descuentos y pagos sin escrituras", () => {
  const s = session();
  const id = s.run("PRODUCTION_SAVE", {
    ...payload,
    ingredients: [{ ingredient_id: "ing-1", discount_amount: "1.01", actual_charge: null, is_paid: false }],
  });
  const state = s.state();
  state.ingredients[0].current_price_per_kg = 999;
  const before = structuredClone(state);
  const draft = initialProductionIngredients(
    state,
    state.productions.find((row) => row.id === id),
  );
  const result = productionFormPreview(state, { "prod-1": 1 }, draft, [], values);
  const row = result.ingredients.find((row) => row.ing.id === "ing-1");
  assert.equal(row.price, 210);
  assert.equal(row.a.actual_charge, null);
  assert.equal(row.a.discount_amount, 1.01);
  assert.equal(row.a.is_paid, false);
  assert.ok(result.ingredientInputs.every((row) => row.actual_charge === null && row.is_paid === false));
  assert.equal(result.real, result.estimated);
  assert.deepEqual(state, before);
});

test("precio de lote persiste al confirmar y conciliar; maestros y otras producciones quedan intactos", () => {
  const s = session();
  const first = s.run("PRODUCTION_SAVE", payload);
  const custom = s.run("PRODUCTION_SAVE", {
    ...payload,
    ingredients: [{ ingredient_id: "ing-1", price_per_kg: "2.15", actual_charge: "250.01", is_paid: true }],
  });
  assert.equal(s.state().ingredients[0].current_price_per_kg, 210);
  const original = structuredClone(productionSummary(s.state(), { id: first }).ingredients);
  s.state().ingredients[0].current_price_per_kg = 999;
  s.run("PRODUCTION_CONFIRM", { id: custom });
  const summary = productionSummary(s.state(), { id: custom });
  const row = summary.ingredients.find((row) => row.ingredient_id === "ing-1");
  assert.equal(row.historical_price_per_kg, 215);
  assert.equal(row.theoretical_gross_cost, 26230);
  assert.equal(row.actual_charge, 25001);
  assert.equal(row.difference, -1229);
  s.run("PRODUCTION_RECONCILE", {
    id: custom,
    reason: "Conciliación sintética UX",
    ingredients: [{ id: row.id, discount_amount: "0.01", actual_charge: "262.29", is_paid: true }],
  });
  const reconciled = productionSummary(s.state(), { id: custom }).ingredients.find(
    (row) => row.ingredient_id === "ing-1",
  );
  assert.equal(reconciled.historical_price_per_kg, 215);
  assert.equal(reconciled.difference, 0);
  assert.deepEqual(productionSummary(s.state(), { id: first }).ingredients, original);
  s.run("PRODUCTION_CONFIRM", { id: first });
  assert.equal(productionSummary(s.state(), { id: first }).ingredients[0].historical_price_per_kg, 210);
});

test("backend rechaza precios inválidos y descuentos excesivos sin mutación parcial", () => {
  const state = seedState();
  for (const price of ["", "-1", "2.111", "NaN", "Infinity", "1e3", "1000000000000"]) {
    const before = structuredClone(state);
    assert.throws(() =>
      executeCommand(
        state,
        {
          type: "PRODUCTION_SAVE",
          payload: { ...payload, ingredients: [{ ingredient_id: "ing-1", price_per_kg: price }] },
        },
        actor,
      ),
    );
    assert.deepEqual(state, before);
  }
  assert.throws(
    () =>
      executeCommand(
        state,
        {
          type: "PRODUCTION_SAVE",
          payload: {
            ...payload,
            ingredients: [{ ingredient_id: "ing-1", price_per_kg: "0.01", discount_amount: "2" }],
          },
        },
        actor,
      ),
    /Descuento/,
  );
});

test("Nutrelin nuevo incluye cantidades cero sin crear pendientes ocultos y permite el cierre normal", () => {
  const s = session();
  const preview = productionFormPreview(s.state(), { "prod-3": 1 }, {}, [], values);
  assert.ok(preview.ingredientInputs.length > preview.ingredients.length);
  const id = s.run("PRODUCTION_SAVE", {
    ...payload,
    products: [{ product_id: "prod-3", nuclei_count: 1 }],
    ingredients: preview.ingredientInputs,
    confirm: true,
  });
  assert.ok(productionSummary(s.state(), { id }).reconciled);
  s.run("PRODUCTION_CLOSE", { id });
  assert.equal(s.state().productions.find((row) => row.id === id).status, "CLOSED");
});

test("el modo automático sobrevive al borrador; el backend deriva su cobro y rechaza modos desconocidos", () => {
  const s = session();
  const preview = productionFormPreview(s.state(), { "prod-1": 1 }, {}, [], values);
  const id = s.run("PRODUCTION_SAVE", { ...payload, ingredients: preview.ingredientInputs });
  const restored = initialProductionIngredients(
    s.state(),
    s.state().productions.find((row) => row.id === id),
  );
  assert.equal(restored["ing-1"].actual_mode, "auto");
  const doubled = productionFormPreview(s.state(), { "prod-1": 2 }, restored, [], values);
  assert.equal(doubled.ingredients.find((row) => row.ing.id === "ing-1").a.actual_charge, 512.4);
  const authoritative = s.run("PRODUCTION_SAVE", {
    ...payload,
    ingredients: [{ ingredient_id: "ing-1", actual_charge_mode: "auto", actual_charge: "0.01" }],
  });
  assert.equal(productionSummary(s.state(), { id: authoritative }).ingredients[0].actual_charge, 25620);
  assert.throws(
    () =>
      s.run("PRODUCTION_SAVE", {
        ...payload,
        ingredients: [{ ingredient_id: "ing-1", actual_charge_mode: "unknown" }],
      }),
    /Modo/,
  );
});

test("entradas transitorias o fuera de rango muestran validación sin romper el recálculo", () => {
  const state = seedState();
  for (const count of ["0.0000001", "-1", "NaN", "10000001"]) {
    const result = productionFormPreview(state, { "prod-1": count }, {}, [], values);
    assert.ok(result.quantityError);
    assert.equal(result.ingredients.length, 0);
  }
  const overflow = resolveProductionIngredient(state.ingredients[0], 122000, {
    ingredient_id: "ing-1",
    price_per_kg: "10000000000",
  });
  assert.match(overflow.priceError, /rango/);
});
