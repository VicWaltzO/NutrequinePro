import { sum } from "../../../shared/domain/core.mjs";
import { saleSummary } from "../../ventas/domain/summary.mjs";
import { paymentSummary } from "../../cobranza/domain/summary.mjs";
import { productionSummary } from "../../produccion/domain/summary.mjs";
export function balanceSummary(state, from = "", to = "9999") {
  const within = (d) => d >= from && d <= to;
  const sales = state.sales.filter(
    (x) => x.commercial_status !== "CANCELLED" && x.commercial_status !== "DRAFT" && within(x.sale_date),
  );
  const collections =
    sum(
      state.payments.filter((x) => within(x.payment_date)),
      (x) => x.total_amount,
    ) -
    sum(
      state.paymentReversals.filter((x) => within(x.date)),
      (x) => x.amount,
    );
  const productions = state.productions.filter(
    (x) => ["CONFIRMED", "CLOSED"].includes(x.status) && within(x.production_date),
  );
  const costs = sum(productions, (x) => {
    const a = productionSummary(state, x);
    return a.reconciled ? a.real : a.estimated;
  });
  const paidCosts = sum(
    state.productions.filter((x) => within(x.production_date)),
    (x) =>
      sum(
        productionSummary(state, x).costs.filter((c) => c.is_paid),
        (c) => c.amount,
      ) +
      sum(
        productionSummary(state, x).ingredients.filter((c) => c.is_paid),
        (c) => c.actual_charge ?? c.theoretical_net_cost,
      ),
  );
  const expenses = state.expenses.filter(
    (x) => x.status !== "CANCELLED" && within(x.date) && !x.production_cost_id,
  );
  const logistics = sum(
    expenses.filter((x) => x.category === "LOGISTICS"),
    (x) => x.amount,
  );
  const other = sum(
    expenses.filter((x) => x.category !== "LOGISTICS"),
    (x) => x.amount,
  );
  return {
    sales: sum(sales, (x) => saleSummary(state, x).total),
    collections,
    customer_credit: sum(state.payments, (x) => paymentSummary(state, x).available),
    receivable: sum(
      state.sales.filter((x) => x.commercial_status !== "CANCELLED" && x.commercial_status !== "DRAFT"),
      (x) => saleSummary(state, x).balance,
    ),
    costs,
    paidCosts,
    logistics,
    other,
    estimated_result: sum(sales, (x) => saleSummary(state, x).total) - costs - logistics - other,
    cash_result: collections - paidCosts - logistics - other,
    estimated_productions: productions.filter((x) => !productionSummary(state, x).reconciled).length,
  };
}
