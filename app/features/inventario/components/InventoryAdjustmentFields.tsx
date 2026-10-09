"use client";
import { Select } from "@/shared/ui";
import type { SimpleFieldProps } from "@/shared/types/simple-fields";
export default function InventoryAdjustmentFields({
  s,
  v,
  set,
  input,
}: Pick<SimpleFieldProps, "s" | "v" | "set" | "input">) {
  return (
    <div className="form-grid">
      {input("date", "Fecha", "date")}
      <Select
        label="Producto"
        required
        value={v.product_id}
        onChange={(x) => set("product_id", x)}
        options={s.products}
      />
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
      {input("reason", "Motivo")}
    </div>
  );
}
