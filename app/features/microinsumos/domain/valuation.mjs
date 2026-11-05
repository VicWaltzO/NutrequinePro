import { date, requireValue } from "../../../shared/domain/core.mjs";

// Exact cents. JSON carries decimal strings; no floating point cost enters the ledger.
const LIMIT = 1e12;
const MAX_EVENTS = 10000;
const MAX_DIGITS = 256;
const zero = () => ({ n: "0", d: "1" });
function fraction(n, d = BigInt(1)) {
  requireValue(d > 0, "Denominador inválido.");
  let a = n < 0 ? -n : n;
  let b = d;
  while (b) [a, b] = [b, a % b];
  const divisor = a || BigInt(1);
  const result = { n: String(n / divisor), d: String(d / divisor) };
  requireValue(
    result.n.length <= MAX_DIGITS && result.d.length <= MAX_DIGITS,
    "Valoración excede la precisión admitida; no se redondeó ni registró el evento.",
  );
  return result;
}
const add = (a, b) =>
  fraction(BigInt(a.n) * BigInt(b.d) + BigInt(b.n) * BigInt(a.d), BigInt(a.d) * BigInt(b.d));
const subtract = (a, b) => add(a, { n: String(-BigInt(b.n)), d: b.d });
const prorate = (a, n, d) => fraction(BigInt(a.n) * BigInt(n), BigInt(a.d) * BigInt(d));
// Cumulative issue cost is nonnegative: ties round up once, with carry retained.
const round = (a) => (BigInt(a.n) * BigInt(2) + BigInt(a.d)) / (BigInt(a.d) * BigInt(2));
function integer(value, label, positive = false) {
  requireValue(
    Number.isSafeInteger(value) && value >= (positive ? 1 : 0) && value <= LIMIT,
    `${label}: entero fuera de rango.`,
  );
  return value;
}
function identifier(value) {
  requireValue(typeof value === "string" && /^[A-Za-z0-9_.:-]{1,100}$/.test(value), "ID inválido.");
  return value;
}
function permission(actor, write) {
  requireValue(
    actor && actor.is_active === true && ["ADMIN", "OPERATOR", "VIEWER"].includes(actor.role),
    "Usuario sin acceso a valoración.",
  );
  identifier(actor.id);
  requireValue(!write || actor.role === "ADMIN", "La valoración económica requiere administrador.");
}
function openingSnapshot(input) {
  requireValue(input && typeof input === "object", "Apertura requerida.");
  requireValue(typeof input.cutoff_date === "string", "Fecha de corte explícita requerida.");
  requireValue(
    input.unit_cost_cents === null || Number.isSafeInteger(input.unit_cost_cents),
    "Costo explícito requerido.",
  );
  return {
    id: identifier(input.id),
    micro_ingredient_id: identifier(input.micro_ingredient_id),
    version: integer(input.version, "Versión", true),
    quantity_grams: integer(input.quantity_grams, "Gramos"),
    unit_cost_cents: input.unit_cost_cents === null ? null : integer(input.unit_cost_cents, "Costo"),
    cutoff_date: date(input.cutoff_date),
  };
}
function initial(opening) {
  let value = null;
  if (opening.quantity_grams === 0) value = zero();
  else if (opening.unit_cost_cents !== null)
    value = fraction(BigInt(opening.quantity_grams) * BigInt(opening.unit_cost_cents), BigInt(1000));
  return {
    contract_version: 1,
    opening,
    revision: 0,
    quantity_grams: opening.quantity_grams,
    value_cents: value,
    issued_exact_cents: zero(),
    issued_posted_cents: "0",
    rounding_carry_cents: zero(),
    events: [],
  };
}
function eventInput(input) {
  requireValue(input && typeof input === "object" && !Array.isArray(input), "Evento requerido.");
  requireValue(typeof input.date === "string", "Fecha de evento explícita requerida.");
  const keys = [
    "id",
    "request_id",
    "micro_ingredient_id",
    "type",
    "date",
    "quantity_grams",
    "expected_revision",
  ];
  requireValue(["RECEIPT", "ISSUE"].includes(input.type), "Evento de valoración no admitido.");
  if (input.type === "RECEIPT") keys.push("total_cost_cents");
  requireValue(
    Object.keys(input).length === keys.length && keys.every((key) => Object.hasOwn(input, key)),
    "Contrato de evento inválido; no admite gastos ni campos adicionales.",
  );
  const result = {
    id: identifier(input.id),
    request_id: identifier(input.request_id),
    micro_ingredient_id: identifier(input.micro_ingredient_id),
    type: input.type,
    date: date(input.date),
    quantity_grams: integer(input.quantity_grams, "Gramos", true),
    expected_revision: integer(input.expected_revision, "Revisión"),
  };
  if (input.type === "RECEIPT")
    result.total_cost_cents = integer(input.total_cost_cents, "Costo de recepción");
  return result;
}
function advance(ledger, input, actorId, identities) {
  requireValue(ledger.events.length < MAX_EVENTS, "Límite de eventos alcanzado.");
  requireValue(input.micro_ingredient_id === ledger.opening.micro_ingredient_id, "Ficha incorrecta.");
  const previousDate = ledger.events.at(-1)?.input.date ?? ledger.opening.cutoff_date;
  requireValue(
    input.date > ledger.opening.cutoff_date && input.date >= previousDate,
    "Evento anterior al corte o al último movimiento.",
  );
  requireValue(input.expected_revision === ledger.revision, "Revisión obsoleta; recargue.");
  requireValue(
    !identities.ids.has(input.id) && !identities.requests.has(input.request_id),
    "ID o request_id ya registrado.",
  );
  requireValue(
    ledger.value_cents !== null,
    "Apertura sin costo probado; corrija antes de registrar eventos.",
  );
  // This accumulator is rebuilt privately. Never mutate the caller's ledger.
  const next = ledger;
  let snapshot = null;
  if (input.type === "RECEIPT") {
    next.quantity_grams = integer(ledger.quantity_grams + input.quantity_grams, "Saldo gramos");
    next.value_cents = add(ledger.value_cents, fraction(BigInt(input.total_cost_cents)));
  } else {
    requireValue(input.quantity_grams <= ledger.quantity_grams, "Stock insuficiente.");
    const cost = prorate(ledger.value_cents, input.quantity_grams, ledger.quantity_grams);
    const cumulative = add(ledger.issued_exact_cents, cost);
    const posted = round(cumulative);
    snapshot = {
      average_cents_per_kg: prorate(ledger.value_cents, 1000, ledger.quantity_grams),
      exact_cost_cents: cost,
      posted_cost_cents: String(posted - BigInt(ledger.issued_posted_cents)),
    };
    next.quantity_grams -= input.quantity_grams;
    next.value_cents = subtract(ledger.value_cents, cost);
    next.issued_exact_cents = cumulative;
    next.issued_posted_cents = String(posted);
    next.rounding_carry_cents = subtract(cumulative, fraction(posted));
  }
  requireValue(
    BigInt(next.value_cents.n) >= 0 && (next.quantity_grams !== 0 || next.value_cents.n === "0"),
    "Saldo inconsistente.",
  );
  // Every accepted balance must remain readable and usable by the next issue.
  if (next.quantity_grams > 0) prorate(next.value_cents, 1000, next.quantity_grams);
  next.revision++;
  next.events.push({ input, actor_id: actorId, revision: next.revision, snapshot });
  identities.ids.add(input.id);
  identities.requests.add(input.request_id);
  return next;
}
// Rebuild checks every immutable snapshot before accepting deserialized persistence.
function validated(ledger) {
  requireValue(
    ledger && Array.isArray(ledger.events) && ledger.events.length <= MAX_EVENTS,
    "Libro inválido.",
  );
  let rebuilt = initial(openingSnapshot(ledger.opening));
  const identities = { ids: new Set(), requests: new Set() };
  for (const event of ledger.events)
    rebuilt = advance(rebuilt, eventInput(event.input), identifier(event.actor_id), identities);
  requireValue(JSON.stringify(ledger) === JSON.stringify(rebuilt), "Libro alterado o versión incompatible.");
  return rebuilt;
}

