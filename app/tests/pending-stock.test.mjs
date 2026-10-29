import assert from "node:assert/strict";
import { test } from "node:test";
import { pendingStock } from "../features/ventas/domain/pending-stock.mjs";
import { persistenceTest } from "./helpers/persistence-fixtures.mjs";
import { coverageFixture } from "./helpers/coverage-fixtures.mjs";
import { paymentPayload } from "./helpers/regression-scenarios.mjs";
import { createUiHarness } from "./helpers/ui-harness.mjs";

const ui = createUiHarness();
const render = (state) =>
  ui.renderComponent("features/ventas/components/PendingStockBanner.tsx", "default", { state, open() {} });
const sale = (id, extra = {}) => ({
  id,
  code: id,
  coverage_version: 1,
  commercial_status: "CONFIRMED",
  fulfillment_status: "PENDING",
  delivery_date: "2026-11-01",
  created_at: "2026-10-29T12:00:00Z",
  ...extra,
});
const row = (id, sale_id, quantity, covered, extra = {}) => ({
  id,
  sale_id,
  product_id: "bag",
  quantity,
  unit_weight_kg: 25000,
  presentation_unit_snapshot: "BAG",
  unit_weight_grams_snapshot: 25000,
  weight_policy_snapshot: "VARIABLE",
  coverage: { version: 1, quantity: covered },
  ...extra,
});
function fixture() {
  return {
    sales: [sale("a"), sale("b")],
    saleItems: [row("1", "a", 14, 7), row("2", "b", 6, 2)],
    products: [{ id: "bag", name: "Alimento sintético", stock_entry_mode: "NUCLEUS_PRODUCTION" }],
  };
}

test("A08-02/03/04: faltante neto, ventas únicas y selector puro", () => {
  const s = fixture();
  s.saleItems.push(row("3", "a", 3, 1));
  const before = structuredClone(s);
  const result = pendingStock(s);
  assert.equal(result.orders, 2);
  assert.equal(result.productionBags, 13);
  assert.equal(result.groups[0].missing, 13);
  assert.equal(result.groups[0].orders.length, 2);
  assert.equal(result.groups[0].orders[0].missing, 9);
  assert.deepEqual(s, before);
  assert.match(render(s), /2 pedidos pendientes por stock/);
  assert.match(render(s), /13 sacos por producir/);
});

test("A08-06/07/08/14: unidades, pesos y clasificación conservadora", () => {
  const s = fixture();
  s.saleItems.push(row("3", "a", 5, 1, { unit_weight_kg: 50000 }));
  s.products.push(
    { id: "bottle", name: "CascoPlus+", stock_entry_mode: "DIRECT_STOCK" },
    { id: "direct", name: "Saco directo", stock_entry_mode: "DIRECT_STOCK" },
    { id: "old", name: "Histórico ambiguo" },
  );
  s.saleItems.push(
    row("4", "a", 3, 1, {
      product_id: "bottle",
      presentation_unit_snapshot: "BOTTLE",
      unit_weight_grams_snapshot: 2200,
      unit_weight_kg: 2200,
      weight_policy_snapshot: "FIXED",
    }),
    row("5", "a", 4, 0, { product_id: "direct" }),
    row("6", "a", 2, 0, { product_id: "old" }),
  );
  const result = pendingStock(s);
  assert.equal(result.productionBags, 15);
  assert.equal(result.groups.length, 5);
  assert.equal(result.groups.find((g) => g.productId === "old").supply, "UNKNOWN");
  const html = render(s);
  assert.match(html, /CascoPlus\+/);
  assert.match(html, /2 frascos/);
  assert.match(html, /50 kg/);
  assert.match(html, /Por abastecer/);
  assert.match(html, /Abastecimiento por determinar/);
  assert.doesNotMatch(html, /21 sacos por producir/);
});

test("A08-09/10/14: solo ventas elegibles y cobertura explícita vigente", () => {
  for (const extra of [
    { commercial_status: "DRAFT" },
    { commercial_status: "CANCELLED" },
    { fulfillment_status: "DELIVERED" },
    { coverage_version: undefined },
  ]) {
    const s = fixture();
    s.sales = [sale("a", extra)];
    assert.equal(pendingStock(s).orders, 0);
    assert.equal(render(s), "");
  }
  const s = fixture();
  s.saleItems.forEach((r) => {
    r.coverage.quantity = r.quantity;
  });
  assert.equal(render(s), "");
  s.saleItems[0].coverage.quantity = 0;
  s.saleItems[0].is_current = false;
  assert.equal(render(s), "");
  s.saleItems[0].is_current = true;
  delete s.saleItems[0].coverage;
  assert.equal(render(s), "", "No inventar K ni N en líneas sin cobertura");
});

persistenceTest("A08-05/11/12/13/16: comandos reales, reposición, cobro, fecha y cancelación", async (t) => {
  const f = await coverageFixture(t);
  await f.run("PRODUCT_SAVE", {
    id: "prod-1",
    name: "Potripregnant",
    stock_entry_mode: "NUCLEUS_PRODUCTION",
    unit_weight_grams: 25000,
    bags_per_nucleus: 40,
    commercial_weight_per_nucleus_kg: 1000,
    is_sellable: true,
    default_sale_price: 73,
  });
  await f.adjust(35);
  const a = await f.sell(40);
  let s = await f.state();
  assert.equal(pendingStock(s).groups[0].missing, 5);
  const initial = pendingStock(s);
  const payment = await f.run("PAYMENT_CREATE", paymentPayload(f.customer, a));
  assert.deepEqual(pendingStock(await f.state()), initial);
  const b = await f.sell(10, "2026-11-02");
  await f.run("SALE_DELIVERY_DATE_UPDATE", {
    id: b,
    delivery_date: "2026-10-31",
    reason: "Prioridad sintética",
  });
  s = await f.state();
  assert.equal(pendingStock(s).groups[0].orders[0].id, b);
  assert.equal(pendingStock(s).productionBags, 15);
  await f.run("PAYMENT_REVERSE", {
    id: payment,
    date: "2026-10-29",
    reason: "Reversión sintética antes de anular",
  });
  await f.run("SALE_CANCEL", { id: a, reason: "Cancelación sintética" });
  s = await f.state();
  assert.equal(s.sales.find((x) => x.id === b).fulfillment_status, "PENDING");
  assert.equal(render(s), "", "La liberación cubre B sin duplicar unidades");
  const c = await f.sell(30);
  assert.equal(pendingStock(await f.state()).productionBags, 5);
  await f.adjust(10);
  s = await f.state();
  assert.equal(s.sales.find((x) => x.id === c).fulfillment_status, "PENDING");
  assert.equal(render(s), "");
  assert.deepEqual(pendingStock(await f.store.loadState()), pendingStock(s));
});
