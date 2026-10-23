import { useState } from "react";
import { Check, Input, Select, ProductImage } from "@/shared/ui";
import type { SimpleFieldProps } from "@/shared/types/simple-fields";
import { unitLabels } from "@/shared/domain/presentation.mjs";
import type { PresentationUnit } from "@/shared/types/domain";
export default function ProductFields({ v, set, input }: Pick<SimpleFieldProps, "v" | "set" | "input">) {
  const [photoError, setPhotoError] = useState("");
  const unit = unitLabels({ presentation_unit: v.presentation_unit as PresentationUnit });
  return (
    <>
      {input("category", "Categoría")}
      <Select
        label="Unidad de venta e inventario"
        value={v.presentation_unit}
        empty={false}
        onChange={(x) => {
          set("presentation_unit", x);
          if (x !== "BAG") set("stock_entry_mode", "DIRECT_STOCK");
          if (x === "BOTTLE") {
            set("weight_policy", "FIXED");
            set("stock_entry_mode", "DIRECT_STOCK");
          }
        }}
        options={[
          { id: "BAG", name: "Saco" },
          { id: "BOTTLE", name: "Frasco" },
          { id: "UNIT", name: "Unidad" },
        ]}
      />
      <Input
        label="Contenido neto por unidad (gramos)"
        type="number"
        min="1"
        step="1"
        required
        value={v.unit_weight_grams}
        onChange={(x) => set("unit_weight_grams", x)}
      />
      <Select
        label="Política de peso"
        value={v.weight_policy}
        empty={false}
        onChange={(x) => set("weight_policy", x)}
        options={[
          { id: "FIXED", name: "Fijo" },
          ...(v.presentation_unit !== "BOTTLE" ? [{ id: "VARIABLE", name: "Variable en ventas" }] : []),
        ]}
      />
      <Select
        label="Ingreso al inventario"
        value={v.stock_entry_mode}
        empty={false}
        onChange={(x) => set("stock_entry_mode", x)}
        options={[
          { id: "DIRECT_STOCK", name: "Registro directo de existencias" },
          ...(v.presentation_unit === "BAG"
            ? [{ id: "NUCLEUS_PRODUCTION", name: "Producción por núcleo" }]
            : []),
        ]}
      />
      {input("default_sale_price", `Precio base S/ por ${unit.singular}`, "number", !!v.is_sellable)}
      {v.stock_entry_mode === "NUCLEUS_PRODUCTION" && (
        <>
          {input("bags_per_nucleus", "Sacos por núcleo", "number")}
          {input("commercial_weight_per_nucleus_kg", "Kg comerciales por núcleo", "number")}
        </>
      )}
      <Check label="Habilitado para venta" value={v.is_sellable} onChange={(x) => set("is_sellable", x)} />
      <p className="metadata">
        Si desconoce el precio, deje el campo vacío y deshabilite la venta hasta configurarlo.
      </p>
      <label className="field">
        <span>Fotografía privada del producto</span>
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={(event) => {
            const file = event.target.files?.[0];
            setPhotoError("");
            if (!file) return;
            if (file.size > 150000 || !["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
              setPhotoError("Use una fotografía JPEG, PNG o WebP de hasta 150 KB.");
              return;
            }
            const reader = new FileReader();
            reader.onload = () => set("image", String(reader.result));
            reader.onerror = () =>
              setPhotoError("No se pudo leer la fotografía. Seleccione el archivo otra vez.");
            reader.readAsDataURL(file);
          }}
        />
      </label>
      {photoError && (
        <p className="error" role="alert">
          {photoError}
        </p>
      )}
      {v.image && (
        <div>
          <ProductImage image={v.image} name={v.name ?? "Producto"} />
          <button type="button" onClick={() => set("image", null)}>
            Quitar fotografía
          </button>
        </div>
      )}
    </>
  );
}
