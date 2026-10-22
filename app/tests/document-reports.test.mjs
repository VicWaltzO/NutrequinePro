import { test } from "node:test";
import assert from "node:assert/strict";
import {
  regressionFixture,
  cashCreditScenario,
  productionPayload,
  salePayload,
} from "./helpers/regression-scenarios.mjs";
import { productionReport, saleReport } from "../features/documentos/domain/operation-reports.ts";
import { customerReport } from "../features/documentos/domain/customer-report.ts";
import { balanceReport } from "../features/documentos/domain/balance-report.ts";
import { monthRange, canExportDocuments } from "../features/documentos/domain/common.ts";
import { balanceSummary } from "../features/balance/domain/summary.mjs";
import { documentModel, renderReport } from "../server/reports.mts";
import { documentScenario } from "./helpers/document-scenario.mjs";
import { saleSummary } from "../features/ventas/domain/summary.mjs";

const generated = "2026-10-22T17:00:00Z";
test("PDF de venta conserva estados futuros, borradores, rectificados y anulados", async (t) => {
  const session = await regressionFixture(t);
  const ids = await documentScenario(session);
  const future = await session.run("SALE_SAVE", salePayload(ids.customer, { sale_date: "2099-12-01" }));
  const state = await session.state();
  for (const sale of state.sales.filter((row) => row.customer_id === ids.customer)) {
    const model = saleReport(state, sale.id, generated);
    const expected = saleSummary(state, sale);
    assert.equal(model.total, expected.total);
    assert.equal(model.applied, expected.paid);
    assert.equal(model.balance, expected.balance);
    assert.equal(model.status, sale.commercial_status);
    assert.ok((await renderReport(model)).length > 10000);
  }
  assert.equal(saleReport(state, future, generated).date, "2099-12-01");
  assert.equal(saleReport(state, ids.cancelled, generated).total, 0);
  assert.equal(saleReport(state, ids.secondSale, generated).hasCorrections, true);
  assert.deepEqual(await session.state(), state);
});
test("documentos: lectura pura, importes del dominio, crédito único y reversión", async (t) => {
  const session = await regressionFixture(t);
  const ids = await cashCreditScenario({
    ...session,
    run: (type, payload, requestId) =>
      session.run(
        type,
        type === "SALE_SAVE" ? { payment_date: "2026-10-14", ...payload } : payload,
        requestId,
      ),
  });
  const planned = await session.run(
    "PRODUCTION_SAVE",
    productionPayload({ confirm: false, notes: "Planificación sintética · maíz y nutrición" }),
  );
  const before = await session.state();
  const model = productionReport(before, planned, generated);
  assert.equal(model.status, "DRAFT");
  assert.ok(model.ingredients.length);
  assert.equal(
    model.bags,
    before.productionProducts.find((row) => row.production_id === planned).bags_produced,
  );
  assert.ok(!JSON.stringify(model).includes("theoretical_net_cost"));
  const sale = saleReport(before, ids.firstSale, generated);
  assert.equal(sale.total, 29204);
  assert.equal(sale.applied, 29204);
  for (const word of ["formula_snapshot", "ingredient", "historical_price", "production_cost"])
    assert.ok(!JSON.stringify(sale).includes(word));
  const customer = customerReport(before, ids.customer, "2026-10-01", "2026-10-31", generated);
  assert.equal(customer.payments.length, 1);
  assert.equal(customer.applications.length, 2);
  assert.equal(customer.totals.receipts, 30005);
  assert.equal(customer.current.debt, 200);
  assert.deepEqual(
    balanceReport(before, "2026-10", generated).summary,
    balanceSummary(before, "2026-10-01", "2026-10-31"),
  );
  for (const report of [model, sale, customer, balanceReport(before, "2026-10", generated)]) {
    const buffer = await renderReport(report);
    assert.equal(buffer.subarray(0, 5).toString(), "%PDF-");
    assert.ok(buffer.length > 10000);
    const pages = buffer.toString("latin1").match(/\/Type \/Page\b/g)?.length ?? 0;
    assert.ok(pages >= 1);
    if (report.kind !== "customer") assert.equal(pages, 1, "El pie no debe crear páginas vacías");
  }
  assert.deepEqual(
    await session.state(),
    before,
    "Ni auditoría, stock, revisión ni registros cambian al exportar",
  );
  await session.run("PAYMENT_REVERSE", {
    id: ids.payment,
    date: "2026-10-22",
    reason: "Reversión sintética",
  });
  const reversed = customerReport(await session.state(), ids.customer, "2026-10-01", "2026-10-31", generated);
  assert.equal(reversed.totals.receipts, 0);
  assert.equal(reversed.totals.applied, 0);
  assert.equal(reversed.payments[0].available, 0);
  assert.ok(reversed.applications.every((row) => row.reversed));
  assert.equal(reversed.reversals.length, 1);
});

test("documentos: periodos, vacíos, fechas inválidas y registros inexistentes", async (t) => {
  const session = await regressionFixture(t);
  assert.deepEqual(monthRange("2024-02"), { from: "2024-02-01", to: "2024-02-29" });
  assert.deepEqual(monthRange("2026-02"), { from: "2026-02-01", to: "2026-02-28" });
  for (const invalid of ["2026-00", "2026-13", "../private", "2026-1", ""])
    assert.throws(() => monthRange(invalid));
  let state = await session.state();
  assert.equal(customerReport(state, session.customer, "", "", generated).empty, true);
  assert.throws(() => customerReport(state, session.customer, "2026-10-31", "2026-10-01", generated));
  assert.throws(() => documentModel(state, "sale", "missing", {}, generated), /No se encontró/);
  assert.throws(() => documentModel(state, "constructor", "missing", {}, generated), /No se encontró/);
  assert.throws(() => documentModel(state, "balance", "2026-10", { total: "1" }, generated), /Filtros/);
  assert.throws(() => documentModel(state, "customer", session.customer, { from: [] }, generated), /Filtros/);
  const outside = await session.run("SALE_SAVE", salePayload(session.customer, { sale_date: "2026-09-30" }));
  await session.run("PAYMENT_CREATE", {
    customer_id: session.customer,
    payment_date: "2026-10-01",
    payment_method: "CASH",
    total_amount: "10",
    applications: [{ sale_id: outside, applied_amount: "10" }],
  });
  state = await session.state();
  const period = customerReport(state, session.customer, "2026-10-01", "2026-10-31", generated);
  assert.equal(period.sales.length, 0);
  assert.equal(period.payments.length, 1);
  assert.equal(period.totals.sales, 0);
  assert.equal(period.totals.receipts, 1000);
  assert.equal(balanceReport(state, "2026-10", generated).previous.sales, 29204);
  assert.equal(balanceReport(state, "2026-01", generated).previous, null);
  for (const role of ["ADMIN", "OPERATOR", "VIEWER"])
    assert.equal(canExportDocuments({ role, is_active: true }), true);
  assert.equal(canExportDocuments({ role: "ADMIN", is_active: false }), false);
  assert.equal(canExportDocuments(null), false);
});
