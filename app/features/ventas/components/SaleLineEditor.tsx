"use client";
import type { Dispatch, SetStateAction } from "react";
import type { AppState } from "@/lib/domain-types";
import type { SaleLine } from "@/shared/types/forms";
import { stock } from "../../inventario/domain/stock.mjs";
import { Table, money, kg, find } from "@/shared/ui";

export function SaleLineEditor({
  state,
  rows,
  setRows,
  update,
}: {
  state: AppState;
  rows: SaleLine[];
  setRows: Dispatch<SetStateAction<SaleLine[]>>;
  update: (index: number, field: keyof SaleLine, value: string) => void;
}) {
  return (
    <>
      <h3>Productos</h3>
      <div className="line-editor">
        <Table heads={["Producto", "Sacos", "Kg / saco", "Precio S/", "Subtotal", ""]}>
          {rows.map((r, i) => {
            const product = find(state, "products", r.product_id);
            return (
              <tr key={i}>
                <td>
                  <select
                    aria-label="Producto"
                    required
                    value={r.product_id}
                    onChange={(e) => update(i, "product_id", e.target.value)}
                  >
                    <option value="">Seleccionar producto</option>
                    {state.products
                      .filter((x) => x.is_active && x.is_sellable)
                      .map((x) => (
                        <option key={x.id} value={x.id}>
                          {x.name}
                        </option>
                      ))}
                  </select>
                  {product && (
                    <small>
                      Stock: {stock(state, product.id).quantity} sacos ·{" "}
                      {kg(stock(state, product.id).weight_kg)} kg
                    </small>
                  )}
                </td>
                {(
                  [
                    ["quantity", "Cantidad de sacos", "1", "1"],
                    ["unit_weight_kg", "Peso por saco", "0.001", "0.001"],
                    ["unit_price", "Precio por saco", "0", "0.01"],
                  ] as const
                ).map(([k, l, min, step]) => (
                  <td key={k}>
                    <input
                      aria-label={l}
                      type="number"
                      min={min}
                      step={step}
                      required
                      value={r[k]}
                      onChange={(e) => update(i, k, e.target.value)}
                    />
                    {k === "unit_price" &&
                      product &&
                      Number(r.unit_price) * 100 !== product.default_sale_price && (
                        <small className="price-change">Lista: {money(product.default_sale_price)}</small>
                      )}
                  </td>
                ))}
                <td>{money(Math.round(Number(r.quantity) * Number(r.unit_price) * 100))}</td>
                <td>
                  <button
                    type="button"
                    className="icon-button"
                    aria-label="Quitar producto"
                    disabled={rows.length === 1}
                    onClick={() => setRows((a) => a.filter((_, j) => j !== i))}
                  >
                    ×
                  </button>
                </td>
              </tr>
            );
          })}
        </Table>
      </div>
      <button
        type="button"
        className="text-button"
        onClick={() =>
          setRows((a) => [...a, { product_id: "", quantity: 1, unit_weight_kg: "", unit_price: "" }])
        }
      >
        ＋ Agregar producto
      </button>
    </>
  );
}
