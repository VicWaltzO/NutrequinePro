import { seedState, executeCommand } from "../../lib/domain.mjs";
import {
  assertCommercialCostIntegrity,
  commercialCosts,
} from "../../features/inventario/domain/commercial-cost.mjs";
export const actor = { id: "cost-admin", name: "Administrador sintético", role: "ADMIN", is_active: true };
export const identity = { userId: actor.id, displayName: actor.name };
export function fixture() {
  const s = seedState();
  s.users = [
    actor,
    { ...actor, id: "cost-admin2" },
    { ...actor, id: "cost-op", role: "OPERATOR" },
    { ...actor, id: "cost-view", role: "VIEWER" },
  ];
  s.customers = [{ id: "cost-customer", name: "Cliente sintético", is_active: true }];
  s.products.forEach((p, i) => {
    p.name = `Producto sintético ${i}`;
    p.is_sellable = true;
  });
  return s;
}
export function command(s, type, payload = {}) {
  return {
    type,
    request_id: crypto.randomUUID(),
    payload: {
      ...payload,
      ...(type.startsWith("COST_") ? { expected_revision: s.revision, reason: "Ensayo sintético" } : {}),
    },
  };
}
export function apply(s, c, user = actor, options = {}) {
  const out = executeCommand(s, c, user, "2026-11-14T20:00:00.000Z", options);
  Object.assign(out.state.audit.at(-1), { request_id: c.request_id, request_contract_version: 1 });
  assertCommercialCostIntegrity(s, out.state);
  return out;
}
export const start = (s) => apply(s, command(s, "COST_START")).state;
export const entry = (s, q = 10, id = "prod-1", kg = 25) =>
  apply(
    s,
    command(s, "INVENTORY_ADJUST", {
      product_id: id,
      direction: "IN",
      quantity: q,
      weight_kg: q * kg,
      date: "2026-11-14",
      reason: "Entrada sintética",
    }),
  ).state;
export const recognize = (
  s,
  amount,
  target = commercialCosts(s).flows.findLast((f) => f.quantity > 0 && !f.recognized && !f.return_of)?.id,
) => apply(s, command(s, "COST_RECOGNIZE", { target_id: target, amount, reference: "DOC sintético" })).state;
export const sell = (s, q = 5, extra = {}) =>
  apply(
    s,
    command(s, "SALE_SAVE", {
      customer_id: "cost-customer",
      site_id: "site-1",
      sale_date: "2026-11-14",
      payment_condition: "CREDIT",
      deliver: true,
      items: [{ product_id: "prod-1", quantity: q, unit_weight_kg: 25, unit_price: 200 }],
      ...extra,
    }),
  );
export const settle = (s) =>
  apply(s, command(s, "COST_SETTLE", { reference: "Liquidación sintética", period_open: true })).state;
export const returned = (s, sale, q) =>
  apply(
    s,
    command(s, "RETURN_CREATE", {
      sale_id: sale,
      return_date: "2026-11-14",
      reason: "Retorno sintético",
      economic_amount: 0,
      items: [{ sale_item_id: s.saleItems.find((i) => i.sale_id === sale && i.is_current).id, quantity: q }],
    }),
  ).state;
