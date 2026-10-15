import type { AppState, Sale, OpenModal } from "@/lib/domain-types";
import { saleSummary } from "@/lib/domain-preview.mjs";
import { Badge, Table, Empty, money, find } from "@/shared/ui";

export default function SaleTable({
  s: state,
  write,
  open,
  rows,
}: {
  s: AppState;
  write: boolean;
  open: OpenModal;
  rows: Sale[];
}) {
  return rows.length ? (
    <Table heads={["Venta / fecha", "Cliente", "Sede", "Total", "Pagado", "Saldo", "Finanzas", "Entrega"]}>
      {rows.map((x) => {
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
      })}
    </Table>
  ) : (
    <Empty
      text="No hay ventas en esta vista."
      action={write && <button onClick={() => open("sale")}>Registrar venta</button>}
    />
  );
}
