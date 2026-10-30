export type SortScalar = string | number | boolean | null | undefined;
export type SortValue = SortScalar | readonly SortScalar[];
export type SortSelection = { column: number; direction: "asc" | "desc" } | null;
const collator = new Intl.Collator("es-PE", { sensitivity: "base", numeric: true });
const missing = (v: SortScalar) =>
  v == null || (typeof v === "string" && !v.trim()) || (typeof v === "number" && !Number.isFinite(v));

function scalar(a: SortScalar, b: SortScalar, direction: number): number {
  if (missing(a) && missing(b)) return 0;
  if (missing(a)) return 1;
  if (missing(b)) return -1;
  if (typeof a === "number" && typeof b === "number") return Math.sign(a - b) * direction;
  if (typeof a === "boolean" && typeof b === "boolean") return (Number(a) - Number(b)) * direction;
  return collator.compare(String(a), String(b)) * direction;
}

/** Only the primary changes direction. Meaningful secondary keys stay ascending. */
export function compareValues(a: SortValue, b: SortValue, direction: "asc" | "desc" = "asc"): number {
  const aa = Array.isArray(a) ? a : [a];
  const bb = Array.isArray(b) ? b : [b];
  for (let i = 0; i < Math.max(aa.length, bb.length); i++) {
    const result = scalar(aa[i], bb[i], i === 0 && direction === "desc" ? -1 : 1);
    if (result) return result;
  }
  return 0;
}

export function nextSort(current: SortSelection, column: number): SortSelection {
  if (current?.column !== column) return { column, direction: "asc" };
  if (current.direction === "asc") return { column, direction: "desc" };
  return null;
}

/** Decorate once, sort a copy, and retain source indices for editable rows. */
export function sortRows<T>(
  rows: readonly T[],
  value: ((row: T, index: number) => SortValue) | null,
  selection: SortSelection,
  tie: (row: T, index: number) => SortValue,
) {
  const decorated = rows.map((row, originalIndex) => ({
    row,
    originalIndex,
    value: value?.(row, originalIndex),
    tie: tie(row, originalIndex),
  }));
  if (!selection || !value) return decorated;
  return decorated.sort(
    (a, b) =>
      compareValues(a.value, b.value, selection.direction) ||
      compareValues(a.tie, b.tie) ||
      a.originalIndex - b.originalIndex,
  );
}

export function instant(value: string | null | undefined): number | null {
  const epoch = value ? Date.parse(value) : NaN;
  return Number.isFinite(epoch) ? epoch : null;
}
