"use client";
import type { AppState } from "@/lib/domain-types";
import type { Sale } from "@/lib/domain-types";
import { saleSummary } from "@/lib/domain.mjs";
import { Badge } from "@/shared/ui";
import { Table } from "@/shared/ui";
import { Empty } from "@/shared/ui";
import { money } from "@/shared/ui";
import { find } from "@/shared/ui";
import type { OpenModal } from "@/lib/domain-types";
export default function SaleTable({
  s,
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
        const a = saleSummary(s, x);
        return (
          <tr key={x.id}>
            <td>
              <button className="row-link" onClick={() => open("sale-detail", x)}>
                {x.code}
              </button>
              <small>{x.sale_date}</small>
            </td>
            <td>{find(s, "customers", x.customer_id)?.name}</td>
            <td>{find(s, "sites", x.site_id)?.name}</td>
            <td>{money(a.total)}</td>
            <td>{money(a.paid)}</td>
            <td className="strong">{money(a.balance)}</td>
            <td>
              <Badge
                value={
                  x.commercial_status === "CANCELLED"
                    ? "CANCELLED"
                    : x.commercial_status === "DRAFT"
                      ? "DRAFT"
                      : a.financial_status
                }
              />
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
