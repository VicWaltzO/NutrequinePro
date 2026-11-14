import { test } from "node:test";
import assert from "node:assert/strict";
import {
  fixture,
  actor,
  command,
  apply,
  start,
  entry,
  recognize,
  sell,
  settle,
  returned,
} from "./helpers/commercial-cost-fixture.mjs";
import {
  commercialCosts,
  costMoney,
  saleCommercialCost,
  costHistory,
  assertCommercialCostIntegrity,
} from "../features/inventario/domain/commercial-cost.mjs";
import { balanceSummary } from "../features/balance/domain/summary.mjs";
import { ready, apply as millApply, closeCommand } from "./helpers/mill-fixture.mjs";
import { millCostSummary } from "../features/produccion/domain/mill-cost.mjs";
const group = (s) => commercialCosts(s).groups[0];
const protectedTables = [
  "inventoryMovements",
  "sales",
  "saleItems",
  "returns",
  "returnItems",
  "expenses",
  "payments",
  "millClosures",
  "productionCosts",
  "microIssues",
  "microConfirmations",
];
function unchanged(a, b) {
  for (const t of protectedTables) assert.deepEqual(a[t], b[t], t);
  assert.deepEqual(balanceSummary(a), balanceSummary(b));
}
test("NQP33 dos lotes 10x100 + 20x160, venta 5 a promedio 140 y snapshot histórico", () => {
  let s = start(fixture());
  s = recognize(entry(s, 10), "1000");
  s = recognize(entry(s, 20), "3200");
  assert.equal(costMoney(group(s).average), 14000);
  const out = sell(s),
    id = out.result;
  s = out.state;
  assert.equal(costMoney(saleCommercialCost(s, id).cost), 70000);
  assert.equal(group(s).quantity, 25);
  assert.equal(costMoney(group(s).value), 350000);
  const before = structuredClone(s),
    event = costHistory(s)
      .filter((r) => r.new_snapshot.kind === "MOVEMENT")
      .at(-1);
  s = apply(
    s,
    command(s, "COST_ADJUST", {
      key: group(s).key,
      direction: "INCREASE",
      amount: "25",
      reference: "Ajuste nuevo",
    }),
  ).state;
  assert.equal(costMoney(saleCommercialCost(s, id).cost), 70000);
  assert.deepEqual(
    s.corrections.find((r) => r.id === event.id),
    event,
  );
  unchanged(before, s);
  assert.equal(costMoney(group(s).average), 14100);
});
test("NQP33 entrega abierta, sin falso promedio, liquidación explícita conserva originales", () => {
  let s = start(fixture());
  s = recognize(entry(s, 10), "1000");
  s = entry(s, 20);
  const target = commercialCosts(s).flows.at(-1).id;
  let out = sell(s);
  s = out.state;
  const id = out.result;
  assert.equal(saleCommercialCost(s, id).status, "PENDING");
  assert.equal(group(s).average, null);
  assert.equal(group(s).value, null);
  const before = structuredClone(s);
  s = recognize(s, "3200", target);
  assert.equal(saleCommercialCost(s, id).status, "PENDING");
  unchanged(before, s);
  s = settle(s);
  assert.equal(costMoney(saleCommercialCost(s, id).cost), 70000);
  assert.equal(costMoney(group(s).value), 350000);
  unchanged(before, s);
  const original = costHistory(s).find((r) => r.new_snapshot.id === out.state.inventoryMovements.at(-1).id);
  assert.equal(original.new_snapshot.amount, null);
  assert.throws(() => apply(s, command(s, "COST_SETTLE", { reference: "DOC", period_open: true })), /No hay/);
});
test("NQP33 devolución parcial/total después de otra entrada usa costo original", () => {
  let s = recognize(entry(start(fixture()), 10), "1000");
  const out = sell(s, 5);
  s = recognize(entry(out.state, 5), "1000");
  s = returned(s, out.result, 2);
  assert.equal(costMoney(saleCommercialCost(s, out.result).cost), 30000);
  assert.equal(costMoney(group(s).value), 170000);
  s = returned(s, out.result, 3);
  assert.equal(costMoney(saleCommercialCost(s, out.result).cost), 0);
  assert.equal(costMoney(group(s).value), 200000);
  assert.throws(() => returned(s, out.result, 1), /excede/);
});
test("NQP33 retorno pendiente y liquidación, sin usar promedio posterior", () => {
  let s = entry(start(fixture()), 10),
    target = commercialCosts(s).flows.at(-1).id,
    out = sell(s, 5);
  s = returned(out.state, out.result, 2);
  s = recognize(entry(s, 5), "1000");
  assert.equal(group(s).value, null);
  s = recognize(s, "1000", target);
  s = settle(s);
  assert.equal(costMoney(saleCommercialCost(s, out.result).cost), 30000);
  assert.equal(costMoney(group(s).value), 170000);
});
test("NQP33 rectificación y anulación compensan costo original sin editar snapshots", () => {
  let s = recognize(entry(start(fixture()), 10), "1000"),
    out = sell(s, 5);
  s = recognize(entry(out.state, 10), "2000");
  const old = s.saleItems.find((i) => i.sale_id === out.result && i.is_current),
    before = structuredClone(costHistory(s));
  s = apply(
    s,
    command(s, "SALE_CORRECT", {
      id: out.result,
      reason: "Rectificación sintética",
      items: [
        {
          original_item_id: old.id,
          product_id: old.product_id,
          quantity: 3,
          unit_weight_kg: 25,
          unit_price: 200,
        },
      ],
    }),
  ).state;
  assert.equal(costMoney(saleCommercialCost(s, out.result).cost), 45000);
  for (const r of before)
    assert.deepEqual(
      costHistory(s).find((v) => v.id === r.id),
      r,
    );
  s = apply(s, command(s, "SALE_CANCEL", { id: out.result, reason: "Anulación sintética" })).state;
  assert.equal(costMoney(saleCommercialCost(s, out.result).cost), 0);
  assert.equal(costMoney(group(s).value), 300000);
});
test("NQP33 pedido pendiente no genera costo; legacy no se reconstruye", () => {
  let s = entry(fixture(), 10),
    old = sell(s, 2);
  s = start(old.state);
  assert.equal(saleCommercialCost(s, old.result).status, "UNTRACKED");
  assert.equal(group(s).quantity, 8);
  const opening = commercialCosts(s).flows[0].id;
  s = recognize(s, "800", opening);
  const out = sell(s, 3, { deliver: false });
  s = out.state;
  assert.equal(saleCommercialCost(s, out.result).status, "UNTRACKED");
  s = apply(s, command(s, "SALE_DELIVER", { id: out.result })).state;
  assert.equal(costMoney(saleCommercialCost(s, out.result).cost), 30000);
  s = returned(s, old.result, 1);
  assert.equal(commercialCosts(s).flows.at(-1).amount, null);
  assert.equal(commercialCosts(s).flows.at(-1).return_of, null);
});
test("NQP33 BAG25, BASE BAG50 y BOTTLE 2200g no se mezclan; pesos reales distintos", () => {
  let s = start(fixture());
  s = entry(s, 10);
  s.products[0].unit_weight_grams = 50000;
  s = entry(s, 5, "prod-1", 50);
  s.products[0].unit_weight_grams = 25000;
  s = entry(s, 3, "prod-4", 50);
  s.products.push({
    ...s.products[0],
    id: "bottle",
    name: "CascoPlus+ sintético",
    presentation_unit: "BOTTLE",
    unit_weight_grams: 2200,
    weight_policy: "FIXED",
    stock_entry_mode: "DIRECT_STOCK",
  });
  s = entry(s, 2, "bottle", 2.2);
  assert.equal(commercialCosts(s).groups.length, 4);
  for (const f of commercialCosts(s).flows) s = recognize(s, "10", f.id);
  const out = sell(s, 1);
  assert.equal(costMoney(saleCommercialCost(out.state, out.result).cost), 100);
  assert.equal(commercialCosts(out.state).groups.find((g) => g.product_id === "bottle").quantity, 2);
  const direct = sell(out.state, 1, {
    items: [
      { product_id: "prod-4", quantity: 2, unit_weight_kg: 50, unit_price: 200 },
      { product_id: "bottle", quantity: 1, unit_weight_kg: 2.2, unit_price: 100 },
    ],
  });
  assert.equal(costMoney(saleCommercialCost(direct.state, direct.result).cost), 1167);
  const bottleLine = direct.state.saleItems.find(
    (i) => i.sale_id === direct.result && i.product_id === "bottle",
  );
  const afterReturn = apply(
    direct.state,
    command(direct.state, "RETURN_CREATE", {
      sale_id: direct.result,
      return_date: "2026-11-14",
      reason: "Retorno frasco",
      economic_amount: 0,
      items: [{ sale_item_id: bottleLine.id, quantity: 1 }],
    }),
  ).state;
  assert.equal(costMoney(saleCommercialCost(afterReturn, direct.result).cost), 667);
});
test("NQP33 null no es cero, precisión racional, vaciado sin residuo, importes grandes", () => {
  let s = entry(start(fixture()), 3);
  assert.equal(group(s).value, null);
  s = recognize(s, "0.01");
  let total = 0;
  for (let i = 0; i < 3; i++) {
    const out = sell(s, 1);
    s = out.state;
    total +=
      Number(saleCommercialCost(s, out.result).cost.n) / Number(saleCommercialCost(s, out.result).cost.d);
  }
  assert.equal(total, 1);
  assert.deepEqual(group(s).value, { n: "0", d: "1" });
  s = recognize(entry(s, 3), "0");
  const out = sell(s, 1);
  assert.equal(costMoney(saleCommercialCost(out.state, out.result).cost), 0);
  s = recognize(entry(out.state, 1), "10000000000");
  assert.ok(BigInt(group(s).value.n) > 0n);
  for (const amount of [null, "", -1, "1e3", "0.001", "10000000001"]) {
    const pending = entry(s, 1);
    assert.throws(() => recognize(pending, amount));
  }
  assert.equal(costMoney({ n: "1", d: "2" }), 1);
  assert.equal(costMoney({ n: "-1", d: "2" }), -1);
});
test("NQP33 validaciones, permisos, CAS, reservas y auditoría inmutable", () => {
  let s = start(fixture());
  assert.throws(() => start(s), /ya está/);
  s = entry(s, 10);
  const c = command(s, "COST_RECOGNIZE", {
    target_id: commercialCosts(s).flows[0].id,
    amount: "10",
    reference: "DOC",
  });
  for (const role of ["OPERATOR", "VIEWER"])
    assert.throws(() => apply(s, c, { ...actor, role }), /administrador|consultar/);
  assert.throws(
    () => apply(s, { ...c, payload: { ...c.payload, expected_revision: s.revision - 1 } }),
    /cambiaron/,
  );
  assert.throws(() => apply(s, { ...c, payload: { ...c.payload, unknown: true } }), /no permitido/);
  assert.throws(() => apply(s, c, actor, { partialReservations: true }), /reservas/);
  s = apply(s, c).state;
  assert.throws(
    () => apply(s, command(s, "COST_RECOGNIZE", { ...c.payload, expected_revision: s.revision })),
    /inmutable/,
  );
  const altered = structuredClone(s);
  altered.corrections.at(-1).new_snapshot.amount = { n: "1", d: "1" };
  assert.throws(() => assertCommercialCostIntegrity(s, altered), /inmutable/);
  assert.throws(() => assertCommercialCostIntegrity(null, altered), /Importe/);
});
test("NQP33 40/39/38/0 sacos y conciliación variable nunca recostean venta cerrada", () => {
  for (const bags of [40, 39, 38, 0]) {
    const f = ready([bags ? "1" : "0.01"]);
    let s = start(f.s);
    s = millApply(s, closeCommand(s, bags), f.options).state;
    if (!bags) {
      assert.equal(commercialCosts(s).flows.filter((e) => e.kind === "MOVEMENT").length, 0);
      continue;
    }
    s = millApply(
      s,
      {
        type: "MILL_RECONCILE",
        request_id: crypto.randomUUID(),
        payload: {
          line_id: s.productionJourneyLines[0].id,
          mode: "ACTUAL",
          changes: [],
          reason: "DOC",
          expected_revision: s.revision,
        },
      },
      f.options,
    ).state;
    s = millApply(
      s,
      {
        type: "MILL_COST_INPUT",
        request_id: crypto.randomUUID(),
        payload: {
          line_id: s.productionJourneyLines[0].id,
          packaging_amount: "0",
          packaging_reference: "DOC",
          extras: [],
          reviewed_costs: true,
          reason: "DOC",
          expected_revision: s.revision,
        },
      },
      f.options,
    ).state;
    const target = commercialCosts(s).flows[0].id;
    s = millApply(
      s,
      command(s, "COST_RECOGNIZE", {
        target_id: target,
        amount: "3900",
        reference: "Costo aprobado sintético",
      }),
      f.options,
    ).state;
    s.customers = [{ id: "cost-customer", name: "Cliente sintético", is_active: true }];
    const out = millApply(
      s,
      command(s, "SALE_SAVE", {
        customer_id: "cost-customer",
        site_id: "site-1",
        sale_date: "2026-11-14",
        payment_condition: "CREDIT",
        deliver: true,
        items: [{ product_id: "prod-1", quantity: 1, unit_weight_kg: 25, unit_price: 200 }],
      }),
      f.options,
    );
    s = out.state;
    const cost = structuredClone(saleCommercialCost(s, out.result)),
      view = millCostSummary(s, s.productionJourneyLines[0].id);
    s = millApply(
      s,
      {
        type: "MILL_RECONCILE",
        request_id: crypto.randomUUID(),
        payload: {
          line_id: s.productionJourneyLines[0].id,
          mode: "ACTUAL",
          changes: [
            {
              ingredient_id: s.productionJourneyLines[0].macro_estimate[0].ingredient_id,
              quantity_kg: "2",
              price_per_kg: "99",
            },
          ],
          reason: "DOC nuevo",
          expected_revision: s.revision,
        },
      },
      f.options,
    ).state;
    assert.notDeepEqual(millCostSummary(s, s.productionJourneyLines[0].id).total, view.total);
    assert.deepEqual(saleCommercialCost(s, out.result), cost);
    assert.equal(s.millClosures[0].final_cost_cents, null);
    assertCommercialCostIntegrity(null, s);
  }
});

