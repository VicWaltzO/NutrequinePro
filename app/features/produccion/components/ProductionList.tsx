import type { AppState, Production, OpenModal } from "@/lib/domain-types";
import { productionSummary } from "@/lib/domain-preview.mjs";
import { Badge, Table, Empty, money, num } from "@/shared/ui";
import DownloadPdfButton from "@/features/documentos/components/DownloadPdfButton.tsx";

export default function ProductionList({
  s: state,
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
        const a = productionSummary(state, x);
        return (
          <tr key={x.id}>
            <td>
              <button className="row-link" onClick={() => open("production-detail", x)}>
                {x.code}
              </button>
              {x.status === "DRAFT" && (
                <DownloadPdfButton kind="production" id={x.id}>
                  Exportar lote PDF
                </DownloadPdfButton>
              )}
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
