import { pick, requireValue, date } from "../../../shared/domain/core.mjs";
import { nucleusHundredths } from "../../../shared/domain/production-quantities.mjs";
import { activeAssignment, assignedHundredths } from "./assignment-balances.mjs";
import { preparationAuthorization, validatePreparationPolicies } from "./preparations.mjs";
import {
  createIssueValuation,
  issueValuation,
  assertValuationOpening,
  valuationHundredths,
  summarizeIssueCosts,
} from "./valuation.mjs";

export function microPreparationConfirm({
  s,
  p,
  actor,
  clock,
  add,
  uid,
  request_id,
  microPreparationPolicies,
}) {
  requireValue(
    p && Object.keys(p).every((k) => ["preparation_id", "nuclei", "date", "expected_revision"].includes(k)),
    "Campo de confirmación no permitido.",
  );
  requireValue(
    Number.isSafeInteger(p.expected_revision) && p.expected_revision === s.revision,
    "Los datos cambiaron. Recargue antes de confirmar.",
  );
  requireValue(
    typeof request_id === "string" && /^[A-Za-z0-9_.:-]{1,100}$/.test(request_id),
    "Identificador de operación inválido.",
  );
  const order = pick(s, "microPreparations", p.preparation_id);
  requireValue(
    !s.microSupersessions.some((e) => e.source_id === order.id),
    "Preparación supersedida; use la orden sucesora.",
  );
  requireValue(
    !s.microConfirmations.some((c) => c.preparation_id === order.id),
    "Preparación cerrada definitivamente.",
  );
  const assignment = activeAssignment(s, order.id);
  requireValue(assignment, "La preparación requiere una asignación vigente.");
  const formula = pick(s, "microFormulas", order.formula_id);
  const approval = preparationAuthorization(
    s,
    formula,
    validatePreparationPolicies(microPreparationPolicies),
  );
  requireValue(approval && formula.family === order.family, "Fórmula histórica sin política privada válida.");
  requireValue(typeof p.nuclei === "string", "Cantidad real debe ser decimal explícito.");
  const nuclei = nucleusHundredths(p.nuclei);
  requireValue(
    nuclei > 0 && nuclei <= order.nuclei_hundredths,
    "Cantidad real debe ser positiva y no superar lo planificado.",
  );
  requireValue(typeof p.date === "string", "Fecha real requerida.");
  const eventDate = date(p.date);
  requireValue(eventDate <= clock.slice(0, 10), "La fecha real no puede ser futura.");
  const recipe = s.microFormulaLines.filter((l) => l.formula_id === formula.id);
  const assigned = s.microAssignmentLines.filter((l) => l.assignment_id === assignment.id);
  requireValue(recipe.length > 0 && recipe.length === assigned.length, "Asignación incompleta.");
  const rows = recipe.map((line) => {
    requireValue(pick(s, "microIngredients", line.micro_ingredient_id).is_active, "Microinsumo inactivo.");
    const assignmentLine = assigned.find(
      (a) => a.formula_line_id === line.id && a.micro_ingredient_id === line.micro_ingredient_id,
    );
    const quantity = line.dose_grams * nuclei;
    requireValue(
      Number.isSafeInteger(quantity) && quantity > 0 && quantity <= 1e14,
      "Dosis fuera de rango; no se redondeó.",
    );
    requireValue(
      assignmentLine &&
        assignmentLine.quantity_hundredths === line.dose_grams * order.nuclei_hundredths &&
        quantity <= assignmentLine.quantity_hundredths,
      "Asignación no corresponde a la fórmula histórica.",
    );
    const opening = s.microOpenings.find((o) => o.micro_ingredient_id === line.micro_ingredient_id);
    requireValue(opening, "Falta apertura validada.");
    const ledgerRow = s.microLedgers.find((l) => l.micro_ingredient_id === line.micro_ingredient_id);
    const ledger = ledgerRow?.ledger ?? createIssueValuation(opening, actor);
    assertValuationOpening(ledger, opening, actor);
    requireValue(
      valuationHundredths(ledger) >= assignedHundredths(s, line.micro_ingredient_id),
      "Saldo físico inferior a compromisos vigentes.",
    );
    const id = uid();
    const next = issueValuation(
      ledger,
      {
        id,
        request_id,
        micro_ingredient_id: line.micro_ingredient_id,
        type: "ISSUE",
        date: eventDate,
        quantity_hundredths: quantity,
        expected_revision: ledger.revision,
      },
      actor,
    );
    return { line, assignmentLine, opening, ledgerRow, next, id, quantity };
  });
  const costs = summarizeIssueCosts(
    rows.map((r) => r.next.events.at(-1).snapshot.exact_cost_cents),
    nuclei,
  );
  const confirmation = add("microConfirmations", {
    preparation_id: order.id,
    assignment_id: assignment.id,
    formula_id: formula.id,
    request_id,
    nuclei_hundredths: nuclei,
    date: eventDate,
    authorization_reference: approval.reference,
    ...costs,
    posted_cost_cents: String(
      rows.reduce((sum, r) => sum + BigInt(r.next.events.at(-1).snapshot.posted_cost_cents), 0n),
    ),
  });
  for (const r of rows) {
    const ledgerRow =
      r.ledgerRow ??
      add("microLedgers", {
        micro_ingredient_id: r.line.micro_ingredient_id,
        opening_id: r.opening.id,
        ledger: r.next,
      });
    if (r.ledgerRow) Object.assign(ledgerRow, { ledger: r.next, updated_at: clock });
    add("microIssues", {
      id: r.id,
      confirmation_id: confirmation.id,
      assignment_line_id: r.assignmentLine.id,
      formula_line_id: r.line.id,
      micro_ingredient_id: r.line.micro_ingredient_id,
      ledger_id: ledgerRow.id,
      request_id,
      revision: r.next.revision,
      quantity_hundredths: r.quantity,
      released_hundredths: r.assignmentLine.quantity_hundredths - r.quantity,
      event: r.next.events.at(-1),
    });
  }
  return confirmation.id;
}
