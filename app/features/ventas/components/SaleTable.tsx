import type { AppState, Sale, OpenModal } from "@/lib/domain-types";
import { saleSummary } from "@/lib/domain-preview.mjs";
import { label, Badge, SortableTable, Empty, money, find } from "@/shared/ui";

export default function SaleTable({
  context = "",
  s: state,
  write,
  open,
  rows,
}: {
  context?: string;
  s: AppState;
  write: boolean;
  open: OpenModal;
  rows: Sale[];
}) {
  return rows.length ? (
    <SortableTable
      heads={["Venta / fecha", "Cliente", "Sede", "Total", "Pagado", "Saldo", "Finanzas", "Entrega"]}
      rows={rows}
      values={[
        (x) => [x.sale_date, x.code],
        (x) => find(state, "customers", x.customer_id)?.name,
        (x) => find(state, "sites", x.site_id)?.name,
        (x) => saleSummary(state, x).total,
        (x) => saleSummary(state, x).paid,
        (x) => saleSummary(state, x).balance,
        (x) =>
          label(
            ["DRAFT", "CANCELLED"].includes(x.commercial_status)
              ? x.commercial_status
              : saleSummary(state, x).financial_status,
          ),
        (x) => label(x.fulfillment_status),
      ]}
      tie={(x) => [x.sale_date, x.code, x.id]}
      context={context}
    >
      {(x) => {
        const a = saleSummary(state, x);
        let status = a.financial_status;
        if (x.commercial_status === "CANCELLED") status = "CANCELLED";
        else if (x.commercial_status === "DRAFT") status = "DRAFT";
        return (
          <tr key={x.id}>
            <td>
              <button className="row-link" onClick={() => open("sale-detail", x)}>
                {x.code}
              </button>
              <small>{x.sale_date}</small>
            </td>
            <td>{find(state, "customers", x.customer_id)?.name}</td>
            <td>{find(state, "sites", x.site_id)?.name}</td>
            <td>{money(a.total)}</td>
            <td>{money(a.paid)}</td>
            <td className="strong">{money(a.balance)}</td>
            <td>
              <Badge value={status} />
            </td>
            <td>
              <Badge value={x.fulfillment_status} />
            </td>
          </tr>
        );
      }}
    </SortableTable>
  ) : (
    <Empty
      text="No hay ventas en esta vista."
      action={write && <button onClick={() => open("sale")}>Registrar venta</button>}
    />
  );
}
