"use client";
import type { AppState } from "@/lib/domain-types";
import type { Sale } from "@/lib/domain-types";
import { saleSummary } from "@/lib/domain.mjs";
import { Table } from "@/shared/ui";
import { Metrics } from "@/shared/ui";
import { money } from "@/shared/ui";
import { label } from "@/shared/ui";
import { find } from "@/shared/ui";
import type { BalanceSummary } from "@/lib/domain-types";
import type { OpenModal } from "@/lib/domain-types";
import type { ReactNode } from "react";
import type { Searchable } from "@/shared/types/admin";
export default function CollectionsView({
  s,
  b,
  tab,
  open,
  match,
  pending,
  filters,
  saleTable,
  tabs,
}: {
  s: AppState;
  b: BalanceSummary;
  tab: string;
  open: OpenModal;
  match: (record: Searchable) => boolean;
  pending: Sale[];
  filters: ReactNode;
  saleTable: (rows: Sale[]) => ReactNode;
  tabs: (options: [string, string][]) => ReactNode;
}) {
  return (
    <>
      {tabs([
        ["all", "Cuentas pendientes"],
        ["payments", "Historial de pagos"],
      ])}
      <Metrics
        items={[
          {
            label: "Por cobrar",
            value: money(pending.reduce((n: number, x) => n + saleSummary(s, x).balance, 0)),
          },
          { label: "Saldo a favor de clientes", value: money(b.customer_credit) },
          { label: "Clientes con saldo", value: new Set(pending.map((x) => x.customer_id)).size },
          { label: "Ventas pendientes", value: pending.length },
        ]}
      />
      {filters}
      <section className="panel flush">
        {tab === "payments" ? (
          <Table heads={["Pago", "Fecha", "Cliente", "Método", "Monto", "Estado"]}>
            {s.payments
              .filter(match)
              .slice()
              .reverse()
              .map((x) => (
                <tr key={x.id}>
                  <td>
                    <button className="row-link" onClick={() => open("payment-detail", x)}>
                      {x.code}
                    </button>
                  </td>
                  <td>{x.payment_date}</td>
                  <td>{find(s, "customers", x.customer_id)?.name}</td>
                  <td>
                    {label(x.payment_method)} {x.other_method}
                  </td>
                  <td>{money(x.total_amount)}</td>
                  <td>
                    {s.paymentReversals.some((r) => r.payment_id === x.id) ? "Revertido" : "Registrado"}
                  </td>
                </tr>
              ))}
          </Table>
        ) : (
          saleTable(pending)
        )}
      </section>
    </>
  );
}
