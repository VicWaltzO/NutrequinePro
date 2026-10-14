"use client";
import { useState } from "react";
import type { NumericInput } from "@/lib/domain-types";
import { Input, Select, Table, day } from "@/shared/ui";
import { Footer } from "@/shared/ui/FormFooter";
import type { FormProps } from "@/shared/types/forms";
export function FormulaForm({ s: state, record, submit, close, busy }: FormProps) {
  const [product, setProduct] = useState(record?.product_id ?? state.products[0]?.id ?? "");
  const f = state.formulas.find((x) => x.product_id === product && x.is_active);
  const [rows, setRows] = useState<{ ingredient_id: string; kg_per_nucleus: NumericInput }[]>(
    state.formulaIngredients
      .filter((x) => x.formula_id === f?.id)
      .map((x) => ({ ingredient_id: x.ingredient_id, kg_per_nucleus: x.kg_per_nucleus / 1000 })),
  );
  const [valid, setValid] = useState(day());
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        await submit("FORMULA_SAVE", { product_id: product, valid_from: valid, ingredients: rows });
      }}
    >
      <p className="notice">
        Se creará una nueva versión. Las producciones confirmadas conservan su fórmula histórica.
      </p>
      <div className="form-grid">
        <Select
          label="Producto"
          required
          empty={false}
          value={product}
          options={state.products}
          onChange={(id) => {
            setProduct(id);
            const nf = state.formulas.find((x) => x.product_id === id && x.is_active);
            setRows(
              state.formulaIngredients
                .filter((x) => x.formula_id === nf?.id)
                .map((x) => ({ ingredient_id: x.ingredient_id, kg_per_nucleus: x.kg_per_nucleus / 1000 })),
            );
          }}
        />
        <Input label="Válida desde" required type="date" value={valid} onChange={setValid} />
      </div>
      <Table heads={["Insumo", "Kg por núcleo", ""]}>
        {rows.map((x, i) => (
          <tr key={i}>
            <td>
              <select
                required
                value={x.ingredient_id}
                onChange={(e) =>
                  setRows((a) => a.map((r, j) => (i === j ? { ...r, ingredient_id: e.target.value } : r)))
                }
              >
                {state.ingredients.map((ing) => (
                  <option key={ing.id} value={ing.id}>
                    {ing.name}
                  </option>
                ))}
              </select>
            </td>
            <td>
              <input
                aria-label="Kg por núcleo"
                required
                type="number"
                min="0"
                step="0.001"
                value={x.kg_per_nucleus}
                onChange={(e) =>
                  setRows((a) => a.map((r, j) => (i === j ? { ...r, kg_per_nucleus: e.target.value } : r)))
                }
              />
            </td>
            <td>
              <button
                type="button"
                className="icon-button"
                aria-label="Quitar insumo"
                onClick={() => setRows((a) => a.filter((_, j) => i !== j))}
              >
                ×
              </button>
            </td>
          </tr>
        ))}
      </Table>
      <button
        type="button"
        className="text-button"
        onClick={() =>
          setRows((a) => [...a, { ingredient_id: state.ingredients[0]?.id ?? "", kg_per_nucleus: 0 }])
        }
      >
        ＋ Agregar insumo
      </button>
      <div className="total-line">
        Peso de fórmula por núcleo{" "}
        <strong>{rows.reduce((n, x) => n + Number(x.kg_per_nucleus), 0)} kg</strong>
      </div>
      <Footer busy={busy} close={close} label="Crear versión de fórmula" />
    </form>
  );
}
