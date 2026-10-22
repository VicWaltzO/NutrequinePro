import { saleSummary } from "../../ventas/domain/summary.mjs";
import { paymentSummary } from "../../cobranza/domain/summary.mjs";
import { customerSummary } from "./summary.mjs";

/** All amounts come from the operational summaries; drafts never count as sales. */
export function customerProfile(state, customerId) {
  const sales = state.sales.filter((sale) => sale.customer_id === customerId);
  const payments = state.payments.filter((payment) => payment.customer_id === customerId);
  const effective = sales.filter((sale) => !["DRAFT", "CANCELLED"].includes(sale.commercial_status));
  return {
    ...customerSummary(state, customerId),
    sold: effective.reduce((sum, sale) => sum + saleSummary(state, sale).total, 0),
    applied: effective.reduce((sum, sale) => sum + saleSummary(state, sale).paid, 0),
    count: effective.length,
    received: payments.reduce(
      (sum, payment) => sum + (paymentSummary(state, payment).reversed ? 0 : payment.total_amount),
      0,
    ),
  };
}
