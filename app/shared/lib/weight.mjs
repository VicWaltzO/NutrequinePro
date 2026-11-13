// Presentation only: domain quantities retain their original precision in grams.
const kilograms = new Intl.NumberFormat("es-PE", { maximumFractionDigits: 2 });
const grams = new Intl.NumberFormat("es-PE", { maximumFractionDigits: 0 });
export function weight(value) {
  const amount = value ?? 0;
  return Math.abs(amount) >= 1000 ? `${kilograms.format(amount / 1000)} kg` : `${grams.format(amount)} g`;
}
