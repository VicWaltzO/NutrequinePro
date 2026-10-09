"use client";
import type { AppState } from "@/lib/domain-types";
import { productionSummary } from "@/lib/domain.mjs";
import { Badge } from "@/shared/ui";
import { Table } from "@/shared/ui";
import { Empty } from "@/shared/ui";
import { money } from "@/shared/ui";
import { num } from "@/shared/ui";
import type { Production } from "@/lib/domain-types";
import type { OpenModal } from "@/lib/domain-types";
export default function ProductionList({
  s,
  write,
  open,
  productions,
}: {
  s: AppState;
  write: boolean;
  open: OpenModal;
  productions: Production[];
}) {
  return productions.length ? (
    <Table heads={["Producción", "Fecha", "Estado", "Sacos", "Costo consolidado", "Fuente"]}>
      {productions.map((x) => {
        const a = productionSummary(s, x);
        return (
          <tr key={x.id}>
            <td>
              <button className="row-link" onClick={() => open("production-detail", x)}>
                {x.code}
              </button>
            </td>
            <td>{x.production_date}</td>
            <td>
              <Badge value={x.status} />
            </td>
            <td>{num(a.bags)}</td>
            <td>{money(a.reconciled ? a.real : a.estimated)}</td>
            <td>{a.reconciled ? "REAL" : "ESTIMADO"}</td>
          </tr>
        );
      })}
    </Table>
  ) : (
    <Empty
      text="No hay producciones registradas."
      action={write && <button onClick={() => open("production")}>Crear lote a producir</button>}
    />
  );
}
