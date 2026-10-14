"use client";
import type { AppState, OpenModal } from "@/lib/domain-types";
import { stock } from "@/lib/domain.mjs";
import { Table, kg, num, label, find } from "@/shared/ui";
import type { ReactNode } from "react";
import type { Searchable } from "@/shared/types/admin";
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
      {tab === "all" ? (
        <>
          {productCards}
          <section className="panel">
            <Table heads={["Producto", "Sacos físicos", "Kg físicos", "Sacos comprometidos"]}>
              {state.products.map((p) => {
                const a = stock(state, p.id);
                return (
                  <tr key={p.id}>
                    <td>{p.name}</td>
                    <td>{num(a.quantity)}</td>
                    <td>{kg(a.weight_kg)}</td>
                    <td>{num(a.committed)}</td>
                  </tr>
                );
              })}
            </Table>
          </section>
        </>
      ) : (
        <>
          {filters}
          <section className="panel flush">
            <Table heads={["Fecha", "Ítem", "Movimiento", "Sacos", "Kg", "Origen", "Notas"]}>
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
                      {x.quantity}
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
                ))}
            </Table>
          </section>
        </>
      )}
    </>
  );
}
