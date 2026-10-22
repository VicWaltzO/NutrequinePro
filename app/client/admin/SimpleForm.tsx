import CustomerFields from "@/features/clientes/components/CustomerFields";
import ProductFields from "@/features/configuracion/components/ProductFields";
import IngredientFields from "@/features/produccion/components/IngredientFields";
import UserFields from "@/features/configuracion/components/UserFields";
import ExpenseFields from "@/features/gastos/components/ExpenseFields";
import InventoryAdjustmentFields from "@/features/inventario/components/InventoryAdjustmentFields";
import CompanyFields from "@/features/configuracion/components/CompanyFields";
import AdministrativeReasonFields from "@/features/configuracion/components/AdministrativeReasonFields";
import { simpleFormInitial } from "@/shared/lib/simple-form-initial";
import { useState } from "react";
import type { HTMLInputTypeAttribute } from "react";
import type { SimpleFields, FormProps } from "@/shared/types/forms";
import { Input, Check } from "@/shared/ui";
import { Footer } from "@/shared/ui/FormFooter";

export default function SimpleForm({ s: state, record, kind, submit, close, busy }: FormProps) {
  const initial = simpleFormInitial({ s: state, record, kind });
  const [v, setV] = useState<SimpleFields>(initial);
  const set = <K extends keyof SimpleFields>(k: K, x: SimpleFields[K]) => setV((a) => ({ ...a, [k]: x }));
  const input = (
    k: keyof SimpleFields,
    l: string,
    type: HTMLInputTypeAttribute = "text",
    required = true,
  ) => (
    <Input
      label={l}
      type={type}
      required={required}
      min={type === "number" ? "0" : undefined}
      step={type === "number" ? "0.001" : undefined}
      value={typeof v[k] === "boolean" ? undefined : (v[k] ?? undefined)}
      onChange={(x) => set(k, x)}
    />
  );
  const operations: Record<string, string> = {
    customer: "CUSTOMER_SAVE",
    site: "SITE_SAVE",
    product: "PRODUCT_SAVE",
    ingredient: "INGREDIENT_SAVE",
    expense: "EXPENSE_CREATE",
    adjust: "INVENTORY_ADJUST",
    config: "CONFIG_SAVE",
    user: "USER_SAVE",
  };
  const categories = (v.categories_text ?? "")
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
  const defaultCategory = categories.includes(v.default_expense_category ?? "")
    ? v.default_expense_category
    : categories[0];
  return (
    <form
      className={["expense", "adjust"].includes(kind ?? "") ? "operation-form" : undefined}
      onSubmit={async (e) => {
        e.preventDefault();
        await submit(operations[kind ?? ""] ?? record?._operation ?? "", {
          ...v,
          ...(kind === "config"
            ? { expense_categories: categories, default_expense_category: defaultCategory }
            : {}),
        });
      }}
    >
      {["customer", "site", "product", "ingredient", "user"].includes(kind ?? "") && (
        <div className="form-grid">
          {input("name", "Nombre")}
          {kind === "customer" && <CustomerFields s={state} v={v} set={set} input={input} />}
          {kind === "product" && <ProductFields v={v} set={set} input={input} />}
          {kind === "ingredient" && <IngredientFields input={input} />}
          {kind === "user" && <UserFields v={v} set={set} input={input} />}
          <Check label="Activo" value={v.is_active} onChange={(x) => set("is_active", x)} />
        </div>
      )}
      {kind === "expense" && <ExpenseFields s={state} v={v} set={set} input={input} />}
      {kind === "adjust" && <InventoryAdjustmentFields s={state} v={v} set={set} input={input} />}
      {kind === "config" && (
        <CompanyFields
          v={v}
          set={set}
          input={input}
          categories={categories}
          defaultCategory={defaultCategory}
        />
      )}
      {kind === "reason" && <AdministrativeReasonFields record={record} input={input} />}
      <Footer busy={busy} close={close} label={kind === "reason" ? "Registrar operación" : "Guardar"} />
    </form>
  );
}
