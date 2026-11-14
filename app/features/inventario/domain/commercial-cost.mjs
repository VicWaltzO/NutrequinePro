import { requireValue, scaled, text } from "../../../shared/domain/core.mjs";
import { presentationSnapshot } from "../../../shared/domain/presentation.mjs";

const ENTITY = "COMMERCIAL_COST";
const TYPES = ["COST_START", "COST_RECOGNIZE", "COST_SETTLE", "COST_ADJUST"];
export const costCommands = TYPES;
const zero = () => ({ n: "0", d: "1" });
function rational(n, d = 1n) {
  requireValue(d > 0n, "Divisor económico inválido.");
  const gcd = (a, b) => (b ? gcd(b, a % b) : a);
  const g = gcd(n < 0n ? -n : n, d);
  return { n: String(n / g), d: String(d / g) };
}
const add = (a, b) =>
  rational(BigInt(a.n) * BigInt(b.d) + BigInt(b.n) * BigInt(a.d), BigInt(a.d) * BigInt(b.d));
const negate = (a) => ({ ...a, n: String(-BigInt(a.n)) });
const part = (a, n, d) => rational(BigInt(a.n) * BigInt(n), BigInt(a.d) * BigInt(d));
export function costMoney(a) {
  if (a === null) return null;
  const n = BigInt(a.n);
  const d = BigInt(a.d);
  const sign = n < 0n ? -1n : 1n;
  const result = sign * ((2n * (n < 0n ? -n : n) + d) / (2n * d));
  requireValue(
    result <= BigInt(Number.MAX_SAFE_INTEGER) && result >= -BigInt(Number.MAX_SAFE_INTEGER),
    "Valor fuera de precisión.",
  );
  return Number(result);
}
export function costHistory(s) {
  return s.corrections
    .filter((r) => r.entity_type === ENTITY)
    .sort((a, b) => a.new_snapshot.sequence - b.new_snapshot.sequence);
}
export function costKey(move) {
  const snap = presentationSnapshot(move, true);
  const actual = move.weight_kg / move.quantity;
  // A variable bag keeps its nominal commercial presentation when its real weight changes.
  // Legacy records without a nominal snapshot remain in an explicitly unknown group.
  const nominal = snap.unit_weight_grams_snapshot ?? (Number.isSafeInteger(actual) ? actual : null);
  return JSON.stringify([
    move.item_id,
    snap.presentation_unit_snapshot,
    snap.weight_policy_snapshot,
    nominal,
  ]);
}

