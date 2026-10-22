import { Select } from "@/shared/ui";
import { ArrowLeftRight, ClipboardList, Package } from "lucide-react";
import { FormSection } from "@/shared/ui/FormSection";
import type { SimpleFieldProps } from "@/shared/types/simple-fields";
export default function InventoryAdjustmentFields({
  s: state,
  v,
  set,
  input,
}: Pick<SimpleFieldProps, "s" | "v" | "set" | "input">) {
  return (
    <>
      <FormSection title="Producto" label="Producto y fecha" icon={Package} meta="Datos del ajuste">
        <div className="form-grid">
          {input("date", "Fecha", "date")}
          <Select
            label="Producto"
            required
            value={v.product_id}
            onChange={(x) => set("product_id", x)}
            options={state.products}
          />
        </div>
      </FormSection>
      <FormSection
        title="Movimiento"
        label="Movimiento y cantidades"
        icon={ArrowLeftRight}
        meta="Entrada o salida"
        accent
      >
        <div className="form-grid">
          <Select
            label="Movimiento"
            required
            empty={false}
            value={v.direction}
            onChange={(x) => set("direction", x)}
            options={[
              { id: "IN", name: "Entrada" },
              { id: "OUT", name: "Salida" },
            ]}
          />
          {input("quantity", "Cantidad de sacos", "number")}
          {input("weight_kg", "Peso total kg", "number")}
        </div>
      </FormSection>
      <FormSection title="Motivo" label="Motivo del ajuste" icon={ClipboardList} meta="Obligatorio">
        {input("reason", "Motivo")}
      </FormSection>
    </>
  );
}
