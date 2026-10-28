import { test } from "node:test";
import assert from "node:assert/strict";
import {
  seedState,
  executeCommand,
  saleSummary,
  paymentSummary,
  customerSummary,
  balanceSummary,
  stock,
  deliveryAvailability,
} from "../lib/domain.mjs";

const actor = { id: "admin", name: "Admin", role: "ADMIN", is_active: true };
function fixture() {
  let state = seedState();
  state.users.push(actor);
  const run = (type, payload) => {
    const out = executeCommand(state, { type, payload }, actor, "2026-10-09T12:00:00Z");
    state = out.state;
    return out.result;
  };
  const customer = run("CUSTOMER_SAVE", { name: "Prueba crédito" });
  return { run, customer, state: () => state };
}
const items = (quantity = 10) => [{ product_id: "prod-1", quantity, unit_price: "73", unit_weight_kg: "25" }];
const sale = (customer, extra = {}) => ({
  customer_id: customer,
  site_id: "site-1",
  sale_date: "2026-10-09",
  payment_condition: "CASH",
  payment_method: "CASH",
  confirm: true,
  deliver: false,
  items: items(),
  ...extra,
});

test("contado parcial conserva deuda y cobro real exacto, sin exigir pago total", () => {
  const f = fixture(),
    id = f.run("SALE_SAVE", sale(f.customer, { paid_amount: "100.10" })),
    s = f.state(),
    a = saleSummary(
      s,
      s.sales.find((x) => x.id === id),
    );
  assert.equal(a.total, 73000);
  assert.equal(a.paid, 10010);
  assert.equal(a.balance, 62990);
  assert.equal(a.financial_status, "PARTIAL");
  assert.equal(s.payments.length, 1);
  assert.equal(balanceSummary(s).collections, 10010);
  assert.equal(balanceSummary(s).receivable, 62990);
  assert.equal(customerSummary(s, f.customer).credit, 0);
});
test("contado sin pago no crea cobro ficticio ni exige método", () => {
  const f = fixture(),
    id = f.run("SALE_SAVE", sale(f.customer, { paid_amount: 0, payment_method: "" }));
  assert.equal(saleSummary(f.state(), { id }).balance, 73000);
  assert.equal(f.state().payments.length, 0);
  assert.equal(balanceSummary(f.state()).collections, 0);
});
test("pago excedente mantiene saldo a favor y su aplicación no duplica caja", () => {
  const f = fixture(),
    id = f.run("SALE_SAVE", sale(f.customer, { paid_amount: "800" })),
    pay = f.state().payments[0];
  assert.equal(saleSummary(f.state(), { id }).balance, 0);
  assert.equal(paymentSummary(f.state(), pay).available, 7000);
  assert.deepEqual(customerSummary(f.state(), f.customer), { debt: 0, credit: 7000, net: -7000 });
  assert.equal(balanceSummary(f.state()).collections, 80000);
  assert.equal(balanceSummary(f.state()).customer_credit, 7000);
  const next = f.run("SALE_SAVE", sale(f.customer, { payment_condition: "CREDIT", items: items(1) }));
  f.run("PAYMENT_APPLY_CREDIT", {
    payment_id: pay.id,
    applications: [{ sale_id: next, applied_amount: 70 }],
  });
  assert.equal(saleSummary(f.state(), { id: next }).balance, 300);
  assert.equal(paymentSummary(f.state(), pay).available, 0);
  assert.equal(f.state().payments.length, 1);
  assert.equal(balanceSummary(f.state()).collections, 80000);
  const snapshot = structuredClone(f.state());
  assert.throws(
    () =>
      f.run("PAYMENT_APPLY_CREDIT", {
        payment_id: pay.id,
        applications: [{ sale_id: next, applied_amount: 1 }],
      }),
    /disponible/,
  );
  assert.deepEqual(f.state(), snapshot);
  f.run("PAYMENT_REVERSE", { id: pay.id, date: "2026-10-09", reason: "Corrección del ingreso" });
  assert.equal(paymentSummary(f.state(), pay).available, 0);
  assert.equal(balanceSummary(f.state()).collections, 0);
  assert.equal(customerSummary(f.state(), f.customer).debt, 80300);
  assert.equal(f.state().paymentApplications.length, 2);
});
test("un pago distribuido conserva el resto; crédito no cruza clientes ni supera deuda", () => {
  const f = fixture(),
    id = f.run("SALE_SAVE", sale(f.customer, { payment_condition: "CREDIT" }));
  const pay = f.run("PAYMENT_CREATE", {
    customer_id: f.customer,
    total_amount: "900",
    payment_date: "2026-10-09",
    payment_method: "TRANSFER",
    applications: [{ sale_id: id, applied_amount: 700 }],
  });
  assert.equal(paymentSummary(f.state(), f.state().payments[0]).available, 20000);
  assert.throws(
    () =>
      f.run("PAYMENT_APPLY_CREDIT", { payment_id: pay, applications: [{ sale_id: id, applied_amount: 31 }] }),
    /saldo pendiente/,
  );
  const other = f.run("CUSTOMER_SAVE", { name: "Otro cliente" }),
    otherSale = f.run("SALE_SAVE", sale(other, { payment_condition: "CREDIT" }));
  assert.throws(
    () =>
      f.run("PAYMENT_APPLY_CREDIT", {
        payment_id: pay,
        applications: [{ sale_id: otherSale, applied_amount: 1 }],
      }),
    /coincidir/,
  );
  const command = {
    type: "PAYMENT_APPLY_CREDIT",
    payload: { payment_id: pay, applications: [{ sale_id: id, applied_amount: 1 }] },
  };
  assert.throws(() => executeCommand(f.state(), command, { ...actor, role: "VIEWER" }), /consultar/);
  f.run("PAYMENT_REVERSE", { id: pay, date: "2026-10-09", reason: "Prueba" });
  assert.throws(() => f.run("PAYMENT_APPLY_CREDIT", command.payload), /revertido/);
});
test("venta futura con lote producido entrega sin descontar compromisos dos veces", () => {
  const f = fixture(),
    id = f.run("SALE_SAVE", sale(f.customer, { paid_amount: 200, create_production: true }));
  const p = f.state().productions[0];
  assert.equal(p.status, "DRAFT");
  assert.equal(stock(f.state(), "prod-1").quantity, 0);
  f.run("PRODUCTION_CONFIRM", { id: p.id });
  assert.equal(stock(f.state(), "prod-1").quantity, 40);
  assert.equal(stock(f.state(), "prod-1").committed, 10);
  f.run("SALE_DELIVER", { id });
  assert.equal(stock(f.state(), "prod-1").quantity, 30);
  assert.equal(stock(f.state(), "prod-1").committed, 0);
  assert.equal(saleSummary(f.state(), { id }).balance, 53000);
  assert.throws(() => f.run("SALE_DELIVER", { id }), /no puede entregarse/);
});
test("reproduce faltante 20 Hi-Performance, entrega atómica y éxito tras completar lote", () => {
  const f = fixture();
  const rows = [
    { product_id: "prod-1", quantity: 40, unit_price: 73, unit_weight_kg: 25 },
    { product_id: "prod-2", quantity: 60, unit_price: 67, unit_weight_kg: 25 },
    { product_id: "prod-3", quantity: 20, unit_price: 69, unit_weight_kg: 25 },
  ];
  const id = f.run(
      "SALE_SAVE",
      sale(f.customer, { items: rows, paid_amount: 2080, create_production: true }),
    ),
    p = f.state().productions[0];
  f.run("PRODUCTION_SAVE", {
    id: p.id,
    production_date: "2026-10-09",
    products: [
      { product_id: "prod-1", nuclei_count: 2 },
      { product_id: "prod-2", nuclei_count: 1 },
      { product_id: "prod-3", nuclei_count: 1 },
    ],
    confirm: true,
  });
  const s = structuredClone(f.state()),
    available = deliveryAvailability(s, saleSummary(s, { id }).items);
  assert.equal(available.find((x) => x.product_id === "prod-2").missing_quantity, 20);
  assert.equal(available.find((x) => x.product_id === "prod-2").missing_weight, 500000);
  assert.throws(() => f.run("SALE_DELIVER", { id }), /Hi-Performance: disponibles 40 sacos.*faltan 20 sacos/);
  assert.deepEqual(f.state(), s);
  f.run("PRODUCTION_CORRECT_QUANTITIES", {
    id: p.id,
    reason: "Completar Hi-Performance",
    products: [
      { product_id: "prod-1", nuclei_count: 2 },
      { product_id: "prod-2", nuclei_count: 2 },
      { product_id: "prod-3", nuclei_count: 1 },
    ],
    costs: f
      .state()
      .productionCosts.filter((x) => x.production_id === p.id && x.is_current)
      .map((x) => ({ id: x.id, amount: x.category === "NUCLEUS" ? 1250 : 220 })),
  });
  f.run("SALE_DELIVER", { id });
  assert.equal(stock(f.state(), "prod-1").quantity, 40);
  assert.equal(stock(f.state(), "prod-2").quantity, 20);
  assert.equal(stock(f.state(), "prod-3").quantity, 20);
  assert.equal(f.state().sales[0].fulfillment_status, "DELIVERED");
});
test("stock exige también peso y agrupa líneas del mismo producto", () => {
  const f = fixture();
  f.run("PRODUCTION_SAVE", {
    production_date: "2026-10-09",
    products: [{ product_id: "prod-1", nuclei_count: 1 }],
    confirm: true,
  });
  const id = f.run(
    "SALE_SAVE",
    sale(f.customer, {
      paid_amount: 0,
      items: [...items(20), ...items(21).map((row) => ({ ...row, unit_price: 72 }))],
    }),
  );
  assert.throws(() => f.run("SALE_DELIVER", { id }), /faltan 1 sacos/);
  const heavy = f.run(
    "SALE_SAVE",
    sale(f.customer, {
      paid_amount: 0,
      items: [{ product_id: "prod-1", quantity: 20, unit_price: 73, unit_weight_kg: 60 }],
    }),
  );
  assert.throws(() => f.run("SALE_DELIVER", { id: heavy }), /faltan 0 sacos \/ 200 kg/);
});
