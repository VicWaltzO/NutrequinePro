import { requireValue } from "../../../shared/domain/core.mjs";
import { inspectValuation, summarizeIssueCosts } from "./valuation.mjs";

// Validate rational arithmetic in JavaScript/BigInt, never SQLite REAL arithmetic.
export function assertConfirmationIntegrity(state) {
  if (!state.microLedgers.length && !state.microConfirmations.length) return;
  const reader = state.users.find((u) => u.is_active === true);
  for (const row of state.microLedgers) inspectValuation(row.ledger, reader);
  for (const confirmation of state.microConfirmations) {
    const issues = state.microIssues.filter((i) => i.confirmation_id === confirmation.id);
    const assigned = state.microAssignmentLines.filter((l) => l.assignment_id === confirmation.assignment_id);
    requireValue(issues.length > 0 && issues.length === assigned.length, "Liquidación incompleta.");
    const snapshots = issues.map((i) => {
      const ledger = state.microLedgers.find((l) => l.id === i.ledger_id);
      const event = ledger?.ledger.events.find((e) => e.revision === i.revision);
      requireValue(
        event &&
          JSON.stringify(event) === JSON.stringify(i.event) &&
          event.input.type === "ISSUE" &&
          event.input.date === confirmation.date &&
          event.actor_id === confirmation.created_by,
        "Snapshot de salida inconsistente.",
      );
      return event.snapshot;
    });
    const costs = summarizeIssueCosts(
      snapshots.map((s) => s.exact_cost_cents),
      confirmation.nuclei_hundredths,
    );
    requireValue(
      JSON.stringify(costs.total_cost_cents) === JSON.stringify(confirmation.total_cost_cents) &&
        JSON.stringify(costs.unit_cost_cents) === JSON.stringify(confirmation.unit_cost_cents),
      "Costo agregado de confirmación inconsistente.",
    );
    requireValue(
      String(snapshots.reduce((sum, s) => sum + BigInt(s.posted_cost_cents), 0n)) ===
        confirmation.posted_cost_cents,
      "Costo contabilizado inconsistente.",
    );
  }
}
