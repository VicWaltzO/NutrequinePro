import type { Dispatch, SetStateAction } from "react";
import type { AppState, CostInput } from "@/lib/domain-types";
import { Input, Select, Check } from "@/shared/ui";
import { Plus } from "lucide-react";

export function CostRows({
  s: state,
  costs,
  setCosts,
}: {
  s: AppState;
  costs: CostInput[];
  setCosts: Dispatch<SetStateAction<CostInput[]>>;
}) {
  return (
    <>
      {costs.map((c, i: number) => {
        const update = (k: string, v: string | boolean) =>
          setCosts((a) => a.map((x, j) => (i === j ? { ...x, [k]: v } : x)));
        return (
          <div className="inset production-extra-cost form-state-enter" key={i}>
            <div className="form-grid">
              <Select
                label="Concepto"
                required
                value={c.category}
                onChange={(x) => update("category", x)}
                options={["FREIGHT", "HANDLING", "PERSONNEL", "SERVICE", "INGREDIENT_EXTRA", "OTHER"]}
              />
              <Input
                label="Descripción"
                required
                value={c.description}
                onChange={(x) => update("description", x)}
              />
              <Input
                label="Monto S/"
                type="number"
                step="0.01"
                min="0.01"
                required
                value={c.amount}
                onChange={(x) => update("amount", x)}
              />
              {c.category === "INGREDIENT_EXTRA" && (
                <Select
                  label="Insumo"
                  required
                  value={c.ingredient_id}
                  onChange={(x) => update("ingredient_id", x)}
                  options={state.ingredients}
                />
              )}
              <Check label="Pagado" value={c.is_paid} onChange={(x) => update("is_paid", x)} />
            </div>
            <button
              type="button"
              className="text-button danger"
              onClick={() => setCosts((a) => a.filter((_, j) => i !== j))}
            >
              Quitar costo
            </button>
          </div>
        );
      })}
      <button
        type="button"
        className="text-button"
        onClick={() =>
          setCosts((a) => [...a, { category: "FREIGHT", description: "", amount: "", is_paid: false }])
        }
      >
        <Plus size={16} aria-hidden="true" /> Agregar costo adicional
      </button>
    </>
  );
}
