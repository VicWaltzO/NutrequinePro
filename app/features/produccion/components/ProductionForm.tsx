import { useProductionFormState } from "../hooks/useProductionFormState";
import { Input, Select, Check, Table, money, kg } from "@/shared/ui";
import { Footer } from "@/shared/ui/FormFooter";
import type { FormProps } from "@/shared/types/forms";
import { CostRows } from "./CostRows";
import { Boxes, CalendarDays, Coins, Wheat } from "lucide-react";
import { FormSection } from "@/shared/ui/FormSection";
export function ProductionForm({ s: state, record, submit, close, busy }: FormProps) {
  const {
    v: values,
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
  } = useProductionFormState({ s: state, record });
  return (
    <form
      className="operation-form production-form"
      onSubmit={async (e) => {
        e.preventDefault();
        await submit("PRODUCTION_SAVE", {
          ...values,
          id: record?.id,
          products: Object.entries(counts)
            .filter(([, n]) => Number(n) > 0)
            .map(([product_id, nuclei_count]) => ({ product_id, nuclei_count })),
          ingredients: Object.values(adjust),
          costs,
        });
      }}
    >
      <FormSection title="Lote" label="Datos del lote" icon={CalendarDays} meta="Fecha y notas">
        <div className="form-grid">
          <Input
            label="Fecha de producción"
            type="date"
            required
            value={values.production_date}
            onChange={(x) => set("production_date", x)}
          />
          <Input label="Notas" value={values.notes} onChange={(x) => set("notes", x)} />
        </div>
      </FormSection>
      <FormSection
        title="Productos"
        label="Productos a producir"
        icon={Boxes}
        meta="Núcleos por producto"
        accent
      >
        <div className="form-grid">
          {state.products
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
      </FormSection>
      <FormSection title="Insumos consolidados" icon={Wheat} meta={`${ingredients.length} insumos`}>
        {ingredients.length ? (
          <div className="form-state-enter">
            <p className="form-table-hint">Desliza la tabla para consultar todas las columnas.</p>
            <Table
              heads={["Insumo", "Kg", "S/ por kg", "Teórico", "Descuento S/", "Cobro real S/", "Pagado"]}
            >
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
          </div>
        ) : (
          <p className="form-empty" role="status">
            Indica los núcleos por producto para consultar los insumos y sus cantidades.
          </p>
        )}
      </FormSection>
      <FormSection title="Costos y registro" icon={Coins} meta="Costos de producción">
        <div className="form-grid">
          <Input
            label="Costo por núcleo S/"
            type="number"
            min="0"
            step="0.01"
            required
            value={values.nucleus_cost}
            onChange={(x) => set("nucleus_cost", x)}
          />
          <Input
            label="Costo por saco S/"
            type="number"
            min="0"
            step="0.01"
            required
            value={values.packaging_cost}
            onChange={(x) => set("packaging_cost", x)}
          />
          <Check
            label="Núcleos pagados"
            value={values.nucleus_paid}
            onChange={(x) => set("nucleus_paid", x)}
          />
          <Check
            label="Envases pagados"
            value={values.packaging_paid}
            onChange={(x) => set("packaging_paid", x)}
          />
        </div>
        <CostRows s={state} costs={costs} setCosts={setCosts} />
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
          value={values.confirm ? "yes" : "no"}
          empty={false}
          onChange={(x) => set("confirm", x === "yes")}
          options={[
            { id: "no", name: "Lote a producir · borrador" },
            { id: "yes", name: "Producción ejecutada · confirmar" },
          ]}
        />
      </FormSection>
      <Footer
        busy={busy}
        close={close}
        label={values.confirm ? "Confirmar producción" : "Guardar lote a producir"}
      />
    </form>
  );
}
