import { preparationFixture, command, plan } from "./preparation-fixture.mjs";
import { actor } from "./receipt-fixture.mjs";
import { executeCommand } from "../../lib/domain.mjs";
export { actor, command, plan };
export const apply25 = (s, c, options, user = actor) =>
  executeCommand(s, c, user, "2026-11-12T14:00:00.000Z", options);
export function substitutionFixture() {
  const f = preparationFixture();
  f.s.microIngredients.push({
    ...f.s.microIngredients[0],
    id: "m3",
    operational_id: 3,
    name: "Sustituto ficticio",
  });
  f.s.microOpenings.forEach((o) => {
    o.quantity_grams = 10000;
    o.valuation_cents = 2000;
  });
  f.s.microOpenings.push({
    ...f.s.microOpenings[0],
    id: "o3",
    micro_ingredient_id: "m3",
    unit_cost_cents: 500,
    valuation_cents: 5000,
  });
  const policy = {
    id: "synthetic-25",
    reference: "Aprobación sintética25",
    from_ingredient_id: "m1",
    to_ingredient_id: "m3",
    families: Object.fromEntries(
      f.policies.map((p) => [
        p.family,
        {
          source_formula_id: p.formula_id,
          lines: [
            { micro_ingredient_id: "m3", dose_grams: p.family === "ROSADO" ? 137 : 71 },
            { micro_ingredient_id: "m2", dose_grams: 1 },
          ],
        },
      ]),
    ),
  };
  f.options.microSubstitutionPolicies = [policy];
  return { ...f, policy };
}
export const substitute = (s) =>
  command("MICRO_SUBSTITUTE", {
    policy_id: "synthetic-25",
    reason: "Ensayo aprobado",
    expected_revision: s.revision,
  });
export const adopt = (s, source_id, extra = {}) =>
  command("MICRO_ADOPT", {
    preparation_id: source_id,
    substitution_id: s.microSubstitutions[0].id,
    consent: true,
    reason: "Consentimiento sintético",
    expected_revision: s.revision,
    ...extra,
  });
