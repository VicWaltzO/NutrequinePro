import { randomUUID } from "node:crypto";
import { executeCommand } from "../../lib/domain.mjs";
import { fixture, payload, actor } from "./receipt-fixture.mjs";
export { actor };
export function apply35(s, command, options = {}, user = actor) {
  const out = executeCommand(s, command, user, "2026-11-15T18:00:00.000Z", options);
  Object.assign(out.state.audit.at(-1), { request_id: command.request_id, request_contract_version: 1 });
  return out;
}
export const buy35 = (s = fixture(), extra = {}) =>
  apply35(s, {
    type: "MICRO_RECEIPT_SAVE",
    request_id: randomUUID(),
    payload: payload({
      total: "250",
      lines: [
        { micro_ingredient_id: "m1", quantity_kg: "25", unit_price: "10", amount: "250", discount: "0" },
      ],
      ...extra,
    }),
  });
export function empty35() {
  const s = fixture();
  s.microOpenings[0].quantity_grams = 0;
  s.microOpenings[0].valuation_cents = 0;
  return s;
}
export function rectify35(s, extra = {}) {
  const receipt = s.microReceipts[0];
  return {
    type: "MICRO_RECEIPT_RECTIFY",
    request_id: randomUUID(),
    payload: {
      id: receipt.id,
      expected_version: receipt.version,
      expected_revision: s.revision,
      date: "2026-11-15",
      reason: "Cantidad de factura corregida",
      reference: "Acta sintética 35",
      total: "200",
      discount: "0",
      lines: [
        { micro_ingredient_id: "m1", quantity_kg: "20", unit_price: "10", amount: "200", discount: "0" },
      ],
      ...extra,
    },
  };
}
