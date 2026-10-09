"use client";
import { useState } from "react";
import { recordId } from "@/lib/domain-types";
import type { CostInput } from "@/lib/domain-types";
import type { NumericInput } from "@/lib/domain-types";
import type { ProductionCost } from "@/lib/domain-types";
import type { ReconcileIngredient } from "@/shared/types/forms";
import { productionSummary } from "@/lib/domain.mjs";
import { Input } from "@/shared/ui";
import { Check } from "@/shared/ui";
import { Table } from "@/shared/ui";
import { money } from "@/shared/ui";
import { find } from "@/shared/ui";
import { Footer } from "@/shared/ui/FormFooter";
import type { FormProps } from "@/shared/types/forms";
import { CostRows } from "./CostRows";
export function ReconcileForm({ s, record, submit, close, busy }: FormProps) {
  const id = recordId(record);
  const a = productionSummary(s, { id });
  const [rows, setRows] = useState<ReconcileIngredient[]>(
      a.ingredients.map((x) => ({
        ...x,
        actual_charge: x.actual_charge === null ? "" : x.actual_charge / 100,
        discount_amount: x.discount_amount / 100,
      })),
    ),
    [costs, setCosts] = useState<(Omit<ProductionCost, "amount"> & { amount: NumericInput })[]>(
      a.costs.map((x) => ({ ...x, amount: x.amount / 100 })),
    ),
    [newCosts, setNewCosts] = useState<CostInput[]>([]),
    [reason, setReason] = useState("Conciliación con cobro real");
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
      <Table heads={["Insumo", "Teórico bruto", "Descuento S/", "Cobro real S/", "Diferencia", "Pagado"]}>
        {rows.map((x, i) => (
          <tr key={x.id}>
            <td>{find(s, "ingredients", x.ingredient_id)?.name}</td>
            <td>{money(x.theoretical_gross_cost)}</td>
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
                    setRows((a) => a.map((r, j) => (i === j ? { ...r, [k]: e.target.value } : r)))
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
                  setRows((a) => a.map((r, j) => (i === j ? { ...r, is_paid: e.target.checked } : r)))
                }
              />
            </td>
          </tr>
        ))}
      </Table>
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
      <CostRows s={s} costs={newCosts} setCosts={setNewCosts} />
      <Input label="Motivo" required value={reason} onChange={setReason} />
      <Footer busy={busy} close={close} label="Guardar conciliación" />
    </form>
  );
}
