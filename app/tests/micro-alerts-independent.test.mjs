import test from "node:test";
import assert from "node:assert/strict";
import { seedState } from "../lib/domain.mjs";
import { preparationOverview } from "../features/microinsumos/domain/preparations.mjs";

function fixture() {
  const s = seedState();
  s.microIngredients = [1, 2, 14, 20].map((n) => ({
    id: `m${n}`,
    operational_id: n,
    name: `Sintético ${n}`,
    is_active: true,
  }));
  s.microFormulas = [
    ["pink", "ROSADO"],
    ["green", "VERDE_AMARILLO"],
    ["old", "ROSADO"],
  ].map(([id, family]) => ({ id, family, published_at: "2026-01-01" }));
  s.microFormulaHeads = [
    { family: "ROSADO", active_formula_id: "pink" },
    { family: "VERDE_AMARILLO", active_formula_id: "green" },
  ];
  s.microFormulaLines = [
    ["pink", "m1", 7],
    ["pink", "m2", 2],
    ["green", "m1", 11],
    ["old", "m20", 1],
  ].map(([formula_id, micro_ingredient_id, dose_grams]) => ({
    formula_id,
    micro_ingredient_id,
    dose_grams,
    name_snapshot: micro_ingredient_id,
    operational_id_snapshot: Number(micro_ingredient_id.slice(1)),
  }));
  s.microOpenings = [
    { micro_ingredient_id: "m1", quantity_grams: 219 },
    { micro_ingredient_id: "m2", quantity_grams: 40 },
    { micro_ingredient_id: "m20", quantity_grams: 0 },
  ];
  const policies = s.microFormulas.map((f) => ({
    formula_id: f.id,
    family: f.family,
    reference: "SYNTHETIC",
    lines: s.microFormulaLines
      .filter((l) => l.formula_id === f.id)
      .map(({ micro_ingredient_id, dose_grams }) => ({ micro_ingredient_id, dose_grams })),
  }));
  return { s, policies };
}
const read = (f) => preparationOverview(f.s, f.policies, "2026-11-15T00:00:00Z");
const order = (id, formula_id = "old", nuclei_hundredths = 1) => ({
  id,
  formula_id,
  nuclei_hundredths,
  status: "PENDING",
});

test("independent36: maximum per ingredient, not sum; inactive substitutes and historical formulas excluded", () => {
  const f = fixture();
  const a = read(f).alerts.preventive;
  assert.deepEqual(
    a.items.map((i) => [i.micro_ingredient_id, i.minimum_hundredths, i.missing_hundredths, i.status]),
    [
      ["m1", 22000, 100, "LOW"],
      ["m2", 4000, 0, "COVERED"],
    ],
  );
  assert.deepEqual(a.unavailable_families, []);
});
test("independent36: historical pending recipe retains exact 0.01 g and does not require current authorization", () => {
  const f = fixture();
  f.s.microPreparations = [order("p")];
  f.policies = f.policies.filter((p) => p.formula_id !== "old");
  const a = read(f).alerts.by_order;
  assert.equal(a[0].items[0].micro_ingredient_id, "m20");
  assert.equal(a[0].items[0].missing_hundredths, 1);
});
test("independent36: own commitment is credited once, third-party commitment reduces free balance", () => {
  const f = fixture();
  f.s.microPreparations = [order("p", "pink", 100)];
  f.s.microOpenings[0].quantity_grams = 10;
  f.s.microAssignments = [
    { id: "own", preparation_id: "p" },
    { id: "other", preparation_id: "q" },
  ];
  f.s.microAssignmentLines = [
    { assignment_id: "own", micro_ingredient_id: "m1", quantity_hundredths: 300 },
    { assignment_id: "other", micro_ingredient_id: "m1", quantity_hundredths: 500 },
  ];
  const item = read(f).alerts.by_order[0].items[0];
  assert.deepEqual(
    [
      item.required_hundredths,
      item.own_assigned_hundredths,
      item.available_hundredths,
      item.missing_hundredths,
    ],
    [700, 300, 200, 200],
  );
  f.s.microAssignmentReversals = [{ assignment_id: "other" }];
  assert.deepEqual(read(f).alerts.by_order, []);
});
test("independent36: confirmed and superseded orders cannot alert", () => {
  const f = fixture();
  f.s.microPreparations = [order("p"), order("q"), order("r")];
  f.s.microConfirmations = [{ preparation_id: "p", assignment_id: "a" }];
  f.s.microSupersessions = [{ source_id: "q", target_id: "r" }];
  assert.deepEqual(
    read(f).alerts.by_order.map((a) => a.preparation_id),
    ["r"],
  );
});
test("independent36: ledger outranks opening and economic history cannot provide physical stock", () => {
  const f = fixture();
  f.s.microLedgers = [
    {
      micro_ingredient_id: "m1",
      ledger: { quantity_hundredths: 21999, quantity_grams: 9999, events: [{ type: "ISSUE" }] },
    },
  ];
  f.s.microPurchases = [{ id: "purchase", status: "CONFIRMED" }];
  f.s.microPurchaseLines = [{ purchase_id: "purchase", micro_ingredient_id: "m1", quantity_grams: 99999 }];
  const i = read(f).alerts.preventive.items[0];
  assert.equal(i.physical_hundredths, 21999);
  assert.equal(i.missing_hundredths, 1);
});
test("independent36: missing opening is explicit, unavailable formula does not fabricate all-clear", () => {
  const f = fixture();
  f.s.microOpenings = [];
  f.policies = f.policies.filter((p) => p.formula_id !== "green");
  const a = read(f).alerts.preventive;
  assert.deepEqual(a.unavailable_families, ["VERDE_AMARILLO"]);
  assert.ok(a.items.every((i) => i.status === "UNAVAILABLE"));
});
test("independent36: repeated reads preserve every table, inventory, histories and revision", () => {
  const f = fixture();
  f.s.microPreparations = [order("p")];
  const before = structuredClone(f.s);
  const freeze = (o) => {
    if (o && typeof o === "object") {
      Object.freeze(o);
      Object.values(o).forEach(freeze);
    }
  };
  freeze(f.s);
  assert.deepEqual(read(f), read(f));
  assert.deepEqual(f.s, before);
});
