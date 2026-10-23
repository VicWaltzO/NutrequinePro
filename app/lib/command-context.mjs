import { text, today } from "../shared/domain/core.mjs";
import { presentationSnapshot } from "../shared/domain/presentation.mjs";
export function createCommandContext(state, type, payload, actor, clock) {
  const uid = () => crypto.randomUUID();
  const add = (t, v) => {
    const a = { id: uid(), created_at: clock, created_by: actor.id, ...v };
    state[t].push(a);
    return a;
  };
  const code = (t, prefix) => `${prefix}-${String(state[t].length + 1).padStart(6, "0")}`;
  const reason = () => text(payload.reason, "Motivo");
  const movement = (v) =>
    add("inventoryMovements", {
      date: payload.date ?? today(),
      ...(v.item_type === "PRODUCT"
        ? presentationSnapshot(state.products.find((x) => x.id === v.item_id))
        : {}),
      ...v,
    });
  const correction = (entity_type, entity_id, old_value, new_value, why) => {
    const c = add("corrections", {
      code: code("corrections", "RC"),
      entity_type,
      entity_id,
      reason: why,
      old_snapshot: old_value,
      new_snapshot: new_value,
    });
    const keys = new Set([...Object.keys(old_value), ...Object.keys(new_value)]);
    for (const k of keys)
      if (JSON.stringify(old_value[k]) !== JSON.stringify(new_value[k]))
        add("correctionFields", {
          correction_id: c.id,
          field_name: k,
          old_value: JSON.stringify(old_value[k]),
          new_value: JSON.stringify(new_value[k]),
        });
    return c;
  };
  return { s: state, type, p: payload, actor, clock, uid, add, code, reason, movement, correction };
}
