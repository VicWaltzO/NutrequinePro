import { requireValue, scaled, positiveInt, date, pick, sum } from "../../../shared/domain/core.mjs";
import { saleSummary } from "./summary.mjs";
import { stock } from "../../inventario/domain/stock.mjs";
export function saleSave(context) {
  const { s, p, actor, clock, add, code, payment, saleItems, assertStock, outputSale, productionRows } =
    context;
  let result = null;
  const customer = pick(s, "customers", p.customer_id),
    site = pick(s, "sites", p.site_id);
  requireValue(customer.is_active && site.is_active, "Cliente y sede deben estar activos.");
  requireValue(["CASH", "CREDIT"].includes(p.payment_condition), "Condición inválida.");
  const sale = p.id
    ? pick(s, "sales", p.id)
    : add("sales", { code: code("sales", "V"), commercial_status: "DRAFT" });
  requireValue(sale.commercial_status === "DRAFT", "Use rectificación para ventas confirmadas.");
  const rows = saleItems(sale.id, p.items);
  s.saleItems.filter((x) => x.sale_id === sale.id).forEach((x) => (x.is_current = false));
  rows.forEach((x) => add("saleItems", x));
  Object.assign(sale, {
    customer_id: customer.id,
    site_id: site.id,
    sale_date: date(p.sale_date),
    payment_condition: p.payment_condition,
    notes: p.notes ?? "",
    fulfillment_status: "PENDING",
    updated_at: clock,
  });
  if (p.confirm !== false) {
    sale.commercial_status = "CONFIRMED";
    sale.confirmed_at = clock;
    sale.confirmed_by = actor.id;
    if (p.deliver) {
      assertStock(rows);
      outputSale(sale, rows);
      sale.fulfillment_status = "DELIVERED";
      sale.delivered_at = clock;
      sale.delivered_by = actor.id;
    }
    if (sale.payment_condition === "CASH") {
      const total = sum(rows, (x) => x.subtotal),
        paid = scaled(p.paid_amount ?? total / 100);
      if (paid > 0)
        payment(customer.id, paid, total > 0 ? [{ sale_id: sale.id, amount: Math.min(total, paid) }] : [], p);
    }
  }
  if (!s.customerSites.some((x) => x.customer_id === customer.id && x.site_id === site.id))
    add("customerSites", {
      customer_id: customer.id,
      site_id: site.id,
      is_default: false,
      is_active: true,
    });
  if (p.create_production) {
    const pr = add("productions", {
      code: code("productions", "PR"),
      status: "DRAFT",
      production_date: sale.sale_date,
      responsible_user_id: actor.id,
      notes: `Planificado para ${sale.code}`,
    });
    const grouped = {};
    rows.forEach((x) => (grouped[x.product_id] = (grouped[x.product_id] ?? 0) + x.quantity));
    const input = {
      products: Object.entries(grouped).map(([id, q]) => ({
        product_id: id,
        nuclei_count: Math.max(
          1,
          Math.ceil(Math.max(0, q - stock(s, id).quantity) / pick(s, "products", id).bags_per_nucleus),
        ),
      })),
    };
    productionRows(pr, input);
    add("saleProductionLinks", {
      sale_id: sale.id,
      production_id: pr.id,
      notes: "Creado desde venta futura",
    });
  }
  if (p.production_id) {
    pick(s, "productions", p.production_id);
    add("saleProductionLinks", { sale_id: sale.id, production_id: p.production_id, notes: "" });
  }
  result = sale.id;
  return result;
}
export function saleDeliver(context) {
  const { s, p, actor, clock, assertStock, outputSale } = context;
  let result = null;
  const sale = pick(s, "sales", p.id);
  requireValue(
    ["CONFIRMED", "RECTIFIED"].includes(sale.commercial_status) && sale.fulfillment_status === "PENDING",
    "Esta venta no puede entregarse.",
  );
  const rows = saleSummary(s, sale).items;
  assertStock(rows);
  outputSale(sale, rows);
  sale.fulfillment_status = "DELIVERED";
  sale.delivered_at = clock;
  sale.delivered_by = actor.id;
  result = sale.id;
  return result;
}
export function saleCorrect(context) {
  const { s, p, clock, add, reason, correction, saleItems, assertStock, outputSale } = context;
  let result = null;
  const sale = pick(s, "sales", p.id);
  requireValue(
    ["CONFIRMED", "RECTIFIED"].includes(sale.commercial_status),
    "Esta venta no puede rectificarse.",
  );
  requireValue(
    !s.returns.some((x) => x.sale_id === sale.id),
    "La venta tiene devoluciones; rectifique mediante ajustes administrativos separados.",
  );
  const why = reason(),
    before = structuredClone({ sale, summary: saleSummary(s, sale) });
  const old = before.summary.items;
  const rows = saleItems(sale.id, p.items, old);
  requireValue(
    sum(rows, (x) => x.subtotal) >= before.summary.paid,
    "Hay pago excedente. Revierta el pago antes de completar la rectificación.",
  );
  if (sale.fulfillment_status === "DELIVERED") {
    assertStock(rows, old);
    outputSale(sale, old, -1, "CANCELLATION_REVERSAL");
    outputSale(sale, rows, 1, "ADJUSTMENT_OUT");
  }
  old.forEach((x) => (pick(s, "saleItems", x.id).is_current = false));
  rows.forEach((x) => add("saleItems", x));
  sale.commercial_status = "RECTIFIED";
  sale.notes = p.notes ?? sale.notes;
  sale.updated_at = clock;
  correction("SALE", sale.id, before, { sale, summary: saleSummary(s, sale) }, why);
  result = sale.id;
  return result;
}
export function saleCancel(context) {
  const { s, p, actor, clock, reason, movement } = context;
  let result = null;
  const sale = pick(s, "sales", p.id);
  requireValue(sale.commercial_status !== "CANCELLED", "Ya anulada.");
  requireValue(saleSummary(s, sale).paid === 0, "Revierta explícitamente los pagos antes de anular.");
  const why = reason();
  if (sale.fulfillment_status === "DELIVERED") {
    for (const row of saleSummary(s, sale).items) {
      const returned = s.returnItems.filter((x) => x.sale_item_id === row.id);
      const q = row.quantity - sum(returned, (x) => x.quantity);
      const w = row.total_weight_kg - sum(returned, (x) => x.weight_kg);
      if (q)
        movement({
          item_type: "PRODUCT",
          item_id: row.product_id,
          movement_type: "CANCELLATION_REVERSAL",
          quantity: q,
          weight_kg: w,
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
  const { s, p, add, code, reason, movement } = context;
  let result = null;
  const sale = pick(s, "sales", p.sale_id);
  requireValue(
    sale.fulfillment_status === "DELIVERED" && sale.commercial_status !== "CANCELLED",
    "Solo se devuelve producto entregado.",
  );
  requireValue(p.items?.length > 0, "Agregue productos a devolver.");
  requireValue(new Set(p.items.map((x) => x.sale_item_id)).size === p.items.length, "Detalle repetido.");
  const economic = scaled(p.economic_amount ?? 0);
  requireValue(
    economic <= saleSummary(s, sale).balance,
    "La reducción económica excede el saldo. Revierta pagos antes de continuar.",
  );
  const ret = add("returns", {
    code: code("returns", "DV"),
    sale_id: sale.id,
    return_date: date(p.return_date),
    reason: reason(),
    notes: p.notes ?? "",
    economic_amount: economic,
  });
  for (const row of p.items) {
    const si = pick(s, "saleItems", row.sale_item_id);
    requireValue(si.sale_id === sale.id && si.is_current !== false, "Detalle no pertenece a venta.");
    const q = positiveInt(row.quantity);
    requireValue(
      q +
        sum(
          s.returnItems.filter((x) => x.sale_item_id === si.id),
          (x) => x.quantity,
        ) <=
        si.quantity,
      "Devolución excede cantidad entregada.",
    );
    const weight = q * si.unit_weight_kg;
    add("returnItems", { return_id: ret.id, sale_item_id: si.id, quantity: q, weight_kg: weight });
    movement({
      date: ret.return_date,
      item_type: "PRODUCT",
      item_id: si.product_id,
      movement_type: "RETURN_IN",
      quantity: q,
      weight_kg: weight,
      source_type: "RETURN",
      source_id: ret.id,
      notes: ret.reason,
    });
  }
  result = ret.id;
  return result;
}
