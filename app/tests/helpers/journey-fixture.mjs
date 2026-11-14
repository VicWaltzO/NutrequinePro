import { substitutionFixture, apply25, command, plan, substitute, actor } from "./substitution-fixture.mjs";
export { actor, command, substitute, apply25 };
export function journeyFixture() {
  const f = substitutionFixture();
  // Explicitly synthetic macro recipes and prices; no commercial dose fixtures.
  f.s.formulaIngredients.forEach((l, i) => (l.kg_per_nucleus = (i + 1) * 100));
  f.s.ingredients.forEach((l, i) => {
    l.name = `Macro sintético ${i}`;
    l.current_price_per_kg = i + 10;
  });
  return f;
}
export function create(s, quantities = ["20", "4", "6"]) {
  return command("JOURNEY_CREATE", {
    date: "2026-11-13",
    notes: "Ensayo sintético",
    expected_revision: s.revision,
    lines: quantities.map((n, i) => ({
      product_id: `prod-${i + 1}`,
      nuclei: n,
      formula_id: s.formulas.find((f) => f.product_id === `prod-${i + 1}` && f.is_active).id,
      micro_formula_id: s.microFormulaHeads.find((h) => h.family === (i ? "VERDE_AMARILLO" : "ROSADO"))
        .active_formula_id,
    })),
  });
}
export function link(s, line, prep, nuclei) {
  return command("JOURNEY_LINK", {
    line_id: line,
    preparation_id: prep,
    nuclei,
    expected_revision: s.revision,
  });
}
export function confirmed(s, options, family = "ROSADO", nuclei = "10") {
  const formula = s.microFormulaHeads.find((h) => h.family === family).active_formula_id;
  const prepared = apply25(s, plan(s, { family, formula_id: formula, nuclei }), options);
  const id = prepared.result;
  s = apply25(
    prepared.state,
    command("MICRO_ASSIGN", {
      preparation_id: id,
      reason: "Ensayo",
      expected_revision: prepared.state.revision,
    }),
    options,
  ).state;
  s = apply25(
    s,
    command("MICRO_PREPARATION_CONFIRM", {
      preparation_id: id,
      nuclei,
      date: "2026-11-12",
      expected_revision: s.revision,
    }),
    options,
  ).state;
  return { s, id };
}
