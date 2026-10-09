"use client";
import type { AppState } from "@/lib/domain-types";
import { stock } from "@/lib/domain.mjs";
import { Table } from "@/shared/ui";
import { kg } from "@/shared/ui";
import { num } from "@/shared/ui";
import { label } from "@/shared/ui";
import { find } from "@/shared/ui";
import type { OpenModal } from "@/lib/domain-types";
import type { ReactNode } from "react";
import type { Searchable } from "@/shared/types/admin";
export default function InventoryView({
  s,
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
              {s.products.map((p) => {
                const a = stock(s, p.id);
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
              {s.inventoryMovements
                .filter(match)
                .slice()
                .reverse()
                .map((x) => (
                  <tr key={x.id}>
                    <td>{x.date}</td>
                    <td>
                      {find(s, x.item_type === "PRODUCT" ? "products" : "ingredients", x.item_id)?.name}
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
                          {find(s, x.source_type === "SALE" ? "sales" : "productions", x.source_id)?.code}
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
