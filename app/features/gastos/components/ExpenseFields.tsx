import { Select } from "@/shared/ui";
import type { SimpleFieldProps } from "@/shared/types/simple-fields";
export default function ExpenseFields({
  s: state,
  v,
  set,
  input,
}: Pick<SimpleFieldProps, "s" | "v" | "set" | "input">) {
  return (
    <>
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
        {input("notes", "Notas", "text", false)}
      </div>
      {v.production_id && (
        <p className="notice">
          Este importe será un único costo de producción vinculado. No se sumará como gasto independiente.
        </p>
      )}
    </>
  );
}
