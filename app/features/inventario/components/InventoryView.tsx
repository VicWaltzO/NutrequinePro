import type { AppState, OpenModal } from "@/lib/domain-types";
import { SubtabContent } from "@/shared/ui/SubtabContent";
import { stock } from "@/lib/domain-preview.mjs";
import { SortableTable, kg, num, label, find } from "@/shared/ui";
import type { ReactNode } from "react";
import type { Searchable } from "@/shared/types/admin";
import { unitLabels } from "@/shared/domain/presentation.mjs";
export default function InventoryView({
  s: state,
  tab,
  open,
  match,
  filters,
  productCards,
  tabs,
}: {
  s: AppState;
  tab: string;
  open: OpenModal;
  match: (record: Searchable) => boolean;
  filters: ReactNode;
  productCards: ReactNode;
  tabs: (options: [string, string][]) => ReactNode;
}) {
  return (
    <>
      {tabs([
        ["all", "Stock actual"],
        ["movements", "Movimientos"],
      ])}
      <div hidden={tab === "all"}>{filters}</div>
      <SubtabContent tab={tab} order={["all", "movements"]}>
        {tab === "all" ? (
          <>
            {productCards}
            <section className="panel">
              <SortableTable
                heads={["Producto", "Cantidad física", "Kg físicos", "Cantidad comprometida"]}
                rows={state.products}
                values={[
                  (p) => p.name,
                  (p) => [stock(state, p.id).quantity, unitLabels(p).singular],
                  (p) => stock(state, p.id).weight_kg,
                  (p) => [stock(state, p.id).committed, unitLabels(p).singular],
                ]}
                tie={(p) => [p.name, p.id]}
              >
                {(p) => {
                  const a = stock(state, p.id);
                  return (
                    <tr key={p.id}>
                      <td>{p.name}</td>
                      <td>
                        {num(a.quantity)} {unitLabels(p).plural}
                      </td>
                      <td>{kg(a.weight_kg)}</td>
                      <td>
                        {num(a.committed)} {unitLabels(p).plural}
                      </td>
                    </tr>
                  );
                }}
              </SortableTable>
            </section>
          </>
        ) : (
          <>
            <section className="panel flush">
              <SortableTable
                heads={["Fecha", "Ítem", "Movimiento", "Cantidad", "Kg", "Origen", "Notas"]}
                rows={state.inventoryMovements.filter(match).slice().reverse()}
                values={[
                  (x) => x.date,
                  (x) => find(state, x.item_type === "PRODUCT" ? "products" : "ingredients", x.item_id)?.name,
                  (x) => label(x.movement_type),
                  (x) => [x.quantity, x.item_type === "PRODUCT" ? unitLabels(x).singular : "insumo"],
                  (x) => x.weight_kg,
                  (x) => [
                    find(state, x.source_type === "SALE" ? "sales" : "productions", x.source_id)?.code ??
                      x.source_type,
                    x.source_type,
                  ],
                  (x) => x.notes,
                ]}
                tie={(x) => [
                  x.date,
                  find(state, x.item_type === "PRODUCT" ? "products" : "ingredients", x.item_id)?.name,
                  x.id,
                ]}
              >
                {(x) => (
                  <tr key={x.id}>
                    <td>{x.date}</td>
                    <td>
                      {find(state, x.item_type === "PRODUCT" ? "products" : "ingredients", x.item_id)?.name}
                    </td>
                    <td>{label(x.movement_type)}</td>
                    <td>
                      {x.quantity > 0 ? "+" : ""}
                      {x.quantity} {x.item_type === "PRODUCT" ? unitLabels(x).plural : ""}
                    </td>
                    <td>{kg(x.weight_kg)}</td>
                    <td>
                      {["SALE", "PRODUCTION"].includes(x.source_type) ? (
                        <button
                          className="row-link"
                          onClick={() =>
                            open(x.source_type === "SALE" ? "sale-detail" : "production-detail", {
                              id: x.source_id,
                            })
                          }
                        >
                          {find(state, x.source_type === "SALE" ? "sales" : "productions", x.source_id)?.code}
                        </button>
                      ) : (
                        x.source_type
                      )}
                    </td>
                    <td>{x.notes}</td>
                  </tr>
                )}
              </SortableTable>
            </section>
          </>
        )}
      </SubtabContent>
    </>
  );
}
