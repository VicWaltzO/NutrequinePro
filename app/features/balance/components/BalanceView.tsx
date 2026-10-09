"use client";
import type { AppState } from "@/lib/domain-types";
import { balanceSummary } from "@/lib/domain.mjs";
import { Table } from "@/shared/ui";
import { Metrics } from "@/shared/ui";
import { money } from "@/shared/ui";
import type { BalanceSummary } from "@/lib/domain-types";
import type { ReactNode } from "react";
export default function BalanceView({
  s,
  b,
  filters,
  productionList,
}: {
  s: AppState;
  b: BalanceSummary;
  filters: ReactNode;
  productionList: ReactNode;
}) {
  return (
    <>
      {filters}
      <Metrics
        items={[
          { label: "Ventas registradas", value: money(b.sales) },
          { label: "Cobros reales", value: money(b.collections) },
          {
            label: "Saldo por cobrar total",
            value: money(b.receivable),
            note: "Saldo actual de todo el historial",
          },
          {
            label: "Saldo a favor de clientes",
            value: money(b.customer_credit),
            note: "Importes disponibles de todo el historial",
          },
          { label: "Resultado de caja", value: money(b.cash_result) },
        ]}
      />
      <div className="balance-grid">
        <section className="panel">
          <h2>Resultado comercial estimado</h2>
          <dl className="balance-lines">
            {[
              ["Ventas registradas", b.sales],
              ["Costo de producción", -b.costs],
              ["Gastos logísticos", -b.logistics],
              ["Otros gastos", -b.other],
              ["Resultado estimado", b.estimated_result],
            ].map(([l, v]) => (
              <div key={String(l)}>
                <dt>{l}</dt>
                <dd>{money(Number(v))}</dd>
              </div>
            ))}
          </dl>
          <p className="metadata">
            {b.estimated_productions} producciones usan costo estimado. El resultado considera el costo total
            de producción registrado en el periodo; no representa un margen por saco vendido.
          </p>
        </section>
        <section className="panel">
          <h2>Resultado de caja</h2>
          <dl className="balance-lines">
            {[
              ["Dinero cobrado", b.collections],
              ["Costos de producción pagados", -b.paidCosts],
              ["Gastos logísticos pagados", -b.logistics],
              ["Otros gastos pagados", -b.other],
              ["Resultado de caja", b.cash_result],
            ].map(([l, v]) => (
              <div key={String(l)}>
                <dt>{l}</dt>
                <dd>{money(Number(v))}</dd>
              </div>
            ))}
          </dl>
          <p className="metadata">
            Incluye pagos registrados y costos marcados como pagados. Las reversiones restan en la fecha de
            reversión.
          </p>
        </section>
      </div>
      <section className="panel">
        <h2>Fuente del costo de producción</h2>
        {productionList}
      </section>
      <section className="panel">
        <h2>Ventas y cobros por mes</h2>
        <Table heads={["Mes", "Ventas registradas", "Cobros netos"]}>
          {[
            ...new Set([
              ...s.sales.map((x) => x.sale_date.slice(0, 7)),
              ...s.payments.map((x) => x.payment_date.slice(0, 7)),
              ...s.paymentReversals.map((x) => x.date.slice(0, 7)),
            ]),
          ]
            .sort()
            .map((m) => {
              const z = balanceSummary(s, m + "-01", m + "-31");
              return (
                <tr key={m}>
                  <td>{m}</td>
                  <td>{money(z.sales)}</td>
                  <td>{money(z.collections)}</td>
                </tr>
              );
            })}
        </Table>
      </section>
    </>
  );
}
