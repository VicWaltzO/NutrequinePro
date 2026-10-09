import {
  requireValue,
  scaled,
  date,
  text,
  pick,
  sum,
  multiply,
  roundedProduct,
  today,
} from "../../../shared/domain/core.mjs";
import { stock } from "../../inventario/domain/stock.mjs";
import { productionSummary } from "./summary.mjs";
export function formulaSave(context) {
  const { s, p, add } = context;
  let result = null;
  const prod = pick(s, "products", p.product_id);
  requireValue(p.ingredients?.length > 0, "Agregue insumos.");
  requireValue(
    new Set(p.ingredients.map((x) => x.ingredient_id)).size === p.ingredients.length,
    "Insumo repetido.",
  );
  const d = date(p.valid_from ?? today());
  const old = s.formulas.filter((x) => x.product_id === prod.id);
  old
    .filter((x) => x.is_active)
    .forEach((x) => {
      x.is_active = false;
      x.valid_to = d;
    });
  const f = add("formulas", {
    product_id: prod.id,
    version: Math.max(0, ...old.map((x) => x.version)) + 1,
    valid_from: d,
    valid_to: null,
    is_active: true,
  });
  p.ingredients.forEach((x) => {
    pick(s, "ingredients", x.ingredient_id);
    add("formulaIngredients", {
      formula_id: f.id,
      ingredient_id: x.ingredient_id,
      kg_per_nucleus: scaled(x.kg_per_nucleus, 3),
    });
  });
  result = f.id;
  return result;
}
export function productionSave(context) {
  const { s, p, actor, clock, add, code, productionRows, confirmProduction } = context;
  let result = null;
  let pr = p.id
    ? pick(s, "productions", p.id)
    : add("productions", { code: code("productions", "PR"), status: "DRAFT" });
  requireValue(pr.status === "DRAFT", "Use rectificación para una producción confirmada.");
  Object.assign(pr, {
    production_date: date(p.production_date),
    responsible_user_id: actor.id,
    notes: p.notes ?? "",
    updated_at: clock,
  });
  for (const t of ["productionProducts", "productionIngredients", "productionCosts"])
    s[t]
      .filter(
        (x) =>
          x.production_id === pr.id &&
          !s.expenses.some((e) => e.production_cost_id === x.id && e.status !== "CANCELLED"),
      )
      .forEach((x) => (x.is_current = false));
  productionRows(pr, p);
  if (p.confirm) {
    requireValue(actor.role === "ADMIN", "Confirmación requiere administrador.");
    confirmProduction(pr);
  }
  result = pr.id;
  return result;
}
export function productionConfirm(context) {
  const { s, p, productionRows, confirmProduction } = context;
  let result = null;
  const pr = pick(s, "productions", p.id);
  for (const t of ["productionProducts", "productionIngredients", "productionCosts"])
    s[t]
      .filter(
        (x) =>
          x.production_id === pr.id &&
          x.is_current !== false &&
          !s.expenses.some((e) => e.production_cost_id === x.id && e.status !== "CANCELLED"),
      )
      .forEach((x) => (x.is_current = false));
  requireValue(pr.status === "DRAFT", "Producción ya confirmada.");
  productionRows(pr, pr.input_snapshot);
  confirmProduction(pr);
  result = pr.id;
  return result;
}
export function productionReconcile(context) {
  const { s, p, actor, add, reason, correction } = context;
  let result = null;
  requireValue(actor.role === "ADMIN", "Conciliación requiere administrador.");
  const pr = pick(s, "productions", p.id);
  requireValue(["CONFIRMED", "CLOSED"].includes(pr.status), "Confirme primero la producción.");
  const why = reason();
  const before = structuredClone(productionSummary(s, pr));
  for (const row of p.ingredients ?? []) {
    const x = pick(s, "productionIngredients", row.id);
    requireValue(x.production_id === pr.id && x.is_current !== false, "Insumo no pertenece a producción.");
    const discount = scaled(row.discount_amount ?? x.discount_amount / 100);
    requireValue(discount <= x.theoretical_gross_cost, "Descuento supera costo teórico.");
    Object.assign(x, {
      discount_amount: discount,
      theoretical_net_cost: x.theoretical_gross_cost - discount,
      actual_charge: row.actual_charge === "" || row.actual_charge == null ? null : scaled(row.actual_charge),
      is_paid: !!row.is_paid,
      notes: row.notes ?? x.notes,
    });
    x.difference = x.actual_charge === null ? null : x.actual_charge - x.theoretical_net_cost;
  }
  for (const row of p.costs ?? []) {
    const x = pick(s, "productionCosts", row.id);
    requireValue(x.production_id === pr.id, "Costo ajeno a producción.");
    x.amount = scaled(row.amount);
    x.is_paid = !!row.is_paid;
  }
  for (const row of p.new_costs ?? []) {
    requireValue(
      ["FREIGHT", "HANDLING", "PERSONNEL", "SERVICE", "INGREDIENT_EXTRA", "OTHER"].includes(row.category),
      "Categoría inválida.",
    );
    if (row.ingredient_id) pick(s, "ingredients", row.ingredient_id);
    requireValue(row.category !== "INGREDIENT_EXTRA" || row.ingredient_id, "Seleccione insumo.");
    add("productionCosts", {
      production_id: pr.id,
      category: row.category,
      description: text(row.description, "Descripción"),
      amount: scaled(row.amount),
      ingredient_id: row.ingredient_id || null,
      is_paid: !!row.is_paid,
      is_current: true,
    });
  }
  if (pr.status === "CLOSED")
    requireValue(
      productionSummary(s, pr).reconciled,
      "Una producción cerrada debe conservar conciliación completa.",
    );
  correction("PRODUCTION", pr.id, before, productionSummary(s, pr), why);
  result = pr.id;
  return result;
}
export function productionCorrectQuantities(context) {
  const { s, p, actor, clock, uid, add, reason, movement, correction } = context;
  let result = null;
  const pr = pick(s, "productions", p.id);
  requireValue(["CONFIRMED", "CLOSED"].includes(pr.status), "Solo se rectifican producciones confirmadas.");
  const why = reason(),
    before = structuredClone(productionSummary(s, pr));
  requireValue(p.products?.length === before.products.length, "Incluya todos los productos originales.");
  requireValue(new Set(p.products.map((x) => x.product_id)).size === p.products.length, "Producto repetido.");
  const amounts = {};
  let totalNuclei = 0,
    totalBags = 0;
  for (const old of before.products) {
    const input = p.products.find((x) => x.product_id === old.product_id);
    requireValue(input, "Producto original no incluido.");
    const n = Number(input.nuclei_count);
    requireValue(Number.isSafeInteger(n) && n >= 0 && n <= 1e7, "Núcleos debe ser un entero válido.");
    const bags = multiply(n, old.bags_per_nucleus_snapshot),
      weight = multiply(n, old.commercial_weight_per_nucleus_snapshot);
    const deltaBags = bags - old.bags_produced,
      deltaWeight = weight - old.commercial_weight_kg;
    const st = stock(s, old.product_id);
    requireValue(
      st.quantity + deltaBags >= 0 && st.weight_kg + deltaWeight >= 0,
      "La reducción supera el stock físico actual. Resuelva las salidas asociadas antes de rectificar.",
    );
    pick(s, "productionProducts", old.id).is_current = false;
    if (n > 0)
      add("productionProducts", {
        ...old,
        id: uid(),
        created_at: clock,
        created_by: actor.id,
        nuclei_count: n,
        bags_produced: bags,
        commercial_weight_kg: weight,
        formula_weight_kg: sum(old.formula_snapshot, (x) => x.kg_per_nucleus) * n,
        is_current: true,
      });
    totalNuclei += n;
    totalBags += bags;
    for (const fi of old.formula_snapshot)
      amounts[fi.ingredient_id] = (amounts[fi.ingredient_id] ?? 0) + fi.kg_per_nucleus * n;
    if (deltaBags || deltaWeight)
      movement({
        item_type: "PRODUCT",
        item_id: old.product_id,
        movement_type: deltaBags >= 0 ? "ADJUSTMENT_IN" : "ADJUSTMENT_OUT",
        quantity: deltaBags,
        weight_kg: deltaWeight,
        source_type: "PRODUCTION",
        source_id: pr.id,
        notes: why,
      });
  }
  requireValue(
    totalNuclei > 0,
    "Debe quedar al menos un núcleo. Para eliminar toda la producción use anulación.",
  );
  for (const old of before.ingredients) {
    const total_kg = amounts[old.ingredient_id] ?? 0,
      gross = roundedProduct(total_kg, old.historical_price_per_kg, 1000);
    requireValue(
      old.discount_amount <= gross,
      "El descuento histórico supera el nuevo costo. Rectifique el descuento primero.",
    );
    pick(s, "productionIngredients", old.id).is_current = false;
    add("productionIngredients", {
      ...old,
      id: uid(),
      created_at: clock,
      created_by: actor.id,
      total_kg,
      theoretical_gross_cost: gross,
      theoretical_net_cost: gross - old.discount_amount,
      difference: old.actual_charge === null ? null : old.actual_charge - (gross - old.discount_amount),
      is_current: true,
    });
    if (total_kg !== old.total_kg)
      movement({
        item_type: "INGREDIENT",
        item_id: old.ingredient_id,
        movement_type: "CANCELLATION_REVERSAL",
        quantity: 0,
        weight_kg: old.total_kg - total_kg,
        source_type: "PRODUCTION",
        source_id: pr.id,
        notes: why,
      });
  }
  for (const input of p.costs ?? []) {
    const c = pick(s, "productionCosts", input.id);
    requireValue(c.production_id === pr.id && c.is_current !== false, "Costo ajeno a producción.");
    c.amount = scaled(input.amount);
    if (c.category === "NUCLEUS") c.quantity = totalNuclei;
    if (c.category === "PACKAGING") c.quantity = totalBags;
  }
  correction("PRODUCTION", pr.id, before, productionSummary(s, pr), why);
  pr.updated_at = clock;
  result = pr.id;
  return result;
}
export function productionClose(context) {
  const { s, p, actor, clock } = context;
  let result = null;
  const pr = pick(s, "productions", p.id);
  requireValue(pr.status === "CONFIRMED", "Solo puede cerrar una producción confirmada.");
  requireValue(productionSummary(s, pr).reconciled, "Complete los cobros reales de todos los insumos.");
  pr.status = "CLOSED";
  pr.closed_at = clock;
  pr.closed_by = actor.id;
  result = pr.id;
  return result;
}
export function productionCancel(context) {
  const { s, p, actor, clock, uid, reason, movement } = context;
  let result = null;
  const pr = pick(s, "productions", p.id);
  requireValue(pr.status !== "CANCELLED", "Ya anulada.");
  const why = reason();
  const a = productionSummary(s, pr);
  if (pr.status !== "DRAFT") {
    for (const x of a.products) {
      const a = stock(s, x.product_id);
      requireValue(
        a.quantity >= x.bags_produced && a.weight_kg >= x.commercial_weight_kg,
        "No puede revertir producción cuyo stock ya se consumió.",
      );
    }
    for (const m of s.inventoryMovements.filter(
      (x) => x.source_type === "PRODUCTION" && x.source_id === pr.id,
    ))
      movement({
        ...m,
        id: uid(),
        created_at: clock,
        created_by: actor.id,
        date: date(p.date ?? today()),
        movement_type: "CANCELLATION_REVERSAL",
        quantity: -m.quantity,
        weight_kg: -m.weight_kg,
        notes: why,
      });
  }
  pr.status = "CANCELLED";
  pr.cancellation_reason = why;
  pr.cancelled_at = clock;
  pr.cancelled_by = actor.id;
  result = pr.id;
  return result;
}
