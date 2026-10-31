import { test } from "node:test";
import assert from "node:assert/strict";
import { compareValues, nextSort, sortRows, instant } from "../shared/lib/table-sort.ts";

test("NQP12 A: numeric cents, grams, decimals, negatives and nulls", () => {
  for (const numbers of [
    [10000, 900, 8000],
    [10000, 900, 1000],
    [1.25, 0, 1.2],
    [100, -9, 0],
  ]) {
    const rows = [...numbers, null];
    for (const direction of ["asc", "desc"]) {
      const result = sortRows(
        rows,
        (x) => x,
        { column: 0, direction },
        (_, i) => i,
      ).map((x) => x.row);
      assert.deepEqual(
        result,
        [...numbers].sort((a, b) => (direction === "asc" ? a - b : b - a)).concat(null),
      );
      assert.deepEqual(rows, [...numbers, null]);
    }
  }
  assert.equal(compareValues(false, true), -1);
  assert.equal(compareValues(false, null, "desc"), -1);
  assert.equal(compareValues("", 0, "desc"), 1);
});
test("NQP12 A: Spanish natural text, civil dates, months and equivalent UTC instants", () => {
  assert.equal(compareValues("Árbol", "arbol"), 0);
  assert.ok(compareValues("V-2", "V-10") < 0);
  assert.ok(compareValues("2026-02-28", "2026-10-01") < 0);
  assert.ok(compareValues("2026-02", "2026-10") < 0);
  assert.equal(instant("2026-10-01T00:00:00-05:00"), instant("2026-10-01T05:00:00Z"));
});
test("NQP12 A: original indices, fixed secondary ties, immutable source and ternary cycle", () => {
  const rows = Object.freeze([
    { id: "2", value: 9, code: "V-10" },
    { id: "1", value: 9, code: "V-2" },
  ]);
  for (const direction of ["asc", "desc"]) {
    const result = sortRows(
      rows,
      (x) => [x.value, x.code],
      { column: 0, direction },
      (x) => x.id,
    );
    assert.deepEqual(
      result.map((x) => x.originalIndex),
      [1, 0],
    );
    assert.equal(result[0].row, rows[1]);
  }
  let selection = null;
  selection = nextSort(selection, 0);
  assert.equal(selection.direction, "asc");
  selection = nextSort(selection, 0);
  assert.equal(selection.direction, "desc");
  selection = nextSort(selection, 0);
  assert.equal(selection, null);
  assert.deepEqual(
    sortRows(rows, null, selection, (x) => x.id).map((x) => x.row),
    rows,
  );
  assert.deepEqual(
    sortRows(
      [],
      (x) => x,
      { column: 0, direction: "asc" },
      (x) => x,
    ),
    [],
  );
});
