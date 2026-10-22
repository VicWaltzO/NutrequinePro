import type { AppState, EditorRecord, Ingredient, IngredientInput } from "@/lib/domain-types";
import { roundedProduct, scaled } from "../../../shared/domain/core.mjs";

export type ProductionIngredientDraft = IngredientInput & {
  discount_enabled?: boolean;
  actual_mode?: "auto" | "manual";
};

function amount(value: unknown) {
  try {
    return { cents: scaled(value), error: "" };
  } catch {
    return { cents: 0, error: "Usa un importe válido, mayor o igual a cero, con hasta 2 decimales." };
  }
}

/** Load existing values explicitly, including null charges and unpaid historical rows. */
export function initialProductionIngredients(state: AppState, record?: EditorRecord) {
  const inputs = record?.input_snapshot?.ingredients ?? [];
  const drafts: Record<string, ProductionIngredientDraft> = Object.fromEntries(
    inputs.map((input) => [
      input.ingredient_id,
      {
        ...input,
        discount_enabled: Number(input.discount_amount ?? 0) > 0,
        actual_mode: input.actual_charge_mode ?? "manual",
        actual_charge: input.actual_charge ?? null,
        is_paid: input.is_paid ?? false,
      },
    ]),
  );
  for (const row of state.productionIngredients.filter(
    (row) => row.production_id === record?.id && row.is_current !== false,
  )) {
    drafts[row.ingredient_id] = {
      ...drafts[row.ingredient_id],
      ingredient_id: row.ingredient_id,
      price_per_kg: row.historical_price_per_kg / 100,
      discount_amount: row.discount_amount / 100,
      discount_enabled: row.discount_amount > 0,
      actual_charge: row.actual_charge === null ? null : row.actual_charge / 100,
      actual_mode:
        row.actual_charge === null ? "manual" : (drafts[row.ingredient_id]?.actual_mode ?? "manual"),
      is_paid: row.is_paid,
      notes: row.notes,
    };
  }
  return drafts;
}

/** Serialize effective values and charge intent; discount-toggle drafts stay local. */
export function resolveProductionIngredient(
  ingredient: Ingredient,
  weight: number,
  draft: ProductionIngredientDraft = { ingredient_id: ingredient.id },
) {
  const price = amount(draft.price_per_kg ?? ingredient.current_price_per_kg / 100);
  let gross = 0;
  let calculationError = "";
  try {
    gross = roundedProduct(weight, price.cents, 1000);
  } catch {
    calculationError = "La cantidad o el precio excede el rango de cálculo permitido.";
  }
  const discountEnabled = draft.discount_enabled ?? Number(draft.discount_amount ?? 0) > 0;
  const discount = amount(discountEnabled ? (draft.discount_amount ?? 0) : 0);
  const net = gross - discount.cents;
  const manual =
    draft.actual_mode === "manual" || (draft.actual_mode !== "auto" && Object.hasOwn(draft, "actual_charge"));
  const charge = manual ? (draft.actual_charge ?? null) : Math.max(0, net) / 100;
  const actual = charge === null || charge === "" ? null : amount(charge);
  const discountError =
    discount.error || (discount.cents > gross ? "El descuento no puede superar el teórico bruto." : "");
  const chargeError = actual?.error || "";
  const priceError = price.error || calculationError;
  const error = priceError || discountError || chargeError;
  const input: IngredientInput = {
    ingredient_id: ingredient.id,
    price_per_kg: draft.price_per_kg ?? ingredient.current_price_per_kg / 100,
    discount_amount: discountEnabled ? (draft.discount_amount ?? 0) : 0,
    actual_charge: charge,
    actual_charge_mode: manual ? "manual" : "auto",
    is_paid: draft.is_paid ?? true,
    ...(draft.notes === undefined ? {} : { notes: draft.notes }),
  };
  return {
    price: price.cents,
    gross,
    net,
    input,
    discountEnabled,
    manual,
    error,
    discountError,
    chargeError,
    priceError,
  };
}
