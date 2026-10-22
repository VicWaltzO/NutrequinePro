import { Table, kg, money } from "@/shared/ui";
import { ProductionPriceCell } from "./ProductionPriceCell";
import type { productionFormPreview } from "../hooks/production-form-preview";
import type { ProductionIngredientDraft } from "../hooks/production-ingredient-input";

type PreviewRow = ReturnType<typeof productionFormPreview>["ingredients"][number];
export function ProductionIngredients({
  rows,
  update,
}: {
  rows: PreviewRow[];
  update: (id: string, change: Partial<ProductionIngredientDraft>) => void;
}) {
  return (
    <Table heads={["Insumo", "Kg", "S/ por kg", "Teórico neto", "Descuento S/", "Cobro real S/", "Pagado"]}>
      {rows.map((row) => {
        const { ing, w, gross, net, a, price, discountEnabled, manual, discountError, chargeError } = row;
        return (
          <tr key={ing.id}>
            <td>{ing.name}</td>
            <td>{kg(w)}</td>
            <td>
              <ProductionPriceCell
                name={ing.name}
                price={price}
                masterPrice={ing.current_price_per_kg}
                apply={(value) => update(ing.id, { price_per_kg: value })}
              />
              {row.priceError && (
                <small className="production-cell-error" role="alert">
                  {row.priceError}
                </small>
              )}
            </td>
            <td>
              {money(net)}
              {discountEnabled && <small className="production-cell-hint">Bruto {money(gross)}</small>}
            </td>
            <td>
              <label className="production-cell-check">
                <input
                  aria-label={"Aplicar descuento a " + ing.name}
                  type="checkbox"
                  checked={discountEnabled}
                  onChange={(event) => update(ing.id, { discount_enabled: event.target.checked })}
                />
                <span>Aplicar descuento</span>
              </label>
              {discountEnabled && (
                <input
                  className="form-state-enter"
                  aria-label={"Descuento " + ing.name}
                  type="number"
                  min="0"
                  max={gross / 100}
                  step="0.01"
                  value={a.discount_amount ?? 0}
                  aria-invalid={!!discountError}
                  aria-describedby={discountError ? "discount-error-" + ing.id : undefined}
                  onChange={(event) => update(ing.id, { discount_amount: event.target.value })}
                />
              )}
              {discountError && (
                <small className="production-cell-error" id={"discount-error-" + ing.id} role="alert">
                  {discountError}
                </small>
              )}
            </td>
            <td>
              <input
                className="production-actual-charge"
                aria-label={"Cobro real " + ing.name}
                type="number"
                min="0"
                step="0.01"
                value={manual ? (a.actual_charge ?? "") : Number(a.actual_charge).toFixed(2)}
                aria-invalid={!!chargeError}
                aria-describedby={chargeError ? "charge-error-" + ing.id : undefined}
                onChange={(event) =>
                  update(ing.id, { actual_mode: "manual", actual_charge: event.target.value })
                }
              />
              {chargeError && (
                <small className="production-cell-error" id={"charge-error-" + ing.id} role="alert">
                  {chargeError}
                </small>
              )}
              <small className="production-cell-hint">
                {manual
                  ? a.actual_charge === null || a.actual_charge === ""
                    ? "Pendiente de registrar"
                    : "Valor ajustado"
                  : "Automático · teórico neto"}
              </small>
              {manual && (
                <button
                  type="button"
                  className="text-button production-reset-charge"
                  onClick={() => update(ing.id, { actual_mode: "auto" })}
                >
                  Restablecer al teórico neto
                </button>
              )}
            </td>
            <td>
              <label className="production-cell-check">
                <input
                  aria-label={"Pagado " + ing.name}
                  type="checkbox"
                  checked={!!a.is_paid}
                  onChange={(event) => update(ing.id, { is_paid: event.target.checked })}
                />
                <span className={a.is_paid ? "" : "production-pending"}>
                  {a.is_paid ? "Pagado" : "Pendiente"}
                </span>
              </label>
            </td>
          </tr>
        );
      })}
    </Table>
  );
}
