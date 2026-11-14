import { useState } from "react";
import { recordId } from "@/lib/domain-types";
import type { CostInput, NumericInput, ProductionCost } from "@/lib/domain-types";
import type { ReconcileIngredient, FormProps } from "@/shared/types/forms";
import { productionSummary } from "@/lib/domain-preview.mjs";
import { Input, Check, SortableTable, money, find } from "@/shared/ui";
import { Footer } from "@/shared/ui/FormFooter";
import { CostRows } from "./CostRows";
import { chargedMacro } from "../domain/mill-charge.mjs";
export function ReconcileForm({ s: state, record, submit, close, busy }: FormProps) {
  const id = recordId(record);
  const a = productionSummary(state, { id });
  const [rows, setRows] = useState<ReconcileIngredient[]>(
    a.ingredients.map((x) => ({
      ...x,
      actual_charge: (x.actual_charge ?? x.theoretical_net_cost) / 100,
      discount_amount: x.discount_amount / 100,
    })),
  );
  const [costs, setCosts] = useState<(Omit<ProductionCost, "amount"> & { amount: NumericInput })[]>(
    a.costs.map((x) => ({ ...x, amount: x.amount / 100 })),
  );
  const [newCosts, setNewCosts] = useState<CostInput[]>([]);
  const [reason, setReason] = useState("Conciliación con cobro real");
  let chargeError = "";
  for (const row of rows) {
    if (row.quantity_kg === undefined && row.price_per_kg === undefined) continue;
    try {
      const billed = chargedMacro(
        row.total_kg,
        row.historical_price_per_kg,
        row.quantity_kg,
        row.price_per_kg,
      );
      if (billed.actual_charge < Math.round(Number(row.discount_amount) * 100)) throw new Error();
    } catch {
      chargeError =
        "Revise cantidad, precio y descuento; use valores no negativos y hasta 3 decimales en kg y 2 en soles.";
    }
  }
  const updateBilled = (row: ReconcileIngredient, field: "quantity_kg" | "price_per_kg", value: string) => {
    const changed = { ...row, [field]: value };
    try {
      const billed = chargedMacro(
        row.total_kg,
        row.historical_price_per_kg,
        changed.quantity_kg ?? (row.charged_grams ?? row.total_kg) / 1000,
        changed.price_per_kg ?? (row.charged_price_cents_per_kg ?? row.historical_price_per_kg) / 100,
      );
      const actual = billed.actual_charge / 100 - Number(row.discount_amount);
      if (actual < 0) throw new Error("Descuento supera el cobro.");
      changed.actual_charge = actual.toFixed(2);
      changed.quantity_kg = billed.actual_grams / 1000;
      changed.price_per_kg = billed.actual_price_cents_per_kg / 100;
    } catch {
      /* Keep the invalid draft visible; validation below blocks submission. */
    }
    setRows((rows) => rows.map((r) => (r.id === row.id ? changed : r)));
  };
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        await submit("PRODUCTION_RECONCILE", { id, ingredients: rows, costs, new_costs: newCosts, reason });
      }}
    >
      <p className="notice">
        La conciliación conserva fórmula y precios históricos. Cada modificación se registra en auditoría.
      </p>
      <SortableTable
        heads={[
          "Insumo",
          "Teórico bruto",
          "Kg cobrados",
          "S/ por kg cobrado",
          "Descuento S/",
          "Cobro real S/",
          "Diferencia",
          "Pagado",
        ]}
        rows={rows}
        values={[
          (x) => find(state, "ingredients", x.ingredient_id)?.name,
          (x) => x.theoretical_gross_cost,
          null,
          null,
          null,
          null,
          (x) =>
            x.actual_charge === ""
              ? null
              : Math.round(Number(x.actual_charge) * 100) -
                x.theoretical_gross_cost +
                Math.round(Number(x.discount_amount) * 100),
          null,
        ]}
        tie={(x) => [find(state, "ingredients", x.ingredient_id)?.name, x.id]}
      >
        {(x) => (
          <tr key={x.id}>
            <td>{find(state, "ingredients", x.ingredient_id)?.name}</td>
            <td>{money(x.theoretical_gross_cost)}</td>
            <td>
              <input
                aria-label={`Kg cobrados ${find(state, "ingredients", x.ingredient_id)?.name}`}
                type="number"
                min="0"
                step="0.001"
                required
                value={x.quantity_kg ?? (x.charged_grams ?? x.total_kg) / 1000}
                onChange={(e) => updateBilled(x, "quantity_kg", e.target.value)}
              />
            </td>
            <td>
              <input
                aria-label={`Precio cobrado ${find(state, "ingredients", x.ingredient_id)?.name}`}
                type="number"
                min="0"
                step="0.01"
                required
                value={x.price_per_kg ?? (x.charged_price_cents_per_kg ?? x.historical_price_per_kg) / 100}
                onChange={(e) => updateBilled(x, "price_per_kg", e.target.value)}
              />
            </td>
            {(["discount_amount", "actual_charge"] as const).map((k) => (
              <td key={k}>
                <input
                  aria-label={k === "actual_charge" ? "Cobro real" : "Descuento"}
                  type="number"
                  min="0"
                  step="0.01"
                  value={x[k]}
                  placeholder="Pendiente"
                  onChange={(e) =>
                    setRows((a) =>
                      a.map((r) =>
                        r.id === x.id
                          ? {
                              ...r,
                              [k]: e.target.value,
                              quantity_kg: undefined,
                              price_per_kg: undefined,
                              charged_grams: undefined,
                              charged_price_cents_per_kg: undefined,
                            }
                          : r,
                      ),
                    )
                  }
                />
              </td>
            ))}
            <td>
              {x.actual_charge === ""
                ? "—"
                : money(
                    Math.round(Number(x.actual_charge) * 100) -
                      x.theoretical_gross_cost +
                      Math.round(Number(x.discount_amount) * 100),
                  )}
            </td>
            <td>
              <input
                aria-label="Pagado"
                type="checkbox"
                checked={x.is_paid}
                onChange={(e) =>
                  setRows((a) => a.map((r) => (r.id === x.id ? { ...r, is_paid: e.target.checked } : r)))
                }
              />
            </td>
          </tr>
        )}
      </SortableTable>
      <button
        type="button"
        onClick={() =>
          setRows((rows) =>
            rows.map((r) => ({
              ...r,
              actual_charge: (r.theoretical_gross_cost / 100 - Number(r.discount_amount)).toFixed(2),
              quantity_kg: r.total_kg / 1000,
              price_per_kg: r.historical_price_per_kg / 100,
              charged_grams: undefined,
              charged_price_cents_per_kg: undefined,
            })),
          )
        }
      >
        Restablecer al teórico neto
      </button>
      {chargeError && <p role="alert">{chargeError}</p>}
      <h3>Costos adicionales existentes</h3>
      {costs.map((x, i) => (
        <div className="form-grid inset" key={x.id}>
          <Input
            label={x.description + " S/"}
            type="number"
            step="0.01"
            min="0"
            required
            value={x.amount}
            onChange={(v) => setCosts((a) => a.map((r, j) => (i === j ? { ...r, amount: v } : r)))}
          />
          <Check
            label="Pagado"
            value={x.is_paid}
            onChange={(v) => setCosts((a) => a.map((r, j) => (i === j ? { ...r, is_paid: v } : r)))}
          />
        </div>
      ))}
      <CostRows s={state} costs={newCosts} setCosts={setNewCosts} />
      <Input label="Motivo" required value={reason} onChange={setReason} />
      <Footer busy={busy} close={close} disabled={!!chargeError} label="Guardar conciliación" />
    </form>
  );
}
