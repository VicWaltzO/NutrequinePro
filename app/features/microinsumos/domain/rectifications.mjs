import { pick, requireValue, text, date } from "../../../shared/domain/core.mjs";
import { nucleusHundredths } from "../../../shared/domain/production-quantities.mjs";
import { assignedHundredths } from "./assignment-balances.mjs";
import { preparationAuthorization } from "./preparations.mjs";
import { issueValuation, returnIssueValuation, valuationHundredths } from "./valuation.mjs";

export const RECTIFICATION = "MICRO_PREPARATION_RECTIFY";
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
function fraction(n, d = 1n) {
  requireValue(d > 0n, "Divisor inválido.");
  const gcd = (a, b) => (b ? gcd(b, a % b) : a);
  const g = gcd(n < 0n ? -n : n, d) || 1n;
  const value = { n: String(n / g), d: String(d / g) };
  requireValue(value.n.length <= 256 && value.d.length <= 256, "Costo fuera de precisión exacta.");
  return value;
}
const plus = (a, b) =>
  fraction(BigInt(a.n) * BigInt(b.d) + BigInt(b.n) * BigInt(a.d), BigInt(a.d) * BigInt(b.d));
const times = (a, n, d = 1) => fraction(BigInt(a.n) * BigInt(n), BigInt(a.d) * BigInt(d));
export function rectificationHistory(s, preparationId) {
  return s.corrections
    .filter((r) => r.entity_type === RECTIFICATION && r.entity_id === preparationId)
    .sort((a, b) => a.code.localeCompare(b.code));
}
function originalSnapshot(confirmation) {
  return {
    version: 1,
    confirmation_id: confirmation.id,
    nuclei_hundredths: confirmation.nuclei_hundredths,
    usable_nuclei_hundredths: confirmation.nuclei_hundredths,
    total_cost_cents: confirmation.total_cost_cents,
    mode: "ORIGINAL",
    delta_cost_cents: null,
    lines: null,
    references: null,
    request_id: null,
    date: null,
    reference: null,
    recoverable: null,
    authorization_reference: null,
  };
}
export function correctedPreparation(s, confirmation) {
  return (
    rectificationHistory(s, confirmation.preparation_id).at(-1)?.new_snapshot ??
    originalSnapshot(confirmation)
  );
}
function references(s, preparationId, boundary = null, correctionCode = null) {
  // Imported arrays have no authoritative order. Global CAS revisions and server
  // timestamps establish the boundary; equal revisions are conservatively closed.
  const predates = (record, action) => {
    const audits = s.audit.filter((a) => a.action === action && a.request_id === record.request_id);
    requireValue(
      audits.length === 1 && Number.isSafeInteger(audits[0].payload.expected_revision),
      "Referencia sin auditoría de revisión válida.",
    );
    const audit = audits[0];
    requireValue(
      audit.created_at === record.created_at && audit.created_by === record.created_by,
      "Autoría de referencia inconsistente.",
    );
    return (
      !boundary ||
      audit.payload.expected_revision <= boundary.payload.expected_revision ||
      audit.created_at < boundary.created_at
    );
  };
  const allLinks = s.productionJourneyLinks.filter((l) => l.preparation_id === preparationId);
  const links = allLinks.filter((l) => predates(l, "JOURNEY_LINK"));
  const closures = s.millClosures.filter(
    (c) => allLinks.some((l) => l.line_id === c.line_id) && predates(c, "MILL_CLOSE"),
  );
  return {
    link_ids: links.map((l) => l.id),
    closure_ids: closures.map((c) => c.id),
    movement_ids: closures.map((c) => c.movement_id).filter(Boolean),
    commercial_event_ids: s.corrections
      .filter((c) => c.entity_type === "COMMERCIAL_COST" && (!correctionCode || c.code < correctionCode))
      .map((c) => c.id),
  };
}
// Consume the exact historical issues in reverse event order when undoing a quantity.
// Every return names its source; quantities already returned are never reusable twice.
function issueSources(s, confirmation, ingredientId) {
  const ids = new Set(s.microIssues.filter((i) => i.confirmation_id === confirmation.id).map((i) => i.id));
  for (const row of rectificationHistory(s, confirmation.preparation_id))
    for (const line of row.new_snapshot.lines ?? [])
      for (const event of line.events) if (event.input.type === "ISSUE") ids.add(event.input.id);
  const ledger = s.microLedgers.find((l) => l.micro_ingredient_id === ingredientId).ledger;
  return ledger.events
    .filter((e) => ids.has(e.input.id) && e.input.type === "ISSUE")
    .reverse()
    .map((event) => ({
      event,
      remaining:
        (event.input.quantity_hundredths ?? event.input.quantity_grams * 100) -
        ledger.events
          .filter((r) => r.input.type === "RETURN" && r.input.source_issue_id === event.input.id)
          .reduce((n, r) => n + r.input.quantity_hundredths, 0),
    }));
}
export function microPreparationRectify(c) {
  const { s, p, actor, clock, request_id, correction, uid } = c;
  requireValue(
    p &&
      Object.keys(p).every((k) =>
        [
          "preparation_id",
          "nuclei",
          "date",
          "reason",
          "reference",
          "recoverable",
          "expected_revision",
        ].includes(k),
      ),
    "Campo de rectificación no permitido.",
  );
  requireValue(
    actor.is_active === true && ["ADMIN", "OPERATOR"].includes(actor.role),
    "Rectificación no autorizada.",
  );
  requireValue(
    Number.isSafeInteger(p.expected_revision) && p.expected_revision === s.revision,
    "Los datos cambiaron. Recargue antes de rectificar.",
  );
  requireValue(
    typeof request_id === "string" && /^[A-Za-z0-9_.:-]{1,100}$/.test(request_id),
    "Identificador inválido.",
  );
  requireValue(
    typeof p.reason === "string" && typeof p.reference === "string",
    "Motivo y referencia deben ser textos explícitos.",
  );
  const reason = text(p.reason, "Motivo");
  const reference = text(p.reference, "Referencia documental");
  requireValue(
    typeof p.date === "string" && typeof p.nuclei === "string",
    "Fecha y cantidad explícitas requeridas.",
  );
  const day = date(p.date);
  requireValue(day <= clock.slice(0, 10), "Fecha futura no permitida.");
  const prep = pick(s, "microPreparations", p.preparation_id);
  requireValue(!s.microSupersessions.some((x) => x.source_id === prep.id), "Preparación sustituida.");
  const confirmation = s.microConfirmations.find((x) => x.preparation_id === prep.id);
  requireValue(
    confirmation,
    "Preparación abierta: confirme la cantidad real mediante el flujo de preparación.",
  );
  requireValue(day >= confirmation.date, "Fecha anterior a la preparación.");
  const approval = preparationAuthorization(
    s,
    pick(s, "microFormulas", prep.formula_id),
    c.microPreparationPolicies,
  );
  requireValue(approval, "Receta histórica sin autorización válida.");
  const before = correctedPreparation(s, confirmation);
  const nuclei = nucleusHundredths(p.nuclei);
  requireValue(
    nuclei > 0 && nuclei <= prep.nuclei_hundredths && nuclei !== before.nuclei_hundredths,
    "Cantidad debe ser positiva, distinta y no superar el plan original.",
  );
  const refs = references(s, prep.id);
  const auditOnly = refs.closure_ids.length > 0 || before.mode === "AUDIT_ONLY";
  requireValue(typeof p.recoverable === "boolean", "Declare recuperación física explícita.");
  requireValue(!auditOnly || p.recoverable === false, "Cierre comercial: sin devolución automática.");
  const delta = nuclei - before.nuclei_hundredths;
  if (!auditOnly) {
    requireValue(
      delta > 0 || p.recoverable === true,
      "Declare que las dosis sobrantes no se utilizaron y son recuperables.",
    );
    const linked = s.productionJourneyLinks
      .filter((l) => l.preparation_id === prep.id)
      .reduce((n, l) => n + l.nuclei_hundredths, 0);
    requireValue(
      linked <= nuclei,
      "Núcleos comprometidos: no se puede devolver la cantidad vinculada a jornadas.",
    );
  }
  let costDelta = fraction(0n);
  const lines = s.microIssues
    .filter((i) => i.confirmation_id === confirmation.id)
    .map((issue) => {
      const recipe = pick(s, "microFormulaLines", issue.formula_line_id);
      const quantity = recipe.dose_grams * Math.abs(delta);
      requireValue(
        Number.isSafeInteger(quantity) && quantity > 0 && quantity <= 1e14,
        "Cantidad fuera de precisión centesimal.",
      );
      const events = [];
      let cost = fraction(0n);
      if (auditOnly) {
        cost = times(issue.event.snapshot.exact_cost_cents, delta, confirmation.nuclei_hundredths);
      } else {
        const row = pick(s, "microLedgers", issue.ledger_id);
        requireValue(
          pick(s, "microIngredients", issue.micro_ingredient_id).is_active,
          "Microinsumo inactivo.",
        );
        if (delta > 0) {
          requireValue(
            valuationHundredths(row.ledger) - assignedHundredths(s, issue.micro_ingredient_id) >= quantity,
            "Saldo libre insuficiente para consumo diferencial.",
          );
          const id = uid();
          row.ledger = issueValuation(
            row.ledger,
            {
              id,
              request_id: id,
              type: "ISSUE",
              date: day,
              micro_ingredient_id: issue.micro_ingredient_id,
              quantity_hundredths: quantity,
              expected_revision: row.ledger.revision,
            },
            actor,
          );
          events.push(row.ledger.events.at(-1));
          cost = row.ledger.events.at(-1).snapshot.exact_cost_cents;
        } else {
          let remaining = quantity;
          for (const source of issueSources(s, confirmation, issue.micro_ingredient_id)) {
            const part = Math.min(remaining, source.remaining);
            if (!part) continue;
            const id = uid();
            row.ledger = returnIssueValuation(
              row.ledger,
              {
                id,
                request_id: id,
                type: "RETURN",
                source_issue_id: source.event.input.id,
                date: day,
                micro_ingredient_id: issue.micro_ingredient_id,
                quantity_hundredths: part,
                expected_revision: row.ledger.revision,
              },
              actor,
            );
            const event = row.ledger.events.at(-1);
            events.push(event);
            cost = plus(cost, times(event.snapshot.exact_cost_cents, -1));
            remaining -= part;
            if (!remaining) break;
          }
          requireValue(remaining === 0, "No existe consumo recuperable suficiente.");
        }
        row.updated_at = clock;
      }
      costDelta = plus(costDelta, cost);
      return {
        issue_id: issue.id,
        micro_ingredient_id: issue.micro_ingredient_id,
        quantity_delta_hundredths: recipe.dose_grams * delta,
        cost_delta_cents: cost,
        events,
      };
    });
  const total = auditOnly ? before.total_cost_cents : plus(before.total_cost_cents, costDelta);
  requireValue(BigInt(total.n) >= 0n, "Costo resultante negativo.");
  const next = {
    version: 1,
    confirmation_id: confirmation.id,
    nuclei_hundredths: nuclei,
    usable_nuclei_hundredths: auditOnly ? before.usable_nuclei_hundredths : nuclei,
    total_cost_cents: total,
    mode: auditOnly ? "AUDIT_ONLY" : "PHYSICAL",
    delta_cost_cents: costDelta,
    lines,
    references: refs,
    request_id,
    date: day,
    reference,
    recoverable: p.recoverable,
    authorization_reference: approval.reference,
  };
  return correction(RECTIFICATION, prep.id, structuredClone(before), next, reason).id;
}

