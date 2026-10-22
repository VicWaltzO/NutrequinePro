import { seedState } from "./seed-state.mjs";

export const catalogTables = ["products", "ingredients", "sites", "formulas", "formulaIngredients"];

/** Official company masters retained in the original implementation, without operational records. */
export function originalCompanyCatalog() {
  const original = seedState();
  return Object.fromEntries(catalogTables.map((table) => [table, original[table]]));
}

const normalizedName = (name) => String(name).normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase();

function differences(original, current) {
  return [...new Set([...Object.keys(original), ...Object.keys(current)])].filter(
    (key) => JSON.stringify(original[key]) !== JSON.stringify(current[key]),
  );
}

/** Add missing masters conservatively; an existing formula is an indivisible, administrator-owned version. */
export function planCompanyCatalog(current) {
  const original = originalCompanyCatalog();
  const inserts = Object.fromEntries(catalogTables.map((table) => [table, []]));
  const entries = [];
  const available = {};
  const record = (table, row, status, reason, changedFields = []) =>
    entries.push({
      table,
      id: row.id,
      name: row.name ?? row.product_id ?? row.formula_id,
      status,
      reason,
      changedFields,
    });

  for (const table of ["products", "ingredients", "sites"]) {
    available[table] = new Set();
    for (const row of original[table]) {
      const existing = current[table].find((item) => item.id === row.id);
      const aliases = current[table].filter(
        (item) => normalizedName(item.name) === normalizedName(row.name) && item.id !== row.id,
      );
      if (aliases.length || (existing && normalizedName(existing.name) !== normalizedName(row.name))) {
        record(table, row, "conflict", "Identificador o nombre ya utilizado; requiere conciliación manual.");
      } else if (existing) {
        available[table].add(row.id);
        const changedFields = differences(row, existing);
        record(
          table,
          row,
          changedFields.length ? "preserved" : "present",
          "Se conserva íntegramente el registro existente.",
          changedFields,
        );
      } else {
        available[table].add(row.id);
        inserts[table].push(row);
        record(table, row, "insert", "Registro original ausente.");
      }
    }
  }

  for (const formula of original.formulas) {
    const lines = original.formulaIngredients.filter((line) => line.formula_id === formula.id);
    const versions = current.formulas.filter((item) => item.product_id === formula.product_id);
    const existing = current.formulas.find((item) => item.id === formula.id);
    const existingLines = current.formulaIngredients.filter((item) => item.formula_id === formula.id);
    if (versions.length || existing) {
      const complete =
        existing &&
        !differences(formula, existing).length &&
        existingLines.length === lines.length &&
        lines.every((line) =>
          existingLines.some((item) => item.id === line.id && !differences(line, item).length),
        );
      record(
        "formulas",
        formula,
        complete ? "present" : "preserved",
        "Existen versiones o cantidades; no se sustituyen ni completan automáticamente.",
      );
      for (const line of lines)
        record(
          "formulaIngredients",
          line,
          complete ? "present" : "preserved",
          "Se conserva la fórmula existente como unidad.",
        );
      continue;
    }
    const product = current.products.find((item) => item.id === formula.product_id);
    const originalProduct = original.products.find((item) => item.id === formula.product_id);
    const blocked =
      !available.products.has(formula.product_id) ||
      (product && differences(originalProduct, product).length > 0) ||
      lines.some(
        (line) =>
          !available.ingredients.has(line.ingredient_id) ||
          current.formulaIngredients.some((item) => item.id === line.id),
      );
    if (blocked) {
      record(
        "formulas",
        formula,
        "conflict",
        "Producto modificado o referencias ambiguas; no se incorpora una fórmula potencialmente incompatible.",
      );
      for (const line of lines)
        record("formulaIngredients", line, "conflict", "Fórmula pendiente de conciliación.");
      continue;
    }
    inserts.formulas.push(formula);
    inserts.formulaIngredients.push(...lines);
    record("formulas", formula, "insert", "Versión original ausente y referencias comprobadas.");
    for (const line of lines)
      record("formulaIngredients", line, "insert", "Cantidad original exacta en gramos.");
  }
  return {
    inserts,
    entries,
    summary: Object.fromEntries(catalogTables.map((table) => [table, inserts[table].length])),
  };
}
