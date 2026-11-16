import { requireValue } from "../../../shared/domain/core.mjs";
import { openingValues } from "./commands.mjs";

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const timestamp = (value) => {
  const time = Date.parse(value);
  requireValue(Number.isFinite(time), "Cronología de apertura inválida.");
  return time;
};
const matchesValues = (snapshot, payload) =>
  Object.entries(openingValues(payload)).every(([key, value]) => same(snapshot[key], value));

export function assertDraftChronology(s, receipt, confirmation, confirmedVersion) {
  const drafts = s.audit
    .filter(
      (a) => a.action === "MICRO_RECEIPT_SAVE" && a.entity_id === receipt.id && a.payload.status === "DRAFT",
    )
    .sort((a, b) => (a.payload.expected_version ?? 0) - (b.payload.expected_version ?? 0));
  requireValue(drafts.length === confirmedVersion - 1, "Versiones de borrador sin auditoría completa.");
  let previous = timestamp(receipt.created_at);
  const confirmedAt = timestamp(confirmation.created_at);
  for (const [index, draft] of drafts.entries()) {
    const at = timestamp(draft.created_at);
    requireValue(
      (draft.payload.expected_version ?? 0) === index &&
        at >= previous &&
        at <= confirmedAt &&
        (index !== 0 || (draft.created_at === receipt.created_at && draft.created_by === receipt.created_by)),
      "Versiones de borrador sin cronología concordante.",
    );
    previous = at;
  }
}

// A saved line is evidence to verify, never the authority for its own cutoff.
// Revision numbers order the chain; timestamps bound the versions available to
// the draft. Equal timestamps can occur within one millisecond.
export function draftOpeningState(s, audit, lines) {
  requireValue(audit.actor_role === "ADMIN", "Borrador sin auditoría administrativa.");
  const at = timestamp(audit.created_at);
  const openings = s.microOpenings.map((opening) => {
    const line = lines.find((l) => l.micro_ingredient_id === opening.micro_ingredient_id);
    if (!line) return opening;
    requireValue(
      line.created_at === audit.created_at && line.created_by === audit.created_by,
      "Borrador sin cronología auditable.",
    );
    if (opening.version === 1) return opening;
    const changes = s.corrections
      .filter((c) => c.entity_type === "MICRO_OPENING" && c.entity_id === opening.id)
      .sort((a, b) => a.old_snapshot.version - b.old_snapshot.version);
    requireValue(
      Number.isSafeInteger(opening.version) && changes.length === opening.version - 1,
      "Apertura histórica sin cadena auditada.",
    );
    const first = changes[0]?.old_snapshot;
    const originals = s.audit.filter((a) => a.action === "MICRO_OPEN" && a.entity_id === opening.id);
    const original = originals[0];
    requireValue(
      first?.version === 1 &&
        first.id === opening.id &&
        first.micro_ingredient_id === opening.micro_ingredient_id &&
        originals.length === 1 &&
        original.actor_role === "ADMIN" &&
        original.created_at === first.created_at &&
        original.created_by === first.created_by &&
        original.payload.micro_ingredient_id === opening.micro_ingredient_id &&
        matchesValues(first, original.payload),
      "Apertura original sin auditoría concordante.",
    );
    let previous = first;
    let since = timestamp(first.created_at);
    const candidates = [];
    for (const [index, change] of changes.entries()) {
      const next = change.new_snapshot;
      const audits = s.audit.filter(
        (a) =>
          a.action === "MICRO_CORRECT" &&
          a.entity_id === opening.id &&
          a.payload.expected_version === index + 1,
      );
      const evidence = audits[0];
      const until = timestamp(change.created_at);
      requireValue(
        same(change.old_snapshot, previous) &&
          previous.version === index + 1 &&
          next.version === index + 2 &&
          next.id === opening.id &&
          next.micro_ingredient_id === opening.micro_ingredient_id &&
          next.created_at === first.created_at &&
          next.created_by === first.created_by &&
          next.updated_at === change.created_at &&
          until >= since &&
          audits.length === 1 &&
          evidence.actor_role === "ADMIN" &&
          evidence.created_at === change.created_at &&
          evidence.created_by === change.created_by &&
          evidence.payload.id === opening.id &&
          evidence.payload.reason.trim() === change.reason &&
          matchesValues(next, evidence.payload),
        "Corrección de apertura sin auditoría concordante.",
      );
      if (since <= at && at <= until) candidates.push(previous);
      previous = next;
      since = until;
    }
    requireValue(same(previous, opening), "Apertura vigente sin cadena concordante.");
    if (since <= at) candidates.push(previous);
    const saved = candidates.find((candidate) => candidate.cutoff_date === line.cutoff_date_snapshot);
    requireValue(saved, "Corte de borrador sin evidencia histórica.");
    return saved;
  });
  return { ...s, microOpenings: openings };
}
