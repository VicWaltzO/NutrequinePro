import { sum } from "../../../shared/domain/core.mjs";
import { saleSummary } from "../../ventas/domain/summary.mjs";
import { paymentSummary } from "../../cobranza/domain/summary.mjs";
export function customerSummary(s, customerId) {
  const debt = sum(
    s.sales.filter(
      (x) => x.customer_id === customerId && !["DRAFT", "CANCELLED"].includes(x.commercial_status),
    ),
    (x) => saleSummary(s, x).balance,
  );
  const credit = sum(
    s.payments.filter((x) => x.customer_id === customerId),
    (x) => paymentSummary(s, x).available,
  );
  return { debt, credit, net: debt - credit };
}
