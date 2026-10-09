import { sum } from "../../../shared/domain/core.mjs";
import { saleSummary } from "../../ventas/domain/summary.mjs";
import { paymentSummary } from "../../cobranza/domain/summary.mjs";
import { productionSummary } from "../../produccion/domain/summary.mjs";
export function balanceSummary(s, from = "", to = "9999") {
  const within = (d) => d >= from && d <= to;
  const sales = s.sales.filter(
    (x) => x.commercial_status !== "CANCELLED" && x.commercial_status !== "DRAFT" && within(x.sale_date),
  );
  const collections =
    sum(
      s.payments.filter((x) => within(x.payment_date)),
      (x) => x.total_amount,
    ) -
    sum(
      s.paymentReversals.filter((x) => within(x.date)),
      (x) => x.amount,
    );
  const ps = s.productions.filter(
    (x) => ["CONFIRMED", "CLOSED"].includes(x.status) && within(x.production_date),
  );
  const costs = sum(ps, (x) => {
    const a = productionSummary(s, x);
    return a.reconciled ? a.real : a.estimated;
  });
  const paidCosts = sum(
    s.productions.filter((x) => within(x.production_date)),
    (x) =>
      sum(
        productionSummary(s, x).costs.filter((c) => c.is_paid),
        (c) => c.amount,
      ) +
      sum(
        productionSummary(s, x).ingredients.filter((c) => c.is_paid),
        (c) => c.actual_charge ?? c.theoretical_net_cost,
      ),
  );
  const expenses = s.expenses.filter(
    (x) => x.status !== "CANCELLED" && within(x.date) && !x.production_cost_id,
  );
  const logistics = sum(
      expenses.filter((x) => x.category === "LOGISTICS"),
      (x) => x.amount,
    ),
    other = sum(
      expenses.filter((x) => x.category !== "LOGISTICS"),
      (x) => x.amount,
    );
  return {
    sales: sum(sales, (x) => saleSummary(s, x).total),
    collections,
    customer_credit: sum(s.payments, (x) => paymentSummary(s, x).available),
    receivable: sum(
      s.sales.filter((x) => x.commercial_status !== "CANCELLED" && x.commercial_status !== "DRAFT"),
      (x) => saleSummary(s, x).balance,
    ),
    costs,
    paidCosts,
    logistics,
    other,
    estimated_result: sum(sales, (x) => saleSummary(s, x).total) - costs - logistics - other,
    cash_result: collections - paidCosts - logistics - other,
    estimated_productions: ps.filter((x) => !productionSummary(s, x).reconciled).length,
  };
}
