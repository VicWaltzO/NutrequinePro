export class DomainError extends Error {
  constructor(message) {
    super(message);
    this.name = "DomainError";
  }
}
export const fail = (m) => {
  throw new DomainError(m);
};
export const requireValue = (ok, m) => {
  if (!ok) fail(m);
};
export const normalize = (s) =>
  String(s ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
export function scaled(value, digits = 2) {
  const s = String(value ?? "").trim();
  requireValue(/^\d+(\.\d+)?$/.test(s), "Ingrese un número positivo válido.");
  const [a, b = ""] = s.split(".");
  requireValue(b.length <= digits, `Use como máximo ${digits} decimales.`);
  const n = Number(a) * 10 ** digits + Number(b.padEnd(digits, "0"));
  requireValue(Number.isSafeInteger(n) && n <= 1e12, "Importe fuera del rango permitido.");
  return n;
}
export const positiveInt = (v, label = "Cantidad") => {
  let n = Number(v);
  requireValue(Number.isSafeInteger(n) && n > 0 && n <= 1e7, `${label} debe ser un entero mayor que cero.`);
  return n;
};
export const date = (v) => {
  const parsed = new Date(v);
  requireValue(
    /^\d{4}-\d{2}-\d{2}$/.test(v ?? "") &&
      Number.isFinite(parsed.getTime()) &&
      parsed.toISOString().slice(0, 10) === v,
    "Fecha inválida.",
  );
  return v;
};
export const text = (v, label) => {
  let s = String(v ?? "").trim();
  requireValue(s.length > 0 && s.length <= 2000, `${label} es obligatorio (máximo 2000 caracteres).`);
  return s;
};
export const pick = (s, t, id) => {
  const v = s[t].find((x) => x.id === id);
  requireValue(v, `Registro no encontrado: ${t}.`);
  return v;
};
export const safe = (n) => {
  requireValue(
    Number.isSafeInteger(n) && Math.abs(n) <= 1e12,
    "El cálculo excede la precisión o el rango permitido.",
  );
  return n;
};
export const sum = (xs, f) => xs.reduce((a, b) => safe(a + f(b)), 0);
export const multiply = (a, b) => safe(a * b);
export const roundedProduct = (a, b, scale) =>
  safe(Number((BigInt(a) * BigInt(b) + BigInt(scale / 2)) / BigInt(scale)));
export const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Lima" }).format(new Date());
