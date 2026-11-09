import { requireValue, pick, scaled, safe, text } from "../../../shared/domain/core.mjs";
import { nucleusHundredths } from "../../../shared/domain/production-quantities.mjs";

export const MICRO_FAMILIES = Object.freeze({
  ROSADO: Object.freeze(["Potripregnant"]),
  VERDE_AMARILLO: Object.freeze(["Hi-Performance", "Nutrelin Adulto"]),
});
function fields(p, allowed) {
  requireValue(
    Object.keys(p).every((key) => allowed.includes(key)),
    "Campo de microfórmula no permitido.",
  );
}
function familyHead(s, p) {
  requireValue(Object.hasOwn(MICRO_FAMILIES, p.family), "Familia de núcleo inválida.");
  const head = s.microFormulaHeads.find((row) => row.family === p.family);
  requireValue(
    Number.isSafeInteger(p.expected_version) && p.expected_version === (head?.version ?? 0),
    "La familia cambió. Recargue antes de continuar.",
  );
  return head;
}
function validatedLines(s, lines) {
  requireValue(Array.isArray(lines) && lines.length <= 1000, "Renglones inválidos (máximo 1000).");
  const seen = new Set();
  return lines.map((line) => {
    requireValue(line && typeof line === "object" && !Array.isArray(line), "Renglón inválido.");
    fields(line, ["micro_ingredient_id", "dose_kg"]);
    const micro = pick(s, "microIngredients", line.micro_ingredient_id);
    requireValue(micro.is_active && micro.operational_id !== 14, "Microinsumo inactivo o reservado.");
    requireValue(!seen.has(micro.id), "Microinsumo duplicado.");
    seen.add(micro.id);
    requireValue(typeof line.dose_kg === "string", "La dosis debe ser un decimal explícito en kg.");
    const grams = scaled(line.dose_kg, 3);
    requireValue(grams > 0, "La dosis debe ser mayor que cero.");
    return {
      micro_ingredient_id: micro.id,
      operational_id_snapshot: micro.operational_id,
      name_snapshot: micro.name,
      dose_grams: grams,
    };
  });
}
// Draft snapshots are append-only too. Saving changes always creates another identity/version.
export function microFormulaSave({ s, p, add, clock }) {
  fields(p, ["family", "expected_version", "lines", "notes"]);
  const head = familyHead(s, p);
  const lines = validatedLines(s, p.lines);
  const notes = p.notes === undefined || p.notes === "" ? "" : text(p.notes, "Observación");
  const version = safe(
    Math.max(0, ...s.microFormulas.filter((f) => f.family === p.family).map((f) => f.version)) + 1,
  );
  const formula = add("microFormulas", {
    family: p.family,
    version,
    notes,
    published_at: null,
    published_by: null,
    total_grams: lines.reduce((total, line) => safe(total + line.dose_grams), 0),
  });
  for (const line of lines) add("microFormulaLines", { formula_id: formula.id, ...line });
  if (head) Object.assign(head, { version: safe(head.version + 1), updated_at: clock });
  else add("microFormulaHeads", { family: p.family, active_formula_id: null, version: 1 });
  return formula.id;
}
export function microFormulaActivate({ s, p, actor, clock }) {
  fields(p, ["family", "expected_version", "formula_id"]);
  const head = familyHead(s, p);
  const formula = pick(s, "microFormulas", p.formula_id);
  requireValue(
    head && formula.family === p.family && !formula.published_at,
    "Solo puede activar un borrador de esta familia; el historial es inmutable.",
  );
  const active = s.microFormulas.find((row) => row.id === head.active_formula_id);
  requireValue(
    !active || formula.version > active.version,
    "El borrador es anterior a la versión activa. Cree una versión nueva.",
  );
  const lines = s.microFormulaLines.filter((line) => line.formula_id === formula.id);
  requireValue(lines.length > 0, "No se puede activar una fórmula vacía.");
  for (const line of lines)
    requireValue(
      pick(s, "microIngredients", line.micro_ingredient_id).is_active,
      "Hay microinsumos inactivos. Cree una nueva versión.",
    );
  Object.assign(formula, { published_at: clock, published_by: actor.id });
  Object.assign(head, { active_formula_id: formula.id, version: safe(head.version + 1), updated_at: clock });
  return formula.id;
}
// Pure future contract: integer hundredths of grams, exact even for fractional nuclei. No stock effects.
export function microFormulaRequirement(lines, nuclei) {
  const count = nucleusHundredths(nuclei);
  return lines.map((line) => ({
    micro_ingredient_id: line.micro_ingredient_id,
    grams_hundredths: safe(line.dose_grams * count),
  }));
}
