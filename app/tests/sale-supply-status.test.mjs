import assert from "node:assert/strict";
import { test } from "node:test";
import { createUiHarness } from "./helpers/ui-harness.mjs";
import { persistenceTest } from "./helpers/persistence-fixtures.mjs";
import { coverageFixture } from "./helpers/coverage-fixtures.mjs";
import { saleSummary, stock } from "../lib/domain.mjs";
import { paymentPayload } from "./helpers/regression-scenarios.mjs";

const ui = createUiHarness();
const render = (state, id) => {
  const sale = state.sales.find((s) => s.id === id);
  return ui.renderComponent("features/ventas/components/SaleSupplyStatus.tsx", "SaleSupplyStatus", {
    sale,
    state,
    summary: saleSummary(state, sale),
  });
};

persistenceTest(
  "E07-05/06/08/10: presentación consume K/N real; pago y reposición no entregan",
  async (t) => {
    const f = await coverageFixture(t);
    await f.adjust(2);
    const id = await f.sell(3);
    let s = await f.state();
    const before = structuredClone(s);
    let html = render(s, id);
    assert.match(html, /Pendiente por stock/);
    assert.match(html, /2 de 3 sacos cubiertos/);
    assert.match(html, /Falta 1 saco/);
    assert.match(html, /Entrega pendiente/);
    assert.equal(stock(s, "prod-1").committed, 3);
    assert.deepEqual(s, before, "Renderizar no escribe ni usa committed como K");
    await f.run("PAYMENT_CREATE", paymentPayload(f.customer, id));
    s = await f.state();
    assert.equal(render(s, id), html, "Cobrar no cambia la presentación de cobertura");
    await f.adjust(1);
    s = await f.state();
    html = render(s, id);
    assert.match(html, /Listo por stock/);
    assert.match(html, /3 de 3 sacos cubiertos/);
    assert.doesNotMatch(html, /Faltan|Entregado/);
    assert.match(html, /Entrega pendiente/);
    assert.equal(stock(s, "prod-1").quantity, 0);
    assert.equal(s.sales.find((r) => r.id === id).fulfillment_status, "PENDING");
    // Detail must use the domain coverage, even with no free commercial balance.
    const detail = ui.renderComponent("features/ventas/components/SaleDetail.tsx", "default", {
      s,
      id,
      actor: s.users[0],
      open() {},
      run() {},
    });
    assert.match(detail, /<button class="primary">Registrar entrega<\/button>/);
    assert.doesNotMatch(detail, /Stock físico|Disponibilidad para esta entrega/);
    const moves = structuredClone(s.inventoryMovements);
    await f.run("SALE_DELIVER", { id });
    s = await f.state();
    assert.match(render(s, id), / · Entregado/);
    assert.deepEqual(s.inventoryMovements, moves, "Entrega explícita no repite el cargo");
  },
);

test("E07-09/11: legacy no imputa cobertura; unidades y presentaciones no se suman", () => {
  const state = {
    saleItems: [
      {
        id: "a",
        sale_id: "s",
        product_id: "bag",
        quantity: 3,
        unit_weight_kg: 25000,
        subtotal: 0,
        coverage: { quantity: 2 },
        presentation_unit_snapshot: "BAG",
      },
      {
        id: "b",
        sale_id: "s",
        product_id: "bag",
        quantity: 2,
        unit_weight_kg: 50000,
        subtotal: 0,
        coverage: { quantity: 2 },
        presentation_unit_snapshot: "BAG",
      },
      {
        id: "c",
        sale_id: "s",
        product_id: "bottle",
        quantity: 4,
        unit_weight_kg: 2200,
        subtotal: 0,
        coverage: { quantity: 1 },
        presentation_unit_snapshot: "BOTTLE",
      },
    ],
    sales: [{ id: "s", commercial_status: "CONFIRMED", fulfillment_status: "PENDING" }],
    products: [
      { id: "bag", name: "Alimento sintético" },
      { id: "bottle", name: "CascoPlus+" },
    ],
    returns: [],
    paymentApplications: [],
    paymentReversals: [],
  };
  let html = render(state, "s");
  assert.match(html, /Flujo legacy · sin cobertura registrada/);
  assert.doesNotMatch(html, /cubiertos|Faltan|Listo por stock|Pendiente por stock/);
  assert.equal(saleSummary(state, state.sales[0]).coverage_lines, undefined);
  state.sales[0].coverage_version = 1;
  html = render(state, "s");
  assert.match(html, /25 kg por saco: 2 de 3 sacos/);
  assert.match(html, /50 kg por saco: 2 de 2 sacos/);
  assert.match(html, /2\.2 kg por frasco: 1 de 4 frascos/);
  assert.match(html, /Faltan 3 frascos/);
  assert.doesNotMatch(html, /9 unidades|Faltan 4 sacos/);
  for (const status of ["DRAFT", "CANCELLED"]) {
    state.sales[0].commercial_status = status;
    assert.equal(render(state, "s"), "");
  }
});
