import type { AppState, Sale, BalanceSummary, OpenModal } from "@/lib/domain-types";
import { SubtabContent } from "@/shared/ui/SubtabContent";
import { saleSummary } from "@/lib/domain-preview.mjs";
import { SortableTable, Metrics, money, label, find } from "@/shared/ui";
import type { ReactNode } from "react";
import type { Searchable } from "@/shared/types/admin";
export default function CollectionsView({
  s: state,
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
            value: money(pending.reduce((n: number, x) => n + saleSummary(state, x).balance, 0)),
          },
          { label: "Saldo a favor de clientes", value: money(b.customer_credit) },
          { label: "Clientes con saldo", value: new Set(pending.map((x) => x.customer_id)).size },
          { label: "Ventas pendientes", value: pending.length },
        ]}
      />
      {filters}
      <SubtabContent tab={tab} order={["all", "payments"]}>
        <section className="panel flush">
          {tab === "payments" ? (
            <SortableTable
              heads={["Pago", "Fecha", "Cliente", "Método", "Monto", "Estado"]}
              rows={state.payments.filter(match).slice().reverse()}
              values={[
                (x) => x.code,
                (x) => x.payment_date,
                (x) => find(state, "customers", x.customer_id)?.name,
                (x) => [label(x.payment_method), x.other_method],
                (x) => x.total_amount,
                (x) => state.paymentReversals.some((r) => r.payment_id === x.id),
              ]}
              tie={(x) => [x.payment_date, x.code, x.id]}
            >
              {(x) => (
                <tr key={x.id}>
                  <td>
                    <button className="row-link" onClick={() => open("payment-detail", x)}>
                      {x.code}
                    </button>
                  </td>
                  <td>{x.payment_date}</td>
                  <td>{find(state, "customers", x.customer_id)?.name}</td>
                  <td>
                    {label(x.payment_method)} {x.other_method}
                  </td>
                  <td>{money(x.total_amount)}</td>
                  <td>
                    {state.paymentReversals.some((r) => r.payment_id === x.id) ? "Revertido" : "Registrado"}
                  </td>
                </tr>
              )}
            </SortableTable>
          ) : (
            saleTable(pending)
          )}
        </section>
      </SubtabContent>
    </>
  );
}
