import { test } from "node:test";
import assert from "node:assert/strict";
import { weight } from "../shared/lib/weight.mjs";

test("pesos: gramos enteros bajo un kg y máximo dos decimales desde un kg", () => {
  for (const [input, expected] of [
    [0, "0 g"],
    [null, "0 g"],
    [undefined, "0 g"],
    [0.49, "0 g"],
    [0.5, "1 g"],
    [137, "137 g"],
    [999, "999 g"],
    [999.9, "1,000 g"],
    [1000, "1 kg"],
    [1001, "1 kg"],
    [1234, "1.23 kg"],
    [1235, "1.24 kg"],
    [2500, "2.5 kg"],
    [-137.4, "-137 g"],
    [-1235, "-1.24 kg"],
  ])
    assert.equal(weight(input), expected);
});
