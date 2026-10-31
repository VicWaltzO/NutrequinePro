import type { AppState, Production, OpenModal } from "@/lib/domain-types";
import { productionSummary } from "@/lib/domain-preview.mjs";
import { label, Badge, SortableTable, Empty, money, num } from "@/shared/ui";
import DownloadPdfButton from "@/features/documentos/components/DownloadPdfButton.tsx";

export default function ProductionList({
  context = "",
  s: state,
  write,
  open,
  productions,
}: {
  context?: string;
  s: AppState;
  write: boolean;
  open: OpenModal;
  productions: Production[];
}) {
  return productions.length ? (
    <SortableTable
      heads={["Producción", "Fecha", "Estado", "Sacos", "Costo consolidado", "Fuente"]}
      rows={productions}
      values={[
        (x) => x.code,
        (x) => x.production_date,
        (x) => label(x.status),
        (x) => productionSummary(state, x).bags,
        (x) =>
          productionSummary(state, x).reconciled
            ? productionSummary(state, x).real
            : productionSummary(state, x).estimated,
        (x) => (productionSummary(state, x).reconciled ? "REAL" : "ESTIMADO"),
      ]}
      tie={(x) => [x.production_date, x.code, x.id]}
      context={context}
    >
      {(x) => {
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
      }}
    </SortableTable>
  ) : (
    <Empty
      text="No hay producciones registradas."
      action={write && <button onClick={() => open("production")}>Crear lote a producir</button>}
    />
  );
}
