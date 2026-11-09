import { randomUUID } from "node:crypto";
import { executeCommand } from "../../lib/domain.mjs";
import { fixture, actor } from "./receipt-fixture.mjs";
export const command = (type, payload) => ({ type, payload, request_id: randomUUID() });
export function preparationFixture() {
  let s = fixture();
  const policies = [];
  for (const family of ["ROSADO", "VERDE_AMARILLO"]) {
    const dose = family === "ROSADO" ? "0.300" : "0.100";
    const draft = executeCommand(
      s,
      command("MICRO_FORMULA_SAVE", {
        family,
        expected_version: 0,
        lines: [
          { micro_ingredient_id: "m1", dose_kg: dose },
          { micro_ingredient_id: "m2", dose_kg: "0.001" },
        ],
      }),
      actor,
    );
    s = executeCommand(
      draft.state,
      command("MICRO_FORMULA_ACTIVATE", { family, formula_id: draft.result, expected_version: 1 }),
      actor,
    ).state;
    policies.push({
      family,
      formula_id: draft.result,
      reference: "Aprobación exclusivamente sintética",
      lines: s.microFormulaLines
        .filter((l) => l.formula_id === draft.result)
        .map((l) => ({ micro_ingredient_id: l.micro_ingredient_id, dose_grams: l.dose_grams })),
    });
  }
  return { s, policies, options: { microPreparationPolicies: policies } };
}
export function plan(s, extra = {}) {
  return command("MICRO_PREPARATION_CREATE", {
    family: "ROSADO",
    formula_id: s.microFormulaHeads.find((h) => h.family === "ROSADO").active_formula_id,
    nuclei: "20",
    date: "2026-11-09",
    expected_revision: s.revision,
    ...extra,
  });
}
