import type { AppState, BalanceSummary } from "../../../shared/types/domain.ts";
import { balanceSummary } from "../../balance/domain/summary.mjs";
import { baseReport, monthRange, within } from "./common.ts";

export function balanceReport(state: AppState, month: string, generatedAt: string) {
  const range = monthRange(month);
  const [year, number] = month.split("-").map(Number);
  const previousDate = new Date(Date.UTC(year, number - 2, 1));
  const previousMonth = `${previousDate.getUTCFullYear()}-${String(previousDate.getUTCMonth() + 1).padStart(2, "0")}`;
  const previousRange = {
    from: previousMonth + "-01",
    to: new Date(Date.UTC(year, number - 1, 0)).toISOString().slice(0, 10),
  };
  const previousDates = [
    ...state.sales
      .filter((row) => !["DRAFT", "CANCELLED"].includes(row.commercial_status))
      .map((row) => row.sale_date),
    ...state.payments.map((row) => row.payment_date),
    ...state.paymentReversals.map((row) => row.date),
    ...state.productions.map((row) => row.production_date),
    ...state.expenses.filter((row) => row.status !== "CANCELLED").map((row) => row.date),
  ];
  const comparable = previousDates.some((value) =>
    within(value, previousRange.from, previousRange.to, state.config.timezone),
  );
  const summary: BalanceSummary = balanceSummary(state, range.from, range.to);
  const previous: BalanceSummary | null = comparable
    ? balanceSummary(state, previousRange.from, previousRange.to)
    : null;
  return {
    ...baseReport(state, "balance", "Balance mensual", month, range.to, generatedAt),
    month,
    ...range,
    summary,
    previous,
    previousMonth,
  };
}

export type BalanceReport = ReturnType<typeof balanceReport>;
