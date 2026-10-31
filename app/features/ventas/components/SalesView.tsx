import { instant } from "@/shared/lib/table-sort";
import type { AppState, Sale, OpenModal } from "@/lib/domain-types";
import { SubtabContent } from "@/shared/ui/SubtabContent";
import { SortableTable, money, stamp, find } from "@/shared/ui";
import type { ReactNode } from "react";
import type { Searchable } from "@/shared/types/admin";
export default function SalesView({
  s: state,
  tab,
  write,
  open,
  match,
  sales,
  filters,
  saleTable,
  tabs,
}: {
  s: AppState;
  tab: string;
  write: boolean;
  open: OpenModal;
  match: (record: Searchable) => boolean;
  sales: Sale[];
  filters: ReactNode;
  saleTable: (rows: Sale[]) => ReactNode;
  tabs: (options: [string, string][]) => ReactNode;
}) {
  return (
    <>
      {tabs([
        ["all", "Historial"],
        ["future", "Ventas futuras"],
        ["draft", "Borradores"],
        ["corrections", "Rectificaciones"],
        ["returns", "Devoluciones"],
        ["cancelled", "Anulaciones"],
      ])}
      {filters}
      <SubtabContent tab={tab} order={["all", "future", "draft", "corrections", "returns", "cancelled"]}>
        <section className="panel flush">
          {tab === "corrections" ? (
            <SortableTable
              heads={["Código", "Venta", "Motivo", "Usuario", "Fecha"]}
              rows={state.corrections
                .filter((x) => x.entity_type === "SALE" && match(x))
                .slice()
                .reverse()}
              values={[
                (x) => x.code,
                (x) => find(state, "sales", x.entity_id)?.code,
                (x) => x.reason,
                (x) => find(state, "users", x.created_by)?.name,
                (x) => instant(x.created_at),
              ]}
              tie={(x) => [instant(x.created_at), x.code, x.id]}
            >
              {(x) => (
                <tr key={x.id}>
                  <td>{x.code}</td>
                  <td>
                    <button className="row-link" onClick={() => open("sale-detail", { id: x.entity_id })}>
                      {find(state, "sales", x.entity_id)?.code}
                    </button>
                  </td>
                  <td>{x.reason}</td>
                  <td>{find(state, "users", x.created_by)?.name}</td>
                  <td>{stamp(x.created_at)}</td>
                </tr>
              )}
            </SortableTable>
          ) : tab === "returns" ? (
            <SortableTable
              heads={["Devolución", "Venta", "Fecha", "Motivo", "Reducción económica"]}
              rows={state.returns.filter(match).slice().reverse()}
              values={[
                (x) => x.code,
                (x) => find(state, "sales", x.sale_id)?.code,
                (x) => x.return_date,
                (x) => x.reason,
                (x) => x.economic_amount,
              ]}
              tie={(x) => [x.return_date, x.code, x.id]}
            >
              {(x) => (
                <tr key={x.id}>
                  <td>{x.code}</td>
                  <td>
                    <button className="row-link" onClick={() => open("sale-detail", { id: x.sale_id })}>
                      {find(state, "sales", x.sale_id)?.code}
                    </button>
                  </td>
                  <td>{x.return_date}</td>
                  <td>{x.reason}</td>
                  <td>{money(x.economic_amount)}</td>
                </tr>
              )}
            </SortableTable>
          ) : (
            saleTable(sales)
          )}
        </section>
        {tab === "all" && write && (
          <button className="text-button" onClick={() => open("sale", undefined, "draft")}>
            ＋ Guardar una venta en borrador
          </button>
        )}
      </SubtabContent>
    </>
  );
}
