"use client";
import { useProductionFormState } from "../hooks/useProductionFormState";
import { Input } from "@/shared/ui";
import { Select } from "@/shared/ui";
import { Check } from "@/shared/ui";
import { Table } from "@/shared/ui";
import { money } from "@/shared/ui";
import { kg } from "@/shared/ui";
import { Footer } from "@/shared/ui/FormFooter";
import type { FormProps } from "@/shared/types/forms";
import { CostRows } from "./CostRows";
export function ProductionForm({ s, record, submit, close, busy }: FormProps) {
  const {
    v,
    set,
    counts,
    setCounts,
    adjust,
    costs,
    setCosts,
    bags,
    weight,
    nuclei,
    ingredients,
    estimated,
    real,
    adj,
  } = useProductionFormState({ s, record });
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        await submit("PRODUCTION_SAVE", {
          ...v,
          id: record?.id,
          products: Object.entries(counts)
            .filter(([, n]) => Number(n) > 0)
            .map(([product_id, nuclei_count]) => ({ product_id, nuclei_count })),
          ingredients: Object.values(adjust),
          costs,
        });
      }}
    >
      <div className="form-grid">
        <Input
          label="Fecha de producción"
          type="date"
          required
          value={v.production_date}
          onChange={(x) => set("production_date", x)}
        />
        <Input label="Notas" value={v.notes} onChange={(x) => set("notes", x)} />
      </div>
      <h3>Núcleos por producto</h3>
      <div className="form-grid">
        {s.products
          .filter((x) => x.is_active)
          .map((x) => (
            <Input
              key={x.id}
              label={`${x.name} · ${x.bags_per_nucleus} sacos / núcleo`}
              type="number"
              min="0"
              step="1"
              value={counts[x.id]}
              onChange={(n) => setCounts((a) => ({ ...a, [x.id]: n }))}
            />
          ))}
      </div>
      <div className="summary-strip">
        <strong>{nuclei} núcleos</strong>
        <span>{bags} sacos</span>
        <span>{kg(weight)} kg comerciales</span>
        <span>{kg(ingredients.reduce((a, x) => a + x.w, 0))} kg de fórmula</span>
      </div>
      <h3>Insumos consolidados</h3>
      <Table heads={["Insumo", "Kg", "S/ por kg", "Teórico", "Descuento S/", "Cobro real S/", "Pagado"]}>
        {ingredients.map(({ ing, w, gross, a }) => (
          <tr key={ing.id}>
            <td>{ing.name}</td>
            <td>{kg(w)}</td>
            <td>{money(ing.current_price_per_kg)}</td>
            <td>{money(gross)}</td>
            <td>
              <input
                aria-label={`Descuento ${ing.name}`}
                type="number"
                min="0"
                step="0.01"
                value={a.discount_amount ?? ""}
                onChange={(e) => adj(ing.id, "discount_amount", e.target.value)}
              />
            </td>
            <td>
              <input
                aria-label={`Cobro real ${ing.name}`}
                type="number"
                min="0"
                step="0.01"
                placeholder="Pendiente"
                value={a.actual_charge ?? ""}
                onChange={(e) => adj(ing.id, "actual_charge", e.target.value)}
              />
            </td>
            <td>
              <input
                aria-label={`Pagado ${ing.name}`}
                type="checkbox"
                checked={!!a.is_paid}
                onChange={(e) => adj(ing.id, "is_paid", e.target.checked)}
              />
            </td>
          </tr>
        ))}
      </Table>
      <h3>Costos de producción</h3>
      <div className="form-grid">
        <Input
          label="Costo por núcleo S/"
          type="number"
          min="0"
          step="0.01"
          required
          value={v.nucleus_cost}
          onChange={(x) => set("nucleus_cost", x)}
        />
        <Input
          label="Costo por saco S/"
          type="number"
          min="0"
          step="0.01"
          required
          value={v.packaging_cost}
          onChange={(x) => set("packaging_cost", x)}
        />
        <Check label="Núcleos pagados" value={v.nucleus_paid} onChange={(x) => set("nucleus_paid", x)} />
        <Check label="Envases pagados" value={v.packaging_paid} onChange={(x) => set("packaging_paid", x)} />
      </div>
      <CostRows s={s} costs={costs} setCosts={setCosts} />
      <div className="total-line">
        <span>
          Estimado <strong>{money(estimated)}</strong>
        </span>
        <span>
          {ingredients.every((x) => x.a.actual_charge !== undefined && x.a.actual_charge !== "")
            ? "Real"
            : "Real parcial"}{" "}
          <strong>{money(real)}</strong>
        </span>
      </div>
      <Select
        label="Guardar como"
        value={v.confirm ? "yes" : "no"}
        empty={false}
        onChange={(x) => set("confirm", x === "yes")}
        options={[
          { id: "no", name: "Lote a producir · borrador" },
          { id: "yes", name: "Producción ejecutada · confirmar" },
        ]}
      />
      <Footer
        busy={busy}
        close={close}
        label={v.confirm ? "Confirmar producción" : "Guardar lote a producir"}
      />
    </form>
  );
}
