import { readFileSync } from "node:fs";

export function parseCsv(text) {
  const rows = [];
  let row = [],
    value = "",
    quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') {
      if (quoted && text[i + 1] === '"') {
        value += '"';
        i++;
      } else quoted = !quoted;
    } else if (ch === "," && !quoted) {
      row.push(value);
      value = "";
    } else if (ch === "\n" && !quoted) {
      row.push(value.replace(/\r$/, ""));
      rows.push(row);
      row = [];
      value = "";
    } else value += ch;
  }
  if (value || row.length) {
    row.push(value);
    rows.push(row);
  }
  const heads = rows.shift();
  return rows
    .filter((r) => r.length > 1)
    .map((r) => Object.fromEntries(heads.map((h, i) => [h.replace(/^\uFEFF/, ""), r[i] ?? ""])));
}
export const inventory = parseCsv(
  readFileSync(
    new URL("../../docs/actualizacion-seguridad/NQP26-11_INVENTARIO_TABLAS.csv", import.meta.url),
    "utf8",
  ),
);
