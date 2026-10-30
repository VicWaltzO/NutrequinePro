import { test } from "node:test";
import assert from "node:assert/strict";
import { customerNameMatches, customerDuplicateReview } from "../features/clientes/domain/name-matches.mjs";

const customers = [
  { id: "a", name: "Gonzalo Andrade", is_active: true },
  { id: "b", name: "Gonzalo Andrada", is_active: false },
  { id: "c", name: "María Pérez", is_active: false, deleted_at: "2026-10-20" },
];
test("D09-02/03: exactitud normalizada sin modificar entradas", () => {
  const before = structuredClone(customers);
  for (const name of [" GONZÁLO   ANDRADE ", "Gonzalo-Andrade", "Gonzalo, Andrade."]) {
    assert.equal(customerNameMatches(customers, name)[0].kind, "exact");
  }
  assert.deepEqual(customers, before);
  assert.equal(customerNameMatches(customers, "maria perez")[0].customer.id, "c");
});
test("D09-04/05/12/14/15: similares explicables, propios, múltiples e históricos", () => {
  assert.deepEqual(
    customerNameMatches(customers, "Gonzalo Andrade").map((x) => [x.customer.id, x.kind]),
    [
      ["a", "exact"],
      ["b", "similar"],
    ],
  );
  assert.equal(customerNameMatches(customers, "Andrade Gonzalo")[0].kind, "similar");
  assert.equal(customerNameMatches(customers, "Gonzalo Andrdae")[0].kind, "similar");
  assert.equal(customerNameMatches(customers, "Gonzalo Andrade", "a")[0].customer.id, "b");
  for (const name of ["Ana Pérez", "Gonzalo Ramírez", "", "Andrade", "María Luisa Pérez"])
    assert.equal(customerNameMatches(customers, name).length, 0);
  assert.equal(customerNameMatches([{ id: "n", name: "Cliente 10" }], "Cliente 11").length, 0);
});
test("D09-11: revisión distingue nombre original, candidato, estado e identidad", () => {
  const name = "Gonzalo Andrade";
  const review = customerDuplicateReview(customers, name);
  assert.equal(review, customerDuplicateReview([...customers].reverse(), name));
  assert.notEqual(review, customerDuplicateReview(customers, name.toUpperCase()));
  assert.notEqual(review, customerDuplicateReview(customers, name, "a"));
  assert.notEqual(
    review,
    customerDuplicateReview(
      customers.map((x) => ({ ...x, is_active: true })),
      name,
    ),
  );
  assert.notEqual(review, customerDuplicateReview([...customers, { id: "d", name }], name));
});
