import type { AppState } from "../../../shared/types/domain.ts";
import { requireValue, sum } from "../../../shared/domain/core.mjs";
import { saleSummary } from "../../ventas/domain/summary.mjs";
import { paymentSummary } from "../../cobranza/domain/summary.mjs";
import { customerSummary } from "../../clientes/domain/summary.mjs";
import { baseReport, reportRange, within } from "./common.ts";

export function customerReport(state: AppState, id: string, from: string, to: string, generatedAt: string) {
  const customer = state.customers.find((row) => row.id === id);
  requireValue(customer, "No se encontró el cliente solicitado.");
  const record = customer!;
  const range = reportRange(from, to);
  const inRange = (value: string | undefined) => within(value, range.from, range.to, state.config.timezone);
  const allSales = state.sales.filter((row) => row.customer_id === id);
  const saleIds = new Set(allSales.map((row) => row.id));
  const periodSales = allSales
    .filter((row) => inRange(row.sale_date))
    .sort((a, b) => a.sale_date.localeCompare(b.sale_date));
  const periodSaleIds = new Set(periodSales.map((row) => row.id));
  const allPayments = state.payments.filter((row) => row.customer_id === id);
  const paymentIds = new Set(allPayments.map((row) => row.id));
  const allApplications = state.paymentApplications.filter((row) => paymentIds.has(row.payment_id));
  const relevantPayments = allPayments.filter(
    (payment) =>
      inRange(payment.payment_date) ||
      allApplications.some(
        (application) =>
          application.payment_id === payment.id &&
          (periodSaleIds.has(application.sale_id) || inRange(application.created_at)),
      ) ||
      state.paymentReversals.some((reversal) => reversal.payment_id === payment.id && inRange(reversal.date)),
  );
  const relevantPaymentIds = new Set(relevantPayments.map((payment) => payment.id));
  const sales = periodSales.map((sale) => ({
    code: sale.code,
    date: sale.sale_date,
    site: state.sites.find((site) => site.id === sale.site_id)?.name ?? sale.site_id,
    status: sale.commercial_status,
    summary: saleSummary(state, sale),
  }));
  const payments = relevantPayments
    .sort((a, b) => a.payment_date.localeCompare(b.payment_date))
    .map((payment) => ({
      id: payment.id,
      code: payment.code,
      date: payment.payment_date,
      amount: payment.total_amount,
      method: payment.payment_method,
      inPeriod: inRange(payment.payment_date),
      ...paymentSummary(state, payment),
    }));
  const applications = allApplications
    .filter((row) => relevantPaymentIds.has(row.payment_id))
    .map((row) => ({
      id: row.id,
      payment: allPayments.find((payment) => payment.id === row.payment_id)!.code,
      sale: allSales.find((sale) => sale.id === row.sale_id)?.code ?? row.sale_id,
      date: row.created_at,
      amount: row.applied_amount,
      reversed: state.paymentReversals.some((reversal) => reversal.payment_id === row.payment_id),
    }));
  const returns = state.returns
    .filter((row) => saleIds.has(row.sale_id) && (inRange(row.return_date) || periodSaleIds.has(row.sale_id)))
    .map((row) => ({
      code: row.code,
      date: row.return_date,
      sale: allSales.find((sale) => sale.id === row.sale_id)!.code,
      amount: row.economic_amount,
      reason: row.reason,
      inPeriod: inRange(row.return_date),
    }));
  const corrections = state.corrections
    .filter(
      (row) =>
        row.entity_type === "SALE" &&
        saleIds.has(row.entity_id) &&
        (inRange(row.created_at) || periodSaleIds.has(row.entity_id)),
    )
    .map((row) => ({
      code: row.code,
      date: row.created_at,
      sale: allSales.find((sale) => sale.id === row.entity_id)!.code,
      reason: row.reason,
      inPeriod: inRange(row.created_at),
    }));
  const reversals = state.paymentReversals
    .filter(
      (row) =>
        paymentIds.has(row.payment_id) && (inRange(row.date) || relevantPaymentIds.has(row.payment_id)),
    )
    .map((row) => ({
      code: row.code,
      date: row.date,
      payment: allPayments.find((payment) => payment.id === row.payment_id)!.code,
      amount: row.amount,
      reason: row.reason,
      inPeriod: inRange(row.date),
    }));
  const effective = sales.filter((row) => !["DRAFT", "CANCELLED"].includes(row.status));
  return {
    ...baseReport(
      state,
      "customer",
      "Historial integral de cliente",
      record.code ?? record.id,
      to ||
        new Intl.DateTimeFormat("en-CA", { timeZone: state.config.timezone }).format(new Date(generatedAt)),
      generatedAt,
    ),
    ...range,
    customer: {
      name: record.name,
      taxId: record.tax_id,
      contact: record.contact_name,
      phone: record.phone,
      address: record.address,
      notes: record.notes,
      active: record.is_active,
    },
    sites: state.customerSites
      .filter((row) => row.customer_id === id && row.is_active)
      .map((row) => ({
        name: state.sites.find((site) => site.id === row.site_id)?.name ?? row.site_id,
        principal: row.is_default,
      })),
    sales,
    payments,
    applications,
    returns,
    corrections,
    reversals,
    totals: {
      sales: sum(effective, (row: (typeof effective)[number]) => row.summary.total),
      applied: sum(effective, (row: (typeof effective)[number]) => row.summary.paid),
      receipts: sum(
        payments.filter((row) => row.inPeriod && !row.reversed),
        (row: (typeof payments)[number]) => row.amount,
      ),
      count: effective.length,
    },
    current: customerSummary(state, id),
    empty: !sales.length && !payments.length && !returns.length && !corrections.length && !reversals.length,
  };
}

export type CustomerReport = ReturnType<typeof customerReport>;
