import type { AppState, OpenModal } from "@/lib/domain-types";
import { SubtabContent } from "@/shared/ui/SubtabContent";
import { stock } from "@/lib/domain-preview.mjs";
import { Table, kg, num, label, find } from "@/shared/ui";
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
              <Table heads={["Producto", "Cantidad física", "Kg físicos", "Cantidad comprometida"]}>
                {state.products.map((p) => {
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
                })}
              </Table>
            </section>
          </>
        ) : (
          <>
            <section className="panel flush">
              <Table heads={["Fecha", "Ítem", "Movimiento", "Cantidad", "Kg", "Origen", "Notas"]}>
                {state.inventoryMovements
                  .filter(match)
                  .slice()
                  .reverse()
                  .map((x) => (
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
                            {
                              find(state, x.source_type === "SALE" ? "sales" : "productions", x.source_id)
                                ?.code
                            }
                          </button>
                        ) : (
                          x.source_type
                        )}
                      </td>
                      <td>{x.notes}</td>
                    </tr>
                  ))}
              </Table>
            </section>
          </>
        )}
      </SubtabContent>
    </>
  );
}
