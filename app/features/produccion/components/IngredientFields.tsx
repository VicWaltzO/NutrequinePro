"use client";
import type { SimpleFieldProps } from "@/shared/types/simple-fields";
export default function IngredientFields({ input }: Pick<SimpleFieldProps, "input">) {
  return input("current_price_per_kg", "Precio S/ por kg", "number");
}