test("NQP33 regresión independiente: VARIABLE 24kg y 3 sacos/74kg no bloquean operación", () => {
  let s = entry(start(fixture()), 10);
  s = recognize(s, "1000");
  const out = sell(s, 1, {
    items: [{ product_id: "prod-1", quantity: 1, unit_weight_kg: 24, unit_price: 200 }],
  });
  s = out.state;
  assert.equal(costMoney(saleCommercialCost(s, out.result).cost), 10000);
  assert.equal(group(s).quantity, 9);
  s = apply(
    s,
    command(s, "INVENTORY_ADJUST", {
      product_id: "prod-1",
      direction: "IN",
      quantity: 3,
      weight_kg: 74,
      date: "2026-11-14",
      reason: "Peso variable sintético",
    }),
  ).state;
  assert.equal(group(s).quantity, 12);
  assert.equal(group(s).value, null);
});
test("NQP33 salida de presentación sin correspondencia permanece pendiente sin impedir entrega", () => {
  let s = recognize(entry(start(fixture()), 10), "1000");
  s.products[0].unit_weight_grams = 50000;
  const out = sell(s, 1, {
    items: [{ product_id: "prod-1", quantity: 1, unit_weight_kg: 50, unit_price: 200 }],
  });
  assert.equal(out.state.sales.at(-1).fulfillment_status, "DELIVERED");
  assert.equal(saleCommercialCost(out.state, out.result).status, "PENDING");
});

test("NQP33 retorno legacy valorado no crea costo ni margen de la venta anterior", () => {
  const old = sell(entry(fixture(), 10), 2);
  let s = recognize(start(old.state), "800");
  s = returned(s, old.result, 1);
  const returnId = commercialCosts(s).flows.at(-1).id;
  s = recognize(s, "100", returnId);
  assert.equal(saleCommercialCost(s, old.result).status, "UNTRACKED");
  assert.equal(saleCommercialCost(s, old.result).cost, null);
});
