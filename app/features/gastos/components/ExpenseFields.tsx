import { Select } from "@/shared/ui";
import { FileText, Link2, Receipt } from "lucide-react";
import { FormSection } from "@/shared/ui/FormSection";
import type { SimpleFieldProps } from "@/shared/types/simple-fields";
export default function ExpenseFields({
  s: state,
  v,
  set,
  input,
}: Pick<SimpleFieldProps, "s" | "v" | "set" | "input">) {
  return (
    <>
      <FormSection title="Gasto" label="Datos del gasto" icon={Receipt} meta="Fecha, concepto e importe">
        <div className="form-grid">
          {input("date", "Fecha", "date")}
          <Select
            label="Categoría"
            required
            value={v.category}
            onChange={(x) => set("category", x)}
            options={state.config.expense_categories}
          />
          {input("description", "Descripción")}
          {input("amount", "Monto pagado S/", "number")}
        </div>
      </FormSection>
      <FormSection title="Vinculación" icon={Link2} meta="Opcional" accent>
        <div className="form-grid">
          <Select
            label="Producción (opcional)"
            value={v.production_id}
            onChange={(x) => set("production_id", x)}
            options={state.productions
              .filter((x) => !["CLOSED", "CANCELLED"].includes(x.status))
              .map((x) => ({ id: x.id, name: x.code }))}
          />
          <Select
            label="Venta (opcional)"
            value={v.sale_id}
            onChange={(x) => set("sale_id", x)}
            options={state.sales.map((x) => ({ id: x.id, name: x.code }))}
          />
          <Select
            label="Sede (opcional)"
            value={v.site_id}
            onChange={(x) => set("site_id", x)}
            options={state.sites}
          />
          <Select
            label="Insumo (opcional)"
            value={v.ingredient_id}
            onChange={(x) => set("ingredient_id", x)}
            options={state.ingredients}
          />
        </div>
        {v.production_id && (
          <p className="notice form-state-enter" role="status">
            Este importe será un único costo de producción vinculado. No se sumará como gasto independiente.
          </p>
        )}
      </FormSection>
      <FormSection title="Notas" label="Notas del gasto" icon={FileText} meta="Opcional">
        {input("notes", "Notas", "text", false)}
      </FormSection>
    </>
  );
}
