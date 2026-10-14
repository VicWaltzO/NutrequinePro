import { sum } from "../../../shared/domain/core.mjs";
import { saleSummary } from "../../ventas/domain/summary.mjs";
import { paymentSummary } from "../../cobranza/domain/summary.mjs";
export function customerSummary(state, customerId) {
  const debt = sum(
    state.sales.filter(
      (x) => x.customer_id === customerId && !["DRAFT", "CANCELLED"].includes(x.commercial_status),
    ),
    (x) => saleSummary(state, x).balance,
  );
  const credit = sum(
    state.payments.filter((x) => x.customer_id === customerId),
    (x) => paymentSummary(state, x).available,
  );
  return { debt, credit, net: debt - credit };
}
