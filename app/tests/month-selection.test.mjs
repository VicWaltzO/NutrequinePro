import { test } from "node:test";
import assert from "node:assert/strict";
import { monthRange } from "../features/documentos/domain/common.ts";

test("balance mensual: límites civiles, octubre y siglos bisiestos", () => {
  for (const [month, last] of [
    ["1900-01", 31],
    ["1900-02", 28],
    ["2000-02", 29],
    ["2024-02", 29],
    ["2026-02", 28],
    ["2026-10", 31],
    ["2026-12", 31],
    ["2100-02", 28],
    ["9999-12", 31],
  ])
    assert.deepEqual(monthRange(month), { from: month + "-01", to: month + "-" + last });
  for (const month of [
    "",
    "2026-00",
    "2026-13",
    "1899-12",
    "0000-01",
    "2026-1",
    "2026-10-01",
    " 2026-10",
    "2026-10 ",
    "abcd-ef",
  ])
    assert.throws(() => monthRange(month), /mes válido/);
});