const events = (s) => costHistory(s).map((r) => r.new_snapshot);
const isFlow = (e) => ["OPENING", "MOVEMENT"].includes(e.kind);
const amountMap = (rows) => {
  const map = new Map();
  for (const e of rows) {
    if (isFlow(e) && e.amount !== null) map.set(e.id, e.amount);
    if (e.kind === "RECOGNIZE") map.set(e.target_id, e.amount);
    if (e.kind === "SETTLE") for (const v of e.values) map.set(v.id, v.amount);
  }
  return map;
};
/** Replays economic events only. Physical dates never reorder accepted transactions. */
function project(rows, prospective = false) {
  const fixed = amountMap(rows);
  const groups = new Map();
  const flows = new Map();
  for (const e of rows) {
    if (!isFlow(e) && e.kind !== "ADJUST") continue;
    const key = e.key;
    const g = groups.get(key) ?? {
      key,
      product_id: e.product_id,
      presentation: e.presentation,
      quantity: 0,
      value: zero(),
      pending: 0,
    };
    if (e.kind === "ADJUST") {
      g.value = g.value === null ? null : add(g.value, e.amount);
      requireValue(g.value === null || BigInt(g.value.n) >= 0n, "El ajuste supera el valor disponible.");
      groups.set(key, g);
      continue;
    }
    let candidate = fixed.get(e.id) ?? null;
    if (candidate === null && e.return_of) {
      const original = flows.get(e.return_of);
      if (original?.effective !== null && original?.effective !== undefined)
        candidate = part(original.effective, e.quantity, -original.quantity);
    } else if (candidate === null && e.quantity < 0 && g.quantity >= -e.quantity && g.value !== null) {
      candidate = part(g.value, -e.quantity, g.quantity);
    }
    const recognized = fixed.has(e.id);
    const effective = recognized || prospective ? candidate : null;
    flows.set(e.id, { ...e, candidate, effective, recognized });
    if (!recognized) g.pending++;
    g.quantity += e.quantity;
    requireValue(
      Number.isSafeInteger(g.quantity),
      "Saldo económico incompatible; revise las presentaciones del inventario físico.",
    );
    if (g.value !== null && effective !== null)
      g.value = add(g.value, e.quantity < 0 ? negate(effective) : effective);
    else g.value = null;
    requireValue(g.value === null || BigInt(g.value.n) >= 0n, "Saldo económico negativo.");
    groups.set(key, g);
  }
  return { groups: [...groups.values()], flows: [...flows.values()] };
}
export function commercialCosts(s) {
  const rows = events(s);
  const view = project(rows);
  return {
    active: rows.length > 0,
    groups: view.groups.map((g) => ({
      ...g,
      value: g.pending ? null : g.value,
      average: !g.pending && g.value !== null && g.quantity > 0 ? part(g.value, 1, g.quantity) : null,
    })),
    flows: view.flows,
  };
}
function append(context, value) {
  const rows = events(context.s);
  const snapshot = JSON.parse(
    JSON.stringify({
      ...value,
      sequence: rows.length + 1,
      request_id: context.request_id,
      command: context.type,
    }),
  );
  return context.correction(
    ENTITY,
    value.id,
    Object.fromEntries(Object.keys(snapshot).map((key) => [key, null])),
    snapshot,
    context.p.reason || "Registro económico del movimiento físico",
  );
}
function openingGroups(s) {
  const groups = new Map();
  for (const m of s.inventoryMovements.filter((m) => m.item_type === "PRODUCT" && m.quantity)) {
    const key = costKey(m);
    const g = groups.get(key) ?? {
      key,
      product_id: m.item_id,
      presentation: presentationSnapshot(m, true),
      quantity: 0,
      weight_kg: 0,
    };
    g.quantity += m.quantity;
    g.weight_kg += m.weight_kg;
    groups.set(key, g);
  }
  for (const g of groups.values())
    requireValue(Number.isSafeInteger(g.quantity), "Saldo inicial fuera de precisión.");
  return [...groups.values()].filter((g) => g.quantity !== 0);
}
function validateCommand(context) {
  const { s, p, request_id } = context;
  const allowed = {
    COST_START: ["reason", "expected_revision"],
    COST_RECOGNIZE: ["target_id", "amount", "reference", "reason", "expected_revision"],
    COST_SETTLE: ["reason", "reference", "period_open", "expected_revision"],
    COST_ADJUST: ["key", "direction", "amount", "reference", "reason", "expected_revision"],
  }[context.type];
  requireValue(
    Object.keys(p).every((k) => allowed.includes(k)),
    "Campo económico no permitido.",
  );
  requireValue(
    Number.isSafeInteger(p.expected_revision) && p.expected_revision === s.revision,
    "Los datos cambiaron. Recargue antes de valorar.",
  );
  requireValue(
    typeof request_id === "string" && /^[A-Za-z0-9_.:-]{1,100}$/.test(request_id),
    "Identificador económico inválido.",
  );
  text(p.reason, "Motivo");
  requireValue(
    !context.partialReservations,
    "La valoración comercial no se habilita con reservas experimentales.",
  );
}
export function commercialCostCommand(context) {
  validateCommand(context);
  const { s, p, type } = context;
  const rows = events(s);
  if (type === "COST_START") {
    requireValue(!rows.length, "La valoración ya está iniciada.");
    const id = context.uid();
    append(context, {
      id,
      kind: "START",
      cutoff: context.clock,
      legacy_sale_ids: s.sales
        .filter((sale) => ["DELIVERED", "CANCELLED"].includes(sale.fulfillment_status))
        .map((sale) => sale.id),
      excluded_movement_ids: s.inventoryMovements.filter((m) => m.item_type === "PRODUCT").map((m) => m.id),
    });
    for (const g of openingGroups(s))
      append(context, { ...g, id: context.uid(), kind: "OPENING", amount: null });
    return id;
  }
  requireValue(rows.length > 0, "Inicie la valoración comercial primero.");
  const reference = text(p.reference, "Referencia documental");
  if (type === "COST_RECOGNIZE") {
    const target = rows.find((e) => e.id === p.target_id && isFlow(e));
    requireValue(
      target && target.quantity > 0 && !target.return_of,
      "Seleccione una entrada pendiente sin costo heredado.",
    );
    requireValue(
      !amountMap(rows).has(target.id),
      "El costo reconocido es inmutable. Use ajuste prospectivo.",
    );
    const amount = rational(BigInt(scaled(p.amount)));
    return append(context, { id: context.uid(), kind: "RECOGNIZE", target_id: target.id, amount, reference })
      .id;
  }
  if (type === "COST_SETTLE") {
    requireValue(p.period_open === true, "Confirme período abierto; no se liquidan cierres anteriores.");
    const candidates = project(rows, true).flows.filter(
      (e) => !e.recognized && (e.quantity < 0 || e.return_of) && e.candidate !== null,
    );
    requireValue(
      candidates.length > 0,
      "No hay salidas o retornos pendientes liquidables; reconozca primero los costos de entrada.",
    );
    return append(context, {
      id: context.uid(),
      kind: "SETTLE",
      reference,
      period_open: true,
      values: candidates.map((e) => ({ id: e.id, amount: e.candidate })),
    }).id;
  }
  const group = commercialCosts(s).groups.find((g) => g.key === p.key);
  requireValue(
    group && group.quantity > 0 && !group.pending && group.value !== null,
    "El ajuste requiere existencias completamente valoradas.",
  );
  requireValue(["INCREASE", "DECREASE"].includes(p.direction), "Dirección económica inválida.");
  const value = scaled(p.amount);
  requireValue(value > 0, "El ajuste debe ser positivo.");
  const amount = rational(BigInt(value) * (p.direction === "DECREASE" ? -1n : 1n));
  requireValue(BigInt(add(group.value, amount).n) >= 0n, "El ajuste supera el valor disponible.");
  return append(context, {
    id: context.uid(),
    kind: "ADJUST",
    key: group.key,
    product_id: group.product_id,
    presentation: group.presentation,
    amount,
    reference,
  }).id;
}
/** New physical movements get a separate economic snapshot, never a second physical movement. */
export function captureCommercialCosts(before, context) {
  if (!events(before).length) return;
  requireValue(!context.partialReservations, "Valoración incompatible con reservas experimentales.");
  const old = new Set(before.inventoryMovements.map((m) => m.id));
  for (const m of context.s.inventoryMovements.filter(
    (m) => !old.has(m.id) && m.item_type === "PRODUCT" && m.quantity,
  )) {
    const rows = events(context.s);
    const fixed = amountMap(rows);
    const key = costKey(m);
    let original;
    if (m.movement_type === "RETURN_IN" || (m.quantity > 0 && m.source_type === "SALE")) {
      const returnItems = context.s.returnItems.filter((r) => r.return_id === m.source_id);
      const line =
        m.sale_item_id ??
        returnItems.find(
          (r) => context.s.saleItems.find((i) => i.id === r.sale_item_id)?.product_id === m.item_id,
        )?.sale_item_id;
      original = rows.findLast(
        (e) => e.kind === "MOVEMENT" && e.quantity < 0 && e.sale_item_id === line && e.key === key,
      );
    }
    const group = commercialCosts(context.s).groups.find((g) => g.key === key);
    let amount = null;
    if (original && fixed.has(original.id))
      amount = part(fixed.get(original.id), m.quantity, -original.quantity);
    else if (
      m.quantity < 0 &&
      group &&
      !group.pending &&
      group.value !== null &&
      group.quantity >= -m.quantity
    )
      amount = part(group.value, -m.quantity, group.quantity);
    append(context, {
      id: m.id,
      kind: "MOVEMENT",
      key,
      product_id: m.item_id,
      presentation: presentationSnapshot(m, true),
      quantity: m.quantity,
      weight_kg: m.weight_kg,
      source_id: m.source_id,
      source_type: m.source_type,
      sale_item_id: m.sale_item_id ?? null,
      movement_type: m.movement_type,
      return_of: original?.id ?? null,
      amount,
    });
  }
  commercialCosts(context.s); // Validate presentation balances before persisting anything.
}
export function saleCommercialCost(s, saleId) {
  if (events(s)[0]?.legacy_sale_ids.includes(saleId)) return { status: "UNTRACKED", cost: null };
  const view = commercialCosts(s);
  const returnIds = new Set(s.returns.filter((r) => r.sale_id === saleId).map((r) => r.id));
  const rows = view.flows.filter(
    (e) =>
      (e.source_type === "SALE" && e.source_id === saleId) ||
      (e.source_type === "RETURN" && returnIds.has(e.source_id)),
  );
  if (!rows.some((e) => e.source_type === "SALE" && e.source_id === saleId && e.quantity < 0))
    return { status: "UNTRACKED", cost: null };
  if (rows.some((e) => !e.recognized)) return { status: "PENDING", cost: null };
  const value = rows.reduce((a, e) => add(a, e.quantity < 0 ? e.effective : negate(e.effective)), zero());
  return { status: "RECOGNIZED", cost: value };
}
export function assertCommercialCostIntegrity(before, s) {
  const history = costHistory(s);
  const previous = costHistory(before ?? { corrections: [] });
  for (const old of previous)
    requireValue(
      JSON.stringify(history.find((r) => r.id === old.id)) === JSON.stringify(old),
      "Historia económica inmutable.",
    );
  const ids = new Set();
  for (const [i, r] of history.entries()) {
    const e = r.new_snapshot;
    requireValue(e.sequence === i + 1 && !ids.has(e.id), "Secuencia económica inválida.");
    ids.add(e.id);
    const audit = s.audit.find(
      (a) => a.request_id === e.request_id && a.created_by === r.created_by && a.action === e.command,
    );
    requireValue(
      audit && audit.created_at === r.created_at && ["ADMIN", "OPERATOR"].includes(audit.actor_role),
      "Falta auditoría económica.",
    );
    if (TYPES.includes(e.command))
      requireValue(audit.actor_role === "ADMIN", "La valoración requiere administrador.");
    const prefix = history.slice(0, i).map((r) => r.new_snapshot);
    const payload = audit.payload;
    if (isFlow(e)) {
      requireValue(Number.isSafeInteger(e.quantity) && e.quantity !== 0, "Cantidad económica inválida.");
      let expected = null;
      if (e.return_of) {
        const origin = prefix.find((v) => v.id === e.return_of && isFlow(v));
        requireValue(
          origin &&
            origin.quantity < 0 &&
            origin.key === e.key &&
            e.quantity > 0 &&
            origin.sale_item_id === e.sale_item_id,
          "Retorno económico sin salida original.",
        );
        const returned = prefix.filter((v) => v.return_of === origin.id).reduce((n, v) => n + v.quantity, 0);
        requireValue(returned + e.quantity <= -origin.quantity, "Retorno económico excede salida original.");
        const amount = amountMap(prefix).get(origin.id);
        if (amount) expected = part(amount, e.quantity, -origin.quantity);
      } else if (e.quantity < 0) {
        const group = commercialCosts({ corrections: history.slice(0, i) }).groups.find(
          (g) => g.key === e.key,
        );
        if (group && !group.pending && group.value !== null && group.quantity >= -e.quantity)
          expected = part(group.value, -e.quantity, group.quantity);
      }
      requireValue(
        JSON.stringify(e.amount) === JSON.stringify(expected),
        "Snapshot económico inicial inválido.",
      );
    }
    if (e.kind === "RECOGNIZE") {
      const target = prefix.find((v) => v.id === payload.target_id && isFlow(v));
      requireValue(
        target &&
          target.quantity > 0 &&
          !target.return_of &&
          !amountMap(prefix).has(target.id) &&
          e.target_id === target.id,
        "Reconocimiento económico duplicado o inválido.",
      );
      requireValue(
        JSON.stringify(e.amount) === JSON.stringify(rational(BigInt(scaled(payload.amount)))) &&
          e.reference === text(payload.reference, "Referencia documental"),
        "Importe reconocido no coincide con aprobación.",
      );
    }
    if (e.kind === "SETTLE") {
      const values = project(prefix, true)
        .flows.filter((v) => !v.recognized && (v.quantity < 0 || v.return_of) && v.candidate !== null)
        .map((v) => ({ id: v.id, amount: v.candidate }));
      requireValue(
        payload.period_open === true &&
          e.period_open === true &&
          values.length > 0 &&
          JSON.stringify(e.values) === JSON.stringify(values),
        "Liquidación económica inválida.",
      );
    }
    if (e.kind === "ADJUST") {
      const group = commercialCosts({ corrections: history.slice(0, i) }).groups.find(
        (g) => g.key === payload.key,
      );
      requireValue(
        group &&
          group.quantity > 0 &&
          !group.pending &&
          group.value !== null &&
          ["INCREASE", "DECREASE"].includes(payload.direction) &&
          scaled(payload.amount) > 0,
        "Ajuste económico inválido.",
      );
      requireValue(
        e.key === payload.key &&
          JSON.stringify(e.amount) ===
            JSON.stringify(
              rational(BigInt(scaled(payload.amount)) * (payload.direction === "DECREASE" ? -1n : 1n)),
            ),
        "Ajuste sin aprobación equivalente.",
      );
    }
    if (e.kind === "MOVEMENT") {
      const m = s.inventoryMovements.find((m) => m.id === e.id);
      requireValue(
        m &&
          costKey(m) === e.key &&
          m.quantity === e.quantity &&
          m.weight_kg === e.weight_kg &&
          m.source_id === e.source_id &&
          m.source_type === e.source_type &&
          m.sale_item_id === (e.sale_item_id ?? undefined),
        "Movimiento económico sin origen físico válido.",
      );
    }
  }
  if (!history.length) return;
  requireValue(
    history[0].new_snapshot.kind === "START" &&
      history.filter((r) => r.new_snapshot.kind === "START").length === 1,
    "Inicio económico inválido.",
  );
  const rows = history.map((r) => r.new_snapshot);
  const excluded = new Set(rows[0].excluded_movement_ids);
  for (const m of s.inventoryMovements.filter(
    (m) => m.item_type === "PRODUCT" && m.quantity && !excluded.has(m.id),
  ))
    requireValue(ids.has(m.id), "Falta registro económico del movimiento físico.");
  for (const old of before?.audit.filter((a) =>
    previous.some((r) => r.new_snapshot.request_id === a.request_id),
  ) ?? [])
    requireValue(
      JSON.stringify(s.audit.find((a) => a.id === old.id)) === JSON.stringify(old),
      "Auditoría económica inmutable.",
    );
  const initial = openingGroups({
    ...s,
    inventoryMovements: s.inventoryMovements.filter((m) => excluded.has(m.id)),
  });
  const openings = rows.filter((e) => e.kind === "OPENING");
  requireValue(
    initial.length === openings.length &&
      initial.every((g) =>
        openings.some((e) => e.key === g.key && e.quantity === g.quantity && e.weight_kg === g.weight_kg),
      ),
    "Apertura económica no coincide con saldo físico inicial.",
  );
  commercialCosts(s);
}
