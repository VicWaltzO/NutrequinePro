import { requireValue, scaled, positiveInt, date, pick, sum } from "../../../shared/domain/core.mjs";
import { saleSummary } from "./summary.mjs";
import { stock } from "../../inventario/domain/stock.mjs";
import { isNucleusProduct, presentationSnapshot } from "../../../shared/domain/presentation.mjs";
import { coverSale } from "./coverage.mjs";
export function saleSave(context) {
  const {
    s: state,
    p: payload,
    actor,
    clock,
    add,
    code,
    payment,
    saleItems,
    assertStock,
    outputSale,
    productionRows,
  } = context;
  let result = null;
  const customer = pick(state, "customers", payload.customer_id);
  const site = pick(state, "sites", payload.site_id);
  requireValue(customer.is_active && site.is_active, "Cliente y sede deben estar activos.");
  requireValue(["CASH", "CREDIT"].includes(payload.payment_condition), "Condición inválida.");
  requireValue(
    !context.partialReservations || !payload.create_production,
    "La planificación automática de producción desde reservas requiere integración de abastecimiento. Registre el pedido sin crear producción.",
  );
  const sale = payload.id
    ? pick(state, "sales", payload.id)
    : add("sales", { code: code("sales", "V"), commercial_status: "DRAFT" });
  requireValue(sale.commercial_status === "DRAFT", "Use rectificación para ventas confirmadas.");
  const rows = saleItems(sale.id, payload.items);
  state.saleItems.filter((x) => x.sale_id === sale.id).forEach((x) => (x.is_current = false));
  const savedRows = rows.map((x) => add("saleItems", x));
  Object.assign(sale, {
    customer_id: customer.id,
    site_id: site.id,
    sale_date: date(payload.sale_date),
    payment_condition: payload.payment_condition,
    notes: payload.notes ?? "",
    fulfillment_status: "PENDING",
    updated_at: clock,
  });
  if (payload.confirm !== false) {
    sale.commercial_status = "CONFIRMED";
    sale.confirmed_at = clock;
    sale.confirmed_by = actor.id;
    if (context.partialReservations) {
      coverSale(context, sale, savedRows);
    } else if (payload.deliver) {
      assertStock(rows);
      outputSale(sale, rows);
      sale.fulfillment_status = "DELIVERED";
      sale.delivered_at = clock;
      sale.delivered_by = actor.id;
    }
    if (sale.payment_condition === "CASH") {
      const total = sum(rows, (x) => x.subtotal);
      const paid = scaled(payload.paid_amount ?? total / 100);
      if (paid > 0)
        payment(
          customer.id,
          paid,
          total > 0 ? [{ sale_id: sale.id, amount: Math.min(total, paid) }] : [],
          payload,
        );
    }
  }
  if (!state.customerSites.some((x) => x.customer_id === customer.id && x.site_id === site.id))
    add("customerSites", {
      customer_id: customer.id,
      site_id: site.id,
      is_default: false,
      is_active: true,
    });
  if (payload.create_production) {
    const grouped = {};
    rows
      .filter((x) => isNucleusProduct(pick(state, "products", x.product_id)))
      .forEach((x) => (grouped[x.product_id] = (grouped[x.product_id] ?? 0) + x.quantity));
    if (Object.keys(grouped).length) {
      const production = add("productions", {
        code: code("productions", "PR"),
        status: "DRAFT",
        production_date: sale.sale_date,
        responsible_user_id: actor.id,
        notes: `Planificado para ${sale.code}`,
      });
      const input = {
        products: Object.entries(grouped).map(([id, quantity]) => ({
          product_id: id,
          nuclei_count: Math.max(
            1,
            Math.ceil(
              Math.max(0, quantity - stock(state, id).quantity) /
                pick(state, "products", id).bags_per_nucleus,
            ),
          ),
        })),
      };
      productionRows(production, input);
      add("saleProductionLinks", {
        sale_id: sale.id,
        production_id: production.id,
        notes: "Creado desde venta futura",
      });
    }
  }
  if (payload.production_id) {
    pick(state, "productions", payload.production_id);
    add("saleProductionLinks", { sale_id: sale.id, production_id: payload.production_id, notes: "" });
  }
  result = sale.id;
  return result;
}
export function saleDeliver(context) {
  const { s: state, p: payload, actor, clock, assertStock, outputSale } = context;
  let result = null;
  const sale = pick(state, "sales", payload.id);
  requireValue(
    ["CONFIRMED", "RECTIFIED"].includes(sale.commercial_status) && sale.fulfillment_status === "PENDING",
    "Esta venta no puede entregarse.",
  );
  const rows = saleSummary(state, sale).items;
  if (sale.coverage_version === 1) {
    requireValue(
      rows.every((row) => row.coverage?.quantity === row.quantity),
      "Pedido pendiente por stock: complete su cobertura antes de entregar.",
    );
  } else {
    requireValue(
      !context.partialReservations,
      "Pedido legado pendiente: requiere adopción explícita antes de entregar con reservas.",
    );
    assertStock(rows);
    outputSale(sale, rows);
  }
  sale.fulfillment_status = "DELIVERED";
  sale.delivered_at = clock;
  sale.delivered_by = actor.id;
  result = sale.id;
  return result;
}
export function saleCorrect(context) {
  const {
    s: state,
    p: payload,
    clock,
    add,
    reason,
    correction,
    saleItems,
    assertStock,
    outputSale,
  } = context;
  let result = null;
  const sale = pick(state, "sales", payload.id);
  if (sale.coverage_version === 1) {
    const old = saleSummary(state, sale).items;
    const proposed = saleItems(sale.id, payload.items, old);
    const fields = [
      "product_id",
      "quantity",
      "unit_weight_kg",
      "unit_price",
      "presentation_unit_snapshot",
      "unit_weight_grams_snapshot",
      "weight_policy_snapshot",
    ];
    const same =
      proposed.length === old.length &&
      proposed.every(
        (row, index) =>
          payload.items[index].original_item_id === old[index].id &&
          fields.every((field) => row[field] === old[index][field]),
      );
    requireValue(
      same && (payload.notes ?? sale.notes) === sale.notes,
      "Rectificación de reservas bloqueada hasta NQP26-05: requiere liberación y redistribución auditadas.",
    );
    reason();
    return sale.id;
  }
  requireValue(
    ["CONFIRMED", "RECTIFIED"].includes(sale.commercial_status),
    "Esta venta no puede rectificarse.",
  );
  requireValue(
    !state.returns.some((x) => x.sale_id === sale.id),
    "La venta tiene devoluciones; rectifique mediante ajustes administrativos separados.",
  );
  const why = reason();
  const before = structuredClone({ sale, summary: saleSummary(state, sale) });
  const old = before.summary.items;
  const rows = saleItems(sale.id, payload.items, old);
  requireValue(
    sum(rows, (x) => x.subtotal) >= before.summary.paid,
    "Hay pago excedente. Revierta el pago antes de completar la rectificación.",
  );
  if (sale.fulfillment_status === "DELIVERED") {
    assertStock(rows, old);
    outputSale(sale, old, -1, "CANCELLATION_REVERSAL");
    outputSale(sale, rows, 1, "ADJUSTMENT_OUT");
  }
  old.forEach((x) => (pick(state, "saleItems", x.id).is_current = false));
  rows.forEach((x) => add("saleItems", x));
  sale.commercial_status = "RECTIFIED";
  sale.notes = payload.notes ?? sale.notes;
  sale.updated_at = clock;
  correction("SALE", sale.id, before, { sale, summary: saleSummary(state, sale) }, why);
  result = sale.id;
  return result;
}
export function saleCancel(context) {
  const { s: state, p: payload, actor, clock, reason, movement } = context;
  let result = null;
  const sale = pick(state, "sales", payload.id);
  requireValue(
    sale.coverage_version !== 1,
    "Anulación de reservas bloqueada hasta NQP26-05: requiere liberación y redistribución auditadas.",
  );
  requireValue(sale.commercial_status !== "CANCELLED", "Ya anulada.");
  requireValue(saleSummary(state, sale).paid === 0, "Revierta explícitamente los pagos antes de anular.");
  const why = reason();
  if (sale.fulfillment_status === "DELIVERED") {
    for (const row of saleSummary(state, sale).items) {
      const returned = state.returnItems.filter((x) => x.sale_item_id === row.id);
      const quantity = row.quantity - sum(returned, (x) => x.quantity);
      const weight = row.total_weight_kg - sum(returned, (x) => x.weight_kg);
      if (quantity)
        movement({
          ...presentationSnapshot(row, true),
          item_type: "PRODUCT",
          item_id: row.product_id,
          movement_type: "CANCELLATION_REVERSAL",
          quantity: quantity,
          weight_kg: weight,
          source_type: "SALE",
          source_id: sale.id,
          notes: why,
        });
    }
  }
  Object.assign(sale, {
    commercial_status: "CANCELLED",
    financial_status: "CANCELLED",
    fulfillment_status: "CANCELLED",
    cancellation_reason: why,
    cancelled_at: clock,
    cancelled_by: actor.id,
  });
  result = sale.id;
  return result;
}
export function returnCreate(context) {
  const { s: state, p: payload, add, code, reason, movement } = context;
  let result = null;
  const sale = pick(state, "sales", payload.sale_id);
  requireValue(
    sale.fulfillment_status === "DELIVERED" && sale.commercial_status !== "CANCELLED",
    "Solo se devuelve producto entregado.",
  );
  requireValue(payload.items?.length > 0, "Agregue productos a devolver.");
  requireValue(
    new Set(payload.items.map((x) => x.sale_item_id)).size === payload.items.length,
    "Detalle repetido.",
  );
  const economic = scaled(payload.economic_amount ?? 0);
  requireValue(
    economic <= saleSummary(state, sale).balance,
    "La reducción económica excede el saldo. Revierta pagos antes de continuar.",
  );
  const returnRecord = add("returns", {
    code: code("returns", "DV"),
    sale_id: sale.id,
    return_date: date(payload.return_date),
    reason: reason(),
    notes: payload.notes ?? "",
    economic_amount: economic,
  });
  for (const row of payload.items) {
    const saleItem = pick(state, "saleItems", row.sale_item_id);
    requireValue(
      saleItem.sale_id === sale.id && saleItem.is_current !== false,
      "Detalle no pertenece a venta.",
    );
    const quantity = positiveInt(row.quantity);
    requireValue(
      quantity +
        sum(
          state.returnItems.filter((x) => x.sale_item_id === saleItem.id),
          (x) => x.quantity,
        ) <=
        saleItem.quantity,
      "Devolución excede cantidad entregada.",
    );
    const weight = quantity * saleItem.unit_weight_kg;
    add("returnItems", {
      return_id: returnRecord.id,
      sale_item_id: saleItem.id,
      quantity: quantity,
      weight_kg: weight,
    });
    movement({
      ...presentationSnapshot(saleItem, true),
      date: returnRecord.return_date,
      item_type: "PRODUCT",
      item_id: saleItem.product_id,
      movement_type: "RETURN_IN",
      quantity: quantity,
      weight_kg: weight,
      source_type: "RETURN",
      source_id: returnRecord.id,
      notes: returnRecord.reason,
    });
  }
  result = returnRecord.id;
  return result;
}
