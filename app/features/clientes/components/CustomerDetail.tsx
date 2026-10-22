import { useState, type ReactNode } from "react";
import DownloadPdfButton from "@/features/documentos/components/DownloadPdfButton.tsx";
import {
  recordId,
  type AppState,
  type EditorRecord,
  type OpenModal,
  type Sale,
  type Submit,
} from "@/lib/domain-types";
import { customerProfile } from "../domain/profile.mjs";
import { saleSummary, paymentSummary } from "@/lib/domain-preview.mjs";
import { money, Input, Select, Table, label, stamp } from "@/shared/ui";
import { Tabs } from "@/shared/ui/Tabs";
import { SubtabContent } from "@/shared/ui/SubtabContent";
import { CustomerSites } from "./CustomerSites";

const sections: [string, string][] = [
  ["all", "Resumen"],
  ["sales", "Ventas"],
  ["payments", "Cobros y aplicaciones"],
  ["sites", "Sedes"],
  ["activity", "Actividad"],
];

export function CustomerDetail({
  state,
  customer,
  write,
  open,
  saleTable,
  run,
  busy,
}: {
  state: AppState;
  customer: EditorRecord;
  write: boolean;
  open: OpenModal;
  saleTable: (rows: Sale[]) => ReactNode;
  run: Submit;
  busy: boolean;
}) {
  const id = recordId(customer);
  const [tab, setTab] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [status, setStatus] = useState("");
  const summary = customerProfile(state, id);
  const businessDate = (date: string) =>
    date.includes("T")
      ? new Intl.DateTimeFormat("en-CA", { timeZone: state.config.timezone }).format(new Date(date))
      : date;
  const inRange = (date: string) =>
    (!from || businessDate(date) >= from) && (!to || businessDate(date) <= to);
  const allSales = state.sales.filter((sale) => sale.customer_id === id);
  const periodSales = allSales
    .filter((sale) => inRange(sale.sale_date))
    .sort((a, b) => b.sale_date.localeCompare(a.sale_date));
  const sales = periodSales.filter((sale) => !status || sale.commercial_status === status);
  const payments = state.payments
    .filter((payment) => payment.customer_id === id && inRange(payment.payment_date))
    .sort((a, b) => b.payment_date.localeCompare(a.payment_date));
  const effectiveSales = sales.filter((sale) => !["DRAFT", "CANCELLED"].includes(sale.commercial_status));
  const filteredSold = effectiveSales.reduce((sum, sale) => sum + saleSummary(state, sale).total, 0);
  const periodSold = periodSales
    .filter((sale) => !["DRAFT", "CANCELLED"].includes(sale.commercial_status))
    .reduce((sum, sale) => sum + saleSummary(state, sale).total, 0);
  const periodReceived = payments.reduce(
    (sum, payment) => sum + (paymentSummary(state, payment).reversed ? 0 : payment.total_amount),
    0,
  );
  const saleIds = new Set(allSales.map((sale) => sale.id));
  const paymentIds = new Set(
    state.payments.filter((payment) => payment.customer_id === id).map((payment) => payment.id),
  );
  const activity = [
    ...allSales
      .filter((sale) => sale.cancelled_at)
      .map((sale) => ({
        id: `cancel:${sale.id}`,
        date: sale.cancelled_at ?? "",
        title: `Anulación ${sale.code}`,
        detail: sale.cancellation_reason ?? "",
        type: "sale-detail",
        target: sale.id,
      })),
    ...allSales.map((sale) => ({
      id: sale.id,
      date: sale.sale_date,
      title: `Venta ${sale.code} · ${label(sale.commercial_status)}`,
      detail: sale.notes ?? "",
      type: "sale-detail",
      target: sale.id,
    })),
    ...state.payments
      .filter((payment) => paymentIds.has(payment.id))
      .map((payment) => ({
        id: payment.id,
        date: payment.payment_date,
        title: `Cobro ${payment.code}`,
        detail: money(payment.total_amount),
        type: "payment-detail",
        target: payment.id,
      })),
    ...state.paymentReversals
      .filter((reversal) => paymentIds.has(reversal.payment_id))
      .map((reversal) => ({
        id: reversal.id,
        date: reversal.date,
        title: `Reversión ${reversal.code}`,
        detail: reversal.reason,
        type: "payment-detail",
        target: reversal.payment_id,
      })),
    ...state.returns
      .filter((row) => saleIds.has(row.sale_id))
      .map((row) => ({
        id: row.id,
        date: row.return_date,
        title: `Devolución ${row.code}`,
        detail: row.reason,
        type: "sale-detail",
        target: row.sale_id,
      })),
    ...state.corrections
      .filter((row) => row.entity_type === "SALE" && saleIds.has(row.entity_id))
      .map((row) => ({
        id: row.id,
        date: row.created_at ?? "",
        title: `Rectificación ${row.code}`,
        detail: row.reason,
        type: "sale-detail",
        target: row.entity_id,
      })),
  ]
    .filter((row) => row.date && inRange(row.date))
    .sort((a, b) => b.date.localeCompare(a.date));

  return (
    <div className="customer-profile">
      <header className="customer-section-heading">
        <div>
          <h2>{customer.name}</h2>
          <p className="muted">
            {customer.code} · {customer.is_active ? "Activo" : "Inactivo"}
          </p>
        </div>
        <div className="detail-actions">
          <DownloadPdfButton kind="customer" id={id} from={from} to={to}>
            Exportar historial PDF
          </DownloadPdfButton>
          {write && (
            <button type="button" onClick={() => open("customer", customer)}>
              Editar cliente
            </button>
          )}
        </div>
      </header>
      <dl className="customer-metrics">
        {[
          ["Total vendido histórico", money(summary.sold)],
          ["Cobrado aplicado", money(summary.applied)],
          ["Deuda actual", money(summary.debt)],
          ["Saldo a favor actual", money(summary.credit)],
          ["Ventas efectivas", summary.count],
        ].map(([caption, value]) => (
          <div key={caption}>
            <dt>{caption}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      <p className="muted">
        Saldo neto (deuda − a favor): <strong>{money(summary.net)}</strong>. El saldo a favor no se aplica
        automáticamente a las ventas.
      </p>
      <Tabs options={sections} view="customer-profile" tab={tab} navigate={false} onSelect={setTab} />
      {["all", "sales", "payments", "activity"].includes(tab) && (
        <div className="customer-history-filters">
          <Input label="Desde" type="date" value={from} max={to || undefined} onChange={setFrom} />
          <Input label="Hasta" type="date" value={to} min={from || undefined} onChange={setTo} />
          {tab === "sales" && (
            <Select
              label="Estado comercial"
              value={status}
              onChange={setStatus}
              empty="Todos los estados"
              options={["CONFIRMED", "RECTIFIED", "DRAFT", "CANCELLED"].map((id) => ({
                id,
                name: label(id),
              }))}
            />
          )}
        </div>
      )}
      <SubtabContent tab={tab} order={sections.map(([key]) => key)}>
        {tab === "all" && (
          <section className="customer-summary">
            <h3>Información del cliente</h3>
            <dl className="customer-contact">
              {[
                ["Identificación", customer.tax_id],
                ["Contacto", customer.contact_name],
                ["Teléfono", customer.phone],
                ["Dirección", customer.address],
                ["Notas", customer.notes],
              ]
                .filter(([, value]) => value)
                .map(([caption, value]) => (
                  <div key={caption}>
                    <dt>{caption}</dt>
                    <dd>{value}</dd>
                  </div>
                ))}
            </dl>
            {![customer.tax_id, customer.contact_name, customer.phone, customer.address, customer.notes].some(
              Boolean,
            ) && <p>Sin datos de contacto registrados.</p>}
            <h3>Actividad del periodo seleccionado</h3>
            <p>
              Ventas efectivas: <strong>{money(periodSold)}</strong> · Cobros recibidos vigentes:{" "}
              <strong>{money(periodReceived)}</strong>
            </p>
            <p className="muted">
              Los indicadores superiores son históricos y los saldos corresponden al estado actual. Los cobros
              del periodo se cuentan una sola vez, independientemente de sus aplicaciones.
            </p>
            {!periodSales.length && !payments.length && <p>No hay actividad en el periodo seleccionado.</p>}
          </section>
        )}
        {tab === "sales" && (
          <section aria-label="Ventas del cliente">
            <p>
              {effectiveSales.length} ventas efectivas · Total del periodo:{" "}
              <strong>{money(filteredSold)}</strong>
            </p>
            {sales.length ? saleTable(sales) : <p>No hay ventas con estos filtros.</p>}
          </section>
        )}
        {tab === "payments" && (
          <section aria-label="Cobros del cliente">
            <p>
              Cobros recibidos vigentes del periodo: <strong>{money(periodReceived)}</strong>
            </p>
            {payments.length ? (
              <Table heads={["Cobro / fecha", "Recibido", "Aplicado", "Disponible", "Estado / aplicaciones"]}>
                {payments.map((payment) => {
                  const info = paymentSummary(state, payment);
                  return (
                    <tr key={payment.id}>
                      <td>
                        <button className="row-link" onClick={() => open("payment-detail", payment)}>
                          {payment.code}
                        </button>
                        <small>{payment.payment_date}</small>
                      </td>
                      <td>
                        {money(info.reversed ? 0 : payment.total_amount)}
                        {info.reversed && <small>Original: {money(payment.total_amount)}</small>}
                      </td>
                      <td>{money(info.applied)}</td>
                      <td>{money(info.available)}</td>
                      <td>
                        {info.reversed ? "Revertido · aplicaciones sin efecto" : "Vigente"}
                        {state.paymentApplications
                          .filter((row) => row.payment_id === payment.id)
                          .map((row) => (
                            <small key={row.id}>
                              <button
                                className="row-link"
                                onClick={() => open("sale-detail", { id: row.sale_id })}
                              >
                                {state.sales.find((sale) => sale.id === row.sale_id)?.code}
                              </button>{" "}
                              · {money(row.applied_amount)}
                              {info.reversed ? " (revertida)" : ""}
                            </small>
                          ))}
                      </td>
                    </tr>
                  );
                })}
              </Table>
            ) : (
              <p>No hay cobros en el periodo seleccionado.</p>
            )}
          </section>
        )}
        <div hidden={tab !== "sites"}>
          <CustomerSites state={state} customerId={id} write={write} run={run} busy={busy} />
        </div>
        {tab === "activity" && (
          <section aria-label="Actividad del cliente">
            {activity.length ? (
              <ol className="customer-activity">
                {activity.map((row) => (
                  <li key={row.id}>
                    <time>{row.date.includes("T") ? stamp(row.date) : row.date}</time>
                    <div>
                      <button className="row-link" onClick={() => open(row.type, { id: row.target })}>
                        {row.title}
                      </button>
                      <p>{row.detail}</p>
                    </div>
                  </li>
                ))}
              </ol>
            ) : (
              <p>No hay actividad en el periodo seleccionado.</p>
            )}
          </section>
        )}
      </SubtabContent>
    </div>
  );
}