export function assertRectificationIntegrity(before, s) {
  const histories = s.corrections.filter((r) => r.entity_type === RECTIFICATION);
  for (const old of before?.corrections.filter((r) => r.entity_type === RECTIFICATION) ?? [])
    requireValue(
      same(
        histories.find((r) => r.id === old.id),
        old,
      ),
      "Rectificación histórica inmutable.",
    );
  const eventIds = new Set();
  for (const confirmation of s.microConfirmations) {
    let previous = originalSnapshot(confirmation);
    const sources = new Set(
      s.microIssues.filter((i) => i.confirmation_id === confirmation.id).map((i) => i.id),
    );
    for (const row of rectificationHistory(s, confirmation.preparation_id)) {
      const n = row.new_snapshot;
      const prep = pick(s, "microPreparations", row.entity_id);
      requireValue(
        same(row.old_snapshot, previous) &&
          n.version === 1 &&
          n.confirmation_id === confirmation.id &&
          Number.isSafeInteger(n.nuclei_hundredths) &&
          n.nuclei_hundredths > 0 &&
          n.nuclei_hundredths <= prep.nuclei_hundredths &&
          n.nuclei_hundredths !== previous.nuclei_hundredths,
        "Cadena de rectificación inválida.",
      );
      requireValue(
        ["PHYSICAL", "AUDIT_ONLY"].includes(n.mode) &&
          (previous.mode !== "AUDIT_ONLY" || n.mode === "AUDIT_ONLY"),
        "Modo de rectificación inválido.",
      );
      const audit = s.audit.find((a) => a.entity_id === row.id && a.action === RECTIFICATION);
      requireValue(
        audit &&
          audit.created_by === row.created_by &&
          audit.created_at === row.created_at &&
          audit.request_id === n.request_id &&
          ["ADMIN", "OPERATOR"].includes(audit.actor_role) &&
          Number.isSafeInteger(audit.payload.expected_revision) &&
          audit.payload.expected_revision >= 0 &&
          audit.payload.expected_revision < s.revision &&
          audit.payload.preparation_id === row.entity_id &&
          nucleusHundredths(audit.payload.nuclei) === n.nuclei_hundredths &&
          audit.payload.reason.trim() === row.reason &&
          audit.payload.reference.trim() === n.reference &&
          audit.payload.date === n.date &&
          audit.payload.recoverable === n.recoverable,
        "Auditoría de rectificación inválida.",
      );
      text(n.authorization_reference, "Autorización");
      text(n.reference, "Referencia");
      text(row.reason, "Motivo");
      requireValue(
        date(n.date) >= confirmation.date && n.date <= row.created_at.slice(0, 10),
        "Fecha de rectificación inválida.",
      );
      const issues = s.microIssues.filter((i) => i.confirmation_id === confirmation.id);
      requireValue(
        Array.isArray(n.lines) &&
          n.lines.length === issues.length &&
          new Set(n.lines.map((l) => l.issue_id)).size === issues.length,
        "Diferencia incompleta.",
      );
      let total = fraction(0n);
      const delta = n.nuclei_hundredths - previous.nuclei_hundredths;
      for (const line of n.lines) {
        const issue = issues.find((i) => i.id === line.issue_id);
        requireValue(
          issue &&
            issue.micro_ingredient_id === line.micro_ingredient_id &&
            line.quantity_delta_hundredths ===
              pick(s, "microFormulaLines", issue.formula_line_id).dose_grams * delta &&
            Array.isArray(line.events),
          "Consumo diferencial inválido.",
        );
        let cost = fraction(0n);
        let quantity = 0;
        for (const event of line.events) {
          const stored = pick(s, "microLedgers", issue.ledger_id).ledger.events.find(
            (e) => e.input.id === event.input.id,
          );
          requireValue(
            n.mode === "PHYSICAL" &&
              same(stored, event) &&
              !eventIds.has(event.input.id) &&
              event.actor_id === row.created_by &&
              event.input.date === n.date &&
              event.input.micro_ingredient_id === line.micro_ingredient_id &&
              event.input.type === (delta > 0 ? "ISSUE" : "RETURN"),
            "Movimiento compensatorio inválido.",
          );
          if (delta < 0)
            requireValue(sources.has(event.input.source_issue_id), "Devolución de otra preparación.");
          else sources.add(event.input.id);
          eventIds.add(event.input.id);
          quantity += event.input.quantity_hundredths;
          cost = plus(cost, times(event.snapshot.exact_cost_cents, delta > 0 ? 1 : -1));
        }
        if (n.mode === "AUDIT_ONLY")
          cost = times(issue.event.snapshot.exact_cost_cents, delta, confirmation.nuclei_hundredths);
        requireValue(
          quantity === (n.mode === "PHYSICAL" ? Math.abs(line.quantity_delta_hundredths) : 0) &&
            same(cost, line.cost_delta_cents),
          "Costo compensatorio inválido.",
        );
        total = plus(total, cost);
      }
      requireValue(
        same(total, n.delta_cost_cents) &&
          same(
            n.total_cost_cents,
            n.mode === "PHYSICAL" ? plus(previous.total_cost_cents, total) : previous.total_cost_cents,
          ) &&
          n.usable_nuclei_hundredths ===
            (n.mode === "PHYSICAL" ? n.nuclei_hundredths : previous.usable_nuclei_hundredths),
        "Saldo compensatorio inválido.",
      );
      const refs = n.references;
      const expectedRefs = references(s, prep.id, audit, row.code);
      requireValue(same(refs, expectedRefs), "Referencias de cierre/jornada omitidas o alteradas.");
      requireValue(
        (expectedRefs.closure_ids.length > 0 || previous.mode === "AUDIT_ONLY") === (n.mode === "AUDIT_ONLY"),
        "Un cierre comercial impide compensación física.",
      );
      requireValue(
        refs &&
          Array.isArray(refs.link_ids) &&
          Array.isArray(refs.closure_ids) &&
          Array.isArray(refs.movement_ids) &&
          Array.isArray(refs.commercial_event_ids),
        "Referencias incompletas.",
      );
      for (const id of refs.link_ids)
        requireValue(
          s.productionJourneyLinks.some((l) => l.id === id && l.preparation_id === prep.id),
          "Vínculo inválido.",
        );
      for (const id of refs.closure_ids)
        requireValue(
          s.millClosures.some(
            (c) =>
              c.id === id &&
              refs.link_ids.some(
                (l) => s.productionJourneyLinks.find((x) => x.id === l)?.line_id === c.line_id,
              ),
          ),
          "Cierre inválido.",
        );
      for (const id of refs.movement_ids) pick(s, "inventoryMovements", id);
      for (const id of refs.commercial_event_ids) pick(s, "corrections", id);
      requireValue(
        n.mode !== "AUDIT_ONLY" || (n.recoverable === false && refs.closure_ids.length > 0),
        "Rectificación cerrada sin referencia.",
      );
      requireValue(
        n.mode !== "PHYSICAL" || (refs.closure_ids.length === 0 && (delta > 0 || n.recoverable === true)),
        "Devolución no autorizada.",
      );
      previous = n;
    }
    const links = s.productionJourneyLinks.filter((l) => l.preparation_id === confirmation.preparation_id);
    requireValue(
      links.reduce((n, l) => n + l.nuclei_hundredths, 0) <= previous.usable_nuclei_hundredths,
      "Asignación supera cantidad corregida.",
    );
  }
  requireValue(
    histories.every((r) => s.microConfirmations.some((c) => c.preparation_id === r.entity_id)),
    "Rectificación huérfana.",
  );
  for (const audit of s.audit.filter((a) => a.action === RECTIFICATION))
    requireValue(
      histories.some((r) => r.id === audit.entity_id),
      "Auditoría de rectificación sin registro.",
    );
  const originalIssueIds = new Set(s.microIssues.map((i) => i.id));
  for (const ledger of s.microLedgers)
    for (const event of ledger.ledger.events)
      if (
        event.input.type === "RETURN" ||
        (event.input.type === "ISSUE" && !originalIssueIds.has(event.input.id))
      )
        requireValue(eventIds.has(event.input.id), "Movimiento diferencial sin rectificación.");
}
