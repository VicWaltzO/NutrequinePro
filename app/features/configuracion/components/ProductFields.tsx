"use client";
import { Check } from "@/shared/ui";
import type { SimpleFieldProps } from "@/shared/types/simple-fields";
export default function ProductFields({ v, set, input }: Pick<SimpleFieldProps, "v" | "set" | "input">) {
  return (
    <>
      {input("category", "Categoría")}
      {input("default_sale_price", "Precio base S/", "number")}
      {input("standard_bag_weight_kg", "Kg estándar por saco", "number")}
      {input("bags_per_nucleus", "Sacos por núcleo", "number")}
      {input("commercial_weight_per_nucleus_kg", "Kg comerciales por núcleo", "number")}
      <Check label="Habilitado para venta" value={v.is_sellable} onChange={(x) => set("is_sellable", x)} />
    </>
  );
}
