import { Select } from "@/shared/ui";
import type { SimpleFieldProps } from "@/shared/types/simple-fields";
export default function CompanyFields({
  v,
  set,
  input,
  categories,
  defaultCategory,
}: Pick<SimpleFieldProps, "v" | "set" | "input" | "categories" | "defaultCategory">) {
  return (
    <>
      <h3>Empresa</h3>
      <div className="form-grid">
        {input("company_name", "Empresa")}
        {input("tax_id", "RUC / identificación", "text", false)}
        {input("address", "Dirección", "text", false)}
        {input("phone", "Teléfono", "tel", false)}
        {input("contact_email", "Correo de contacto", "email", false)}
      </div>
      <h3>Valores predeterminados</h3>
      <div className="form-grid">
        <Select
          label="Condición de pago en nuevas ventas"
          required
          empty={false}
          value={v.default_payment_condition}
          onChange={(x) => set("default_payment_condition", x)}
          options={[
            { id: "CREDIT", name: "Crédito" },
            { id: "CASH", name: "Contado" },
          ]}
        />
        <Select
          label="Método de pago predeterminado"
          empty="Elegir en cada operación"
          value={v.default_payment_method}
          onChange={(x) => set("default_payment_method", x)}
          options={["CASH", "TRANSFER", "CHECK"]}
        />
        {input("default_nucleus_cost", "Costo por núcleo S/", "number")}
        {input("default_packaging_cost", "Costo por saco S/", "number")}
      </div>
      <h3>Gastos</h3>
      <div className="form-grid">
        {input("categories_text", "Categorías de gastos (separadas por coma)")}
        <Select
          label="Categoría predeterminada"
          required
          empty={false}
          value={defaultCategory}
          onChange={(x) => set("default_expense_category", x)}
          options={[...new Set(categories)]}
        />
      </div>
      <p className="metadata">Moneda: PEN · Zona horaria: America/Lima</p>
    </>
  );
}