export function createValuation(opening, actor) {
  permission(actor, true);
  return initial(openingSnapshot(opening));
}
export function applyValuation(ledger, event, actor) {
  permission(actor, true);
  const current = validated(ledger);
  const input = eventInput(event);
  const duplicate = current.events.find((row) => row.input.request_id === input.request_id);
  if (duplicate) {
    requireValue(
      duplicate.actor_id === actor.id && JSON.stringify(duplicate.input) === JSON.stringify(input),
      "Reintento con identidad o datos diferentes.",
    );
    return current;
  }
  return advance(current, input, actor.id, {
    ids: new Set(current.events.map((row) => row.input.id)),
    requests: new Set(current.events.map((row) => row.input.request_id)),
  });
}
export function inspectValuation(ledger, actor) {
  permission(actor, false);
  const current = validated(ledger);
  return {
    ...current,
    average_cents_per_kg:
      current.quantity_grams === 0 || current.value_cents === null
        ? null
        : prorate(current.value_cents, 1000, current.quantity_grams),
  };
}
export function assertValuationOpening(ledger, opening, actor) {
  permission(actor, false);
  const current = validated(ledger);
  requireValue(
    JSON.stringify(current.opening) === JSON.stringify(openingSnapshot(opening)),
    "Apertura distinta; no reconstruir ni recostear eventos cerrados.",
  );
}
