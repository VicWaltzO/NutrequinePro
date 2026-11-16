import { MICRO_FAMILIES, microFormulaRequirement } from "./formulas.mjs";
import { microPhysicalStock } from "./stock-balances.mjs";

// Read-only projection. No reservations, purchases, valuation events or cached state.
export function microAlerts(s, authorized, orders) {
  const maxima = new Map();
  const unavailable_families = [];
  for (const family of Object.keys(MICRO_FAMILIES)) {
    const heads = s.microFormulaHeads.filter((h) => h.family === family);
    const formula =
      heads.length === 1 &&
      authorized.find((f) => f.id === heads[0].active_formula_id && f.family === family && f.published_at);
    const lines = formula ? s.microFormulaLines.filter((l) => l.formula_id === formula.id) : [];
    const ids = new Set(lines.map((l) => l.micro_ingredient_id));
    if (
      !lines.length ||
      ids.size !== lines.length ||
      lines.some(
        (l) =>
          !Number.isSafeInteger(l.dose_grams) ||
          l.dose_grams <= 0 ||
          !s.microIngredients.some(
            (m) => m.id === l.micro_ingredient_id && m.is_active && m.operational_id !== 14,
          ),
      )
    ) {
      unavailable_families.push(family);
      continue;
    }
    for (const requirement of microFormulaRequirement(lines, "20")) {
      const id = requirement.micro_ingredient_id;
      maxima.set(id, Math.max(maxima.get(id) ?? 0, requirement.grams_hundredths));
    }
  }
  const items = [...maxima]
    .map(([id, minimum_hundredths]) => {
      const ingredient = s.microIngredients.find((m) => m.id === id);
      const stock = microPhysicalStock(s, id);
      let status = "COVERED";
      if (stock.physical_hundredths < minimum_hundredths) status = "LOW";
      if (stock.stock_source === "UNRECORDED") status = "UNAVAILABLE";
      return {
        micro_ingredient_id: id,
        operational_id: ingredient.operational_id,
        name: ingredient.name,
        minimum_hundredths,
        ...stock,
        missing_hundredths: Math.max(0, minimum_hundredths - stock.physical_hundredths),
        status,
      };
    })
    .sort((a, b) => a.operational_id - b.operational_id);
  return {
    preventive: { unavailable_families, items },
    by_order: orders
      .filter((order) => order.status === "PENDING")
      .flatMap((order) => {
        const items = order.items.filter(
          (item) => item.missing_hundredths > 0 || item.stock_source === "UNRECORDED",
        );
        return items.length ? [{ preparation_id: order.id, items }] : [];
      }),
  };
}
