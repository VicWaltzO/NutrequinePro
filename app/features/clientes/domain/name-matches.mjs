/** Comparison only; never persist this value as the customer's name. */
export function normalizeCustomerName(name) {
  return String(name ?? "")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}

// One insertion, deletion, substitution or adjacent transposition. Long alphabetic
// tokens only: short names and identifiers/numbers are never fuzzy-matched.
function smallTypo(a, b) {
  if (!/^\p{L}{5,}$/u.test(a) || !/^\p{L}{5,}$/u.test(b) || Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  while (i < a.length && a[i] === b[i]) i++;
  if (a.length === b.length) {
    return (
      a.slice(i + 1) === b.slice(i + 1) ||
      (a[i] === b[i + 1] && a[i + 1] === b[i] && a.slice(i + 2) === b.slice(i + 2))
    );
  }
  return a.length > b.length ? a.slice(i + 1) === b.slice(i) : a.slice(i) === b.slice(i + 1);
}

function matchKind(name, candidate) {
  if (name === candidate) return "exact";
  const a = name.split(" ").sort();
  const b = candidate.split(" ").sort();
  if (a.length !== b.length || a.length < 2) return null;
  const different = a.map((token, i) => [token, b[i]]).filter(([x, y]) => x !== y);
  if (!different.length) return "similar";
  return different.length === 1 && smallTypo(...different[0]) ? "similar" : null;
}

/** @template {{ id: string, name: string }} T
 * @param {T[]} customers @param {string} name @param {string | undefined} [excludeId]
 */
export function customerNameMatches(customers, name, excludeId) {
  const normalized = normalizeCustomerName(name);
  if (!normalized) return [];
  return customers
    .filter((customer) => customer.id !== excludeId)
    .flatMap((customer) => {
      const kind = matchKind(normalized, normalizeCustomerName(customer.name));
      return kind ? [{ customer, kind }] : [];
    })
    .sort((a, b) => {
      if (a.kind !== b.kind) return a.kind === "exact" ? -1 : 1;
      if (a.customer.id < b.customer.id) return -1;
      if (a.customer.id > b.customer.id) return 1;
      return 0;
    });
}

/** The server recomputes this explicit review of candidates against current state.
 * @param {import("../../../shared/types/domain.ts").Customer[]} customers
 * @param {string} name @param {string | undefined} [excludeId]
 */
export function customerDuplicateReview(customers, name, excludeId) {
  return JSON.stringify([
    name,
    excludeId ?? null,
    customerNameMatches(customers, name, excludeId).map(({ customer, kind }) => [
      customer.id,
      customer.name,
      customer.is_active,
      customer.deleted_at ?? null,
      kind,
    ]),
  ]);
}
