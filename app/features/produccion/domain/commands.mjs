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
  const { s: state, p: payload, add } = context;
  let result = null;
  const product = pick(state, "products", payload.product_id);
  requireValue(payload.ingredients?.length > 0, "Agregue insumos.");
  requireValue(
    new Set(payload.ingredients.map((x) => x.ingredient_id)).size === payload.ingredients.length,
    "Insumo repetido.",
  );
  const validFrom = date(payload.valid_from ?? today());
  const old = state.formulas.filter((x) => x.product_id === product.id);
  old
    .filter((x) => x.is_active)
    .forEach((x) => {
      x.is_active = false;
      x.valid_to = validFrom;
    });
  const formula = add("formulas", {
    product_id: product.id,
    version: Math.max(0, ...old.map((x) => x.version)) + 1,
    valid_from: validFrom,
    valid_to: null,
    is_active: true,
  });
  payload.ingredients.forEach((x) => {
    pick(state, "ingredients", x.ingredient_id);
    add("formulaIngredients", {
      formula_id: formula.id,
      ingredient_id: x.ingredient_id,
      kg_per_nucleus: scaled(x.kg_per_nucleus, 3),
    });
  });
  result = formula.id;
  return result;
}
export function productionSave(context) {
  const { s: state, p: payload, actor, clock, add, code, productionRows, confirmProduction } = context;
  let result = null;
  let production = payload.id
    ? pick(state, "productions", payload.id)
    : add("productions", { code: code("productions", "PR"), status: "DRAFT" });
  requireValue(production.status === "DRAFT", "Use rectificación para una producción confirmada.");
  Object.assign(production, {
    production_date: date(payload.production_date),
    responsible_user_id: actor.id,
    notes: payload.notes ?? "",
    updated_at: clock,
  });
  for (const t of ["productionProducts", "productionIngredients", "productionCosts"])
    state[t]
      .filter(
        (x) =>
          x.production_id === production.id &&
          !state.expenses.some((e) => e.production_cost_id === x.id && e.status !== "CANCELLED"),
      )
      .forEach((x) => (x.is_current = false));
  productionRows(production, payload);
  if (payload.confirm) {
    requireValue(actor.role === "ADMIN", "Confirmación requiere administrador.");
    confirmProduction(production);
  }
  result = production.id;
  return result;
}
export function productionConfirm(context) {
  const { s: state, p: payload, productionRows, confirmProduction } = context;
  let result = null;
  const production = pick(state, "productions", payload.id);
  for (const t of ["productionProducts", "productionIngredients", "productionCosts"])
    state[t]
      .filter(
        (x) =>
          x.production_id === production.id &&
          x.is_current !== false &&
          !state.expenses.some((e) => e.production_cost_id === x.id && e.status !== "CANCELLED"),
      )
      .forEach((x) => (x.is_current = false));
  requireValue(production.status === "DRAFT", "Producción ya confirmada.");
  productionRows(production, production.input_snapshot);
  confirmProduction(production);
  result = production.id;
  return result;
}
export function productionReconcile(context) {
  const { s: state, p: payload, actor, add, reason, correction } = context;
  let result = null;
  requireValue(actor.role === "ADMIN", "Conciliación requiere administrador.");
  const production = pick(state, "productions", payload.id);
  requireValue(["CONFIRMED", "CLOSED"].includes(production.status), "Confirme primero la producción.");
  const why = reason();
  const before = structuredClone(productionSummary(state, production));
  for (const row of payload.ingredients ?? []) {
    const x = pick(state, "productionIngredients", row.id);
    requireValue(
      x.production_id === production.id && x.is_current !== false,
      "Insumo no pertenece a producción.",
    );
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
  for (const row of payload.costs ?? []) {
    const x = pick(state, "productionCosts", row.id);
    requireValue(x.production_id === production.id, "Costo ajeno a producción.");
    x.amount = scaled(row.amount);
    x.is_paid = !!row.is_paid;
  }
  for (const row of payload.new_costs ?? []) {
    requireValue(
      ["FREIGHT", "HANDLING", "PERSONNEL", "SERVICE", "INGREDIENT_EXTRA", "OTHER"].includes(row.category),
      "Categoría inválida.",
    );
    if (row.ingredient_id) pick(state, "ingredients", row.ingredient_id);
    requireValue(row.category !== "INGREDIENT_EXTRA" || row.ingredient_id, "Seleccione insumo.");
    add("productionCosts", {
      production_id: production.id,
      category: row.category,
      description: text(row.description, "Descripción"),
      amount: scaled(row.amount),
      ingredient_id: row.ingredient_id || null,
      is_paid: !!row.is_paid,
      is_current: true,
    });
  }
  if (production.status === "CLOSED")
    requireValue(
      productionSummary(state, production).reconciled,
      "Una producción cerrada debe conservar conciliación completa.",
    );
  correction("PRODUCTION", production.id, before, productionSummary(state, production), why);
  result = production.id;
  return result;
}
export function productionCorrectQuantities(context) {
  const { s: state, p: payload, actor, clock, uid, add, reason, movement, correction } = context;
  let result = null;
  const production = pick(state, "productions", payload.id);
  requireValue(
    ["CONFIRMED", "CLOSED"].includes(production.status),
    "Solo se rectifican producciones confirmadas.",
  );
  const why = reason();
  const before = structuredClone(productionSummary(state, production));
  requireValue(
    payload.products?.length === before.products.length,
    "Incluya todos los productos originales.",
  );
  requireValue(
    new Set(payload.products.map((x) => x.product_id)).size === payload.products.length,
    "Producto repetido.",
  );
  const amounts = {};
  let totalNuclei = 0;
  let totalBags = 0;
  for (const old of before.products) {
    const input = payload.products.find((x) => x.product_id === old.product_id);
    requireValue(input, "Producto original no incluido.");
    const nucleiCount = Number(input.nuclei_count);
    requireValue(
      Number.isSafeInteger(nucleiCount) && nucleiCount >= 0 && nucleiCount <= 1e7,
      "Núcleos debe ser un entero válido.",
    );
    const bags = multiply(nucleiCount, old.bags_per_nucleus_snapshot);
    const weight = multiply(nucleiCount, old.commercial_weight_per_nucleus_snapshot);
    const deltaBags = bags - old.bags_produced;
    const deltaWeight = weight - old.commercial_weight_kg;
    const st = stock(state, old.product_id);
    requireValue(
      st.quantity + deltaBags >= 0 && st.weight_kg + deltaWeight >= 0,
      "La reducción supera el stock físico actual. Resuelva las salidas asociadas antes de rectificar.",
    );
    pick(state, "productionProducts", old.id).is_current = false;
    if (nucleiCount > 0)
      add("productionProducts", {
        ...old,
        id: uid(),
        created_at: clock,
        created_by: actor.id,
        nuclei_count: nucleiCount,
        bags_produced: bags,
        commercial_weight_kg: weight,
        formula_weight_kg: sum(old.formula_snapshot, (x) => x.kg_per_nucleus) * nucleiCount,
        is_current: true,
      });
    totalNuclei += nucleiCount;
    totalBags += bags;
    for (const fi of old.formula_snapshot)
      amounts[fi.ingredient_id] = (amounts[fi.ingredient_id] ?? 0) + fi.kg_per_nucleus * nucleiCount;
    if (deltaBags || deltaWeight)
      movement({
        item_type: "PRODUCT",
        item_id: old.product_id,
        movement_type: deltaBags >= 0 ? "ADJUSTMENT_IN" : "ADJUSTMENT_OUT",
        quantity: deltaBags,
        weight_kg: deltaWeight,
        source_type: "PRODUCTION",
        source_id: production.id,
        notes: why,
      });
  }
  requireValue(
    totalNuclei > 0,
    "Debe quedar al menos un núcleo. Para eliminar toda la producción use anulación.",
  );
  for (const old of before.ingredients) {
    const total_kg = amounts[old.ingredient_id] ?? 0;
    const gross = roundedProduct(total_kg, old.historical_price_per_kg, 1000);
    requireValue(
      old.discount_amount <= gross,
      "El descuento histórico supera el nuevo costo. Rectifique el descuento primero.",
    );
    pick(state, "productionIngredients", old.id).is_current = false;
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
        source_id: production.id,
        notes: why,
      });
  }
  for (const input of payload.costs ?? []) {
    const c = pick(state, "productionCosts", input.id);
    requireValue(c.production_id === production.id && c.is_current !== false, "Costo ajeno a producción.");
    c.amount = scaled(input.amount);
    if (c.category === "NUCLEUS") c.quantity = totalNuclei;
    if (c.category === "PACKAGING") c.quantity = totalBags;
  }
  correction("PRODUCTION", production.id, before, productionSummary(state, production), why);
  production.updated_at = clock;
  result = production.id;
  return result;
}
export function productionClose(context) {
  const { s: state, p: payload, actor, clock } = context;
  let result = null;
  const production = pick(state, "productions", payload.id);
  requireValue(production.status === "CONFIRMED", "Solo puede cerrar una producción confirmada.");
  requireValue(
    productionSummary(state, production).reconciled,
    "Complete los cobros reales de todos los insumos.",
  );
  production.status = "CLOSED";
  production.closed_at = clock;
  production.closed_by = actor.id;
  result = production.id;
  return result;
}
export function productionCancel(context) {
  const { s: state, p: payload, actor, clock, uid, reason, movement } = context;
  let result = null;
  const production = pick(state, "productions", payload.id);
  requireValue(production.status !== "CANCELLED", "Ya anulada.");
  const why = reason();
  const summary = productionSummary(state, production);
  if (production.status !== "DRAFT") {
    for (const x of summary.products) {
      const physicalStock = stock(state, x.product_id);
      requireValue(
        physicalStock.quantity >= x.bags_produced && physicalStock.weight_kg >= x.commercial_weight_kg,
        "No puede revertir producción cuyo stock ya se consumió.",
      );
    }
    for (const m of state.inventoryMovements.filter(
      (x) => x.source_type === "PRODUCTION" && x.source_id === production.id,
    ))
      movement({
        ...m,
        id: uid(),
        created_at: clock,
        created_by: actor.id,
        date: date(payload.date ?? today()),
        movement_type: "CANCELLATION_REVERSAL",
        quantity: -m.quantity,
        weight_kg: -m.weight_kg,
        notes: why,
      });
  }
  production.status = "CANCELLED";
  production.cancellation_reason = why;
  production.cancelled_at = clock;
  production.cancelled_by = actor.id;
  result = production.id;
  return result;
}
