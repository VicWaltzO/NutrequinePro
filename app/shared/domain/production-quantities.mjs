import { requireValue, scaled, roundedProduct, safe } from "./core.mjs";

/** Parse either decimal separator without accepting grouped or coerced values. */
export function nucleusHundredths(value) {
  requireValue(typeof value === "string" || typeof value === "number", "Núcleos inválidos.");
  const input = String(value).trim().replace(",", ".");
  requireValue(
    /^\d+(\.\d{1,2})?$/.test(input),
    "Núcleos: use un número con hasta 2 decimales (coma o punto).",
  );
  const count = scaled(input);
  requireValue(count <= 1e9, "Núcleos: el máximo es 10 000 000.");
  return count;
}

/** Keep quantities measured in grams and amounts measured in cents as integers. */
export function perNucleusAmount(perNucleus, hundredths) {
  return roundedProduct(perNucleus, hundredths, 100);
}

/** Only full bags enter commercial inventory; the proportional remainder stays outside it. */
export function productionYield(hundredths, bagsPerNucleus, weightPerNucleus) {
  const unitWeight = weightPerNucleus / bagsPerNucleus;
  requireValue(Number.isSafeInteger(unitWeight) && unitWeight > 0, "Peso por saco inválido.");
  const bags = safe(Number((BigInt(hundredths) * BigInt(bagsPerNucleus)) / 100n));
  const weight = safe(bags * unitWeight);
  return { bags, weight, nonCommercialWeight: perNucleusAmount(weightPerNucleus, hundredths) - weight };
}
