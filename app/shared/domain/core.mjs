export class DomainError extends Error {
  constructor(message) {
    super(message);
    this.name = "DomainError";
  }
}
export const fail = (message) => {
  throw new DomainError(message);
};
export const requireValue = (condition, message) => {
  if (!condition) fail(message);
};
export const normalize = (value) =>
  String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
export function scaled(value, digits = 2) {
  const input = String(value ?? "").trim();
  requireValue(/^\d+(\.\d+)?$/.test(input), "Ingrese un número positivo válido.");
  const [integerPart, decimalPart = ""] = input.split(".");
  requireValue(decimalPart.length <= digits, `Use como máximo ${digits} decimales.`);
  const scaledValue = Number(integerPart) * 10 ** digits + Number(decimalPart.padEnd(digits, "0"));
  requireValue(
    Number.isSafeInteger(scaledValue) && scaledValue <= 1e12,
    "Importe fuera del rango permitido.",
  );
  return scaledValue;
}
export const positiveInt = (value, label = "Cantidad") => {
  const quantity = Number(value);
  requireValue(
    Number.isSafeInteger(quantity) && quantity > 0 && quantity <= 1e7,
    `${label} debe ser un entero mayor que cero.`,
  );
  return quantity;
};
export const date = (value) => {
  const parsed = new Date(value);
  requireValue(
    /^\d{4}-\d{2}-\d{2}$/.test(value ?? "") &&
      Number.isFinite(parsed.getTime()) &&
      parsed.toISOString().slice(0, 10) === value,
    "Fecha inválida.",
  );
  return value;
};
export const text = (value, label) => {
  const input = String(value ?? "").trim();
  requireValue(input.length > 0 && input.length <= 2000, `${label} es obligatorio (máximo 2000 caracteres).`);
  return input;
};
export const pick = (state, table, id) => {
  const record = state[table].find((row) => row.id === id);
  requireValue(record, `Registro no encontrado: ${table}.`);
  return record;
};
export const safe = (value) => {
  requireValue(
    Number.isSafeInteger(value) && Math.abs(value) <= 1e12,
    "El cálculo excede la precisión o el rango permitido.",
  );
  return value;
};
export const sum = (rows, selectValue) => rows.reduce((total, row) => safe(total + selectValue(row)), 0);
export const multiply = (left, right) => safe(left * right);
export const roundedProduct = (quantity, unitValue, scale) =>
  safe(Number((BigInt(quantity) * BigInt(unitValue) + BigInt(scale / 2)) / BigInt(scale)));
export const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Lima" }).format(new Date());
