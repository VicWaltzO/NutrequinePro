/** All weights and prices supplied here are already normalized to grams and cents. */
export function saleLineCompatibilityKey(line) {
  return JSON.stringify([
    line.product_id,
    line.presentation_unit_snapshot,
    line.weight_policy_snapshot,
    line.unit_weight_grams_snapshot,
    line.unit_weight_kg,
    line.unit_price,
  ]);
}

export function sameSalePresentation(line, product) {
  return (
    line.product_id === product.product_id &&
    line.presentation_unit_snapshot === product.presentation_unit_snapshot &&
    line.weight_policy_snapshot === product.weight_policy_snapshot &&
    (line.weight_policy_snapshot !== "FIXED" ||
      (line.unit_weight_grams_snapshot === product.unit_weight_grams_snapshot &&
        line.unit_weight_kg === product.unit_weight_kg))
  );
}
