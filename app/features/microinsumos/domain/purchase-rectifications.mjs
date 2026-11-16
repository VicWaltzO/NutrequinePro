import { pick, requireValue, text, date, roundedProduct, safe } from "../../../shared/domain/core.mjs";
import { receiptAmounts } from "./operational-purchases.mjs";
import { applyValuation, valuationHundredths } from "./valuation.mjs";
import { assignedHundredths } from "./assignment-balances.mjs";
import { assertDraftChronology, draftOpeningState } from "./draft-opening-history.mjs";

export const PURCHASE_RECTIFY = "MICRO_RECEIPT_RECTIFY";
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const stableExpense = ({ amount: _amount, updated_at: _updated, ...rest }) => rest;
const currentLines = (s, id) => s.microReceiptLines.filter((l) => l.receipt_id === id && l.is_current);
const history = (s, id) =>
  s.corrections
    .filter((r) => r.entity_type === PURCHASE_RECTIFY && r.entity_id === id)
    .sort((a, b) => a.new_snapshot.receipt.version - b.new_snapshot.receipt.version);
const snapshot = (receipt, lines) =>
  structuredClone({
    receipt,
    lines: [...lines].sort((a, b) => a.micro_ingredient_id.localeCompare(b.micro_ingredient_id)),
  });

export function microReceiptRectify({ s, p, actor, clock, request_id, add, correction }) {
  requireValue(
    actor.is_active === true && actor.role === "ADMIN",
    "La corrección de compras requiere administrador.",
  );
  requireValue(
    p &&
      Object.keys(p).every((k) =>
        [
          "id",
          "expected_version",
          "expected_revision",
          "date",
          "reason",
          "reference",
          "total",
          "discount",
          "lines",
        ].includes(k),
      ),
    "Campo de corrección de compra no permitido.",
  );
  requireValue(
    Number.isSafeInteger(p.expected_revision) && p.expected_revision === s.revision,
    "Los datos cambiaron. Recargue antes de corregir.",
  );
  requireValue(
    typeof request_id === "string" && /^[A-Za-z0-9_.:-]{1,100}$/.test(request_id),
    "Identificador de corrección inválido.",
  );
  const receipt = pick(s, "microReceipts", p.id);
  requireValue(
    receipt.status === "CONFIRMED" && receipt.version === p.expected_version,
    "Compra no confirmada o versión obsoleta.",
  );
  requireValue(
    typeof p.date === "string" && typeof p.reason === "string" && typeof p.reference === "string",
    "Fecha, motivo y referencia explícitos requeridos.",
  );
  const day = date(p.date);
  const reason = text(p.reason, "Motivo");
  const reference = text(p.reference, "Referencia de corrección");
  requireValue(
    day >= receipt.document_date && day <= clock.slice(0, 10),
    "Fecha de corrección anterior a compra o futura.",
  );
  const { total, discount, lines } = receiptAmounts(s, p, receipt.document_date);
  const oldLines = currentLines(s, receipt.id);
  requireValue(
    lines.length === oldLines.length &&
      lines.every((l) => oldLines.some((o) => o.micro_ingredient_id === l.micro_ingredient_id)),
    "Conserve los ingredientes del comprobante original.",
  );
  const expense = pick(s, "expenses", receipt.expense_id);
  requireValue(
    expense.status === "CONFIRMED" &&
      expense.amount === receipt.total_cents &&
      expense.date === receipt.document_date &&
      !expense.production_id &&
      !expense.production_cost_id &&
      !expense.sale_id &&
      !expense.site_id &&
      !expense.ingredient_id,
    "Gasto vinculado incompatible.",
  );
  const before = snapshot(receipt, oldLines);
  const differences = [];
  requireValue(
    lines.some((l) => {
      const old = oldLines.find((o) => o.micro_ingredient_id === l.micro_ingredient_id);
      return ["quantity_grams", "unit_price_cents", "amount_cents", "discount_cents"].some(
        (k) => l[k] !== old[k],
      );
    }),
    "Corrección sin diferencias documentales.",
  );
  const newLines = lines.map((values) => {
    const old = oldLines.find((o) => o.micro_ingredient_id === values.micro_ingredient_id);
    const quantity = values.quantity_grams - old.quantity_grams;
    const cost = values.total_cost_cents - old.total_cost_cents;
    const line = add("microReceiptLines", {
      ...values,
      receipt_id: receipt.id,
      is_current: true,
      version: receipt.version + 1,
    });
    const events = [];
    if (quantity !== 0 || cost !== 0) {
      const row = s.microLedgers.find((l) => l.micro_ingredient_id === values.micro_ingredient_id);
      requireValue(row, "Libro de compra inexistente.");
      requireValue(
        valuationHundredths(row.ledger) + quantity * 100 >= assignedHundredths(s, values.micro_ingredient_id),
        "Saldo libre insuficiente: ingredientes comprometidos o consumidos.",
      );
      row.ledger = applyValuation(
        row.ledger,
        {
          id: line.id,
          request_id,
          micro_ingredient_id: values.micro_ingredient_id,
          type: "PURCHASE_ADJUSTMENT",
          date: day,
          quantity_grams: quantity,
          expected_revision: row.ledger.revision,
          cost_delta_cents: cost,
          receipt_id: receipt.id,
        },
        actor,
      );
      row.updated_at = clock;
      events.push(row.ledger.events.at(-1));
    }
    differences.push({
      micro_ingredient_id: values.micro_ingredient_id,
      old_line_id: old.id,
      new_line_id: line.id,
      quantity_delta_grams: quantity,
      cost_delta_cents: cost,
      events,
    });
    return line;
  });
  for (const line of oldLines) line.is_current = false;
  Object.assign(receipt, {
    total_cents: total,
    discount_cents: discount,
    version: receipt.version + 1,
    updated_at: clock,
  });
  if (expense.amount !== total) {
    correction(
      "EXPENSE",
      expense.id,
      structuredClone(expense),
      { ...expense, amount: total, updated_at: clock },
      reason,
    );
    Object.assign(expense, { amount: total, updated_at: clock });
  }
  return correction(
    PURCHASE_RECTIFY,
    receipt.id,
    before,
    {
      ...snapshot(receipt, newLines),
      differences,
      request_id,
      date: day,
      reference,
      policy: "PROSPECTIVE_REMAINDER_V1",
    },
    reason,
  ).id;
}

function assertDocumentSnapshot(value) {
  const { receipt, lines } = value;
  requireValue(
    Array.isArray(lines) &&
      lines.length > 0 &&
      new Set(lines.map((l) => l.micro_ingredient_id)).size === lines.length,
    "Renglones documentales duplicados.",
  );
  let gross = 0;
  let discount = 0;
  for (const l of lines) {
    for (const k of [
      "quantity_grams",
      "unit_price_cents",
      "amount_cents",
      "discount_cents",
      "total_cost_cents",
    ])
      requireValue(
        Number.isSafeInteger(l[k]) && l[k] >= 0 && l[k] <= 1e12,
        "Importe o cantidad documental inválido.",
      );
    requireValue(
      l.quantity_grams > 0 &&
        l.version === receipt.version &&
        l.receipt_id === receipt.id &&
        l.is_current === true &&
        roundedProduct(l.quantity_grams, l.unit_price_cents, 1000) === l.amount_cents &&
        l.discount_cents <= l.amount_cents &&
        l.total_cost_cents === l.amount_cents - l.discount_cents,
      "Renglón documental no concilia.",
    );
    gross = safe(gross + l.amount_cents);
    discount = safe(discount + l.discount_cents);
  }
  requireValue(
    receipt.total_cents === gross - discount &&
      receipt.discount_cents === discount &&
      receipt.status === "CONFIRMED",
    "Total documental original o corregido no concilia.",
  );
}

// Reconstruct the documentary chain and match every adjustment to one audit and
// one immutable ledger event. Array order in imports is not authoritative.
export function assertPurchaseRectificationIntegrity(before, s) {
  const corrections = s.corrections.filter((r) => r.entity_type === PURCHASE_RECTIFY);
  const usedEvents = new Set();
  const usedReceiptEvents = new Set();
  const usedExpenseCorrections = new Set();
  for (const old of before?.corrections.filter((r) => r.entity_type === PURCHASE_RECTIFY) ?? [])
    requireValue(
      same(
        corrections.find((r) => r.id === old.id),
        old,
      ),
      "Corrección de compra histórica inmutable.",
    );
  for (const old of before?.microReceipts.filter((r) => r.status === "CONFIRMED") ?? []) {
    const row = s.microReceipts.find((r) => r.id === old.id);
    requireValue(row && row.status === "CONFIRMED", "Compra confirmada permanente.");
    for (const k of [
      "id",
      "document_key",
      "supplier",
      "reference",
      "source",
      "document_date",
      "expense_id",
      "request_id",
      "currency",
      "payment_method",
      "created_at",
      "created_by",
    ])
      requireValue(same(row[k], old[k]), "Identidad de comprobante inmutable.");
    requireValue(row.version !== old.version || same(row, old), "Compra alterada sin corrección.");
    const oldHistory = history(before, old.id);
    const newHistory = history(s, old.id);
    requireValue(
      row.version - old.version === newHistory.length - oldHistory.length,
      "Versión de compra sin corrección.",
    );
  }
  for (const old of before?.microReceiptLines ?? []) {
    const line = s.microReceiptLines.find((l) => l.id === old.id);
    requireValue(
      line && same({ ...line, is_current: old.is_current }, old) && (!line.is_current || old.is_current),
      "Renglón histórico de compra inmutable.",
    );
  }
  for (const receipt of s.microReceipts.filter((r) => r.status === "CONFIRMED")) {
    const chain = history(s, receipt.id);
    const original = chain[0]?.old_snapshot ?? snapshot(receipt, currentLines(s, receipt.id));
    assertDocumentSnapshot(original);
    const confirmations = s.audit.filter(
      (a) =>
        a.action === "MICRO_RECEIPT_SAVE" &&
        a.entity_id === receipt.id &&
        a.payload.status === "CONFIRMED" &&
        (a.payload.expected_version ?? 0) + 1 === original.receipt.version,
    );
    const confirmation = confirmations[0];
    requireValue(
      confirmations.length === 1 && confirmation.actor_role === "ADMIN",
      "Falta auditoría de recepción original.",
    );
    assertDraftChronology(s, receipt, confirmation, original.receipt.version);
    const originalPayload = confirmation.payload;
    const canonical = (value) =>
      value.normalize("NFKC").trim().replace(/\s+/gu, " ").toLocaleUpperCase("es-PE");
    requireValue(
      originalPayload.supplier.trim() === receipt.supplier &&
        originalPayload.reference.trim() === receipt.reference &&
        originalPayload.document_date.trim() === receipt.document_date &&
        originalPayload.source.trim() === receipt.source &&
        receipt.document_key ===
          JSON.stringify(["DOCUMENT", canonical(receipt.supplier), canonical(receipt.reference)]),
      "Identidad original sin auditoría concordante.",
    );
    const originalAmounts = receiptAmounts(
      { ...s, microIngredients: s.microIngredients.map((m) => ({ ...m, is_active: true })) },
      originalPayload,
      receipt.document_date,
    );
    requireValue(
      originalAmounts.total === original.receipt.total_cents &&
        originalAmounts.discount === original.receipt.discount_cents &&
        originalAmounts.lines.length === original.lines.length &&
        original.lines.every((l) => {
          const value = originalAmounts.lines.find((v) => v.micro_ingredient_id === l.micro_ingredient_id);
          return value && Object.keys(value).every((k) => same(value[k], l[k]));
        }),
      "Recepción original no concuerda con auditoría.",
    );
    const linkedExpense = s.expenses.find((e) => e.id === receipt.expense_id);
    requireValue(
      linkedExpense &&
        linkedExpense.description === `Compra operativa de microinsumos: ${receipt.reference}` &&
        linkedExpense.notes === receipt.source &&
        linkedExpense.category === "OTHER" &&
        linkedExpense.date === receipt.document_date &&
        !linkedExpense.production_id &&
        !linkedExpense.production_cost_id &&
        !linkedExpense.sale_id &&
        !linkedExpense.site_id &&
        !linkedExpense.ingredient_id,
      "Metadatos del gasto de compra alterados.",
    );
    const coveredLines = new Set(original.lines.map((l) => l.id));
    let previous = original;
    for (const row of chain) {
      const n = row.new_snapshot;
      assertDocumentSnapshot(n);
      for (const l of n.lines) coveredLines.add(l.id);
      if (n.receipt.total_cents !== previous.receipt.total_cents) {
        const expenses = s.corrections.filter(
          (e) =>
            e.entity_type === "EXPENSE" &&
            e.entity_id === receipt.expense_id &&
            e.created_by === row.created_by &&
            e.created_at === row.created_at &&
            e.reason === row.reason &&
            e.old_snapshot.id === receipt.expense_id &&
            e.new_snapshot.id === receipt.expense_id &&
            e.old_snapshot.amount === previous.receipt.total_cents &&
            e.new_snapshot.amount === n.receipt.total_cents &&
            !usedExpenseCorrections.has(e.id),
        );
        requireValue(expenses.length > 0, "Falta evidencia de corrección del gasto vinculado.");
        const e = expenses[0];
        requireValue(
          same(stableExpense(e.old_snapshot), stableExpense(linkedExpense)) &&
            same(stableExpense(e.new_snapshot), stableExpense(linkedExpense)),
          "Evidencia económica de otro gasto.",
        );
        requireValue(
          same(
            { ...e.old_snapshot, amount: e.new_snapshot.amount, updated_at: e.new_snapshot.updated_at },
            e.new_snapshot,
          ),
          "Corrección económica altera gasto ajeno.",
        );
        usedExpenseCorrections.add(e.id);
      }
      requireValue(
        same(row.old_snapshot, previous) &&
          n.receipt.version === previous.receipt.version + 1 &&
          n.policy === "PROSPECTIVE_REMAINDER_V1",
        "Cadena de compra inválida.",
      );
      for (const k of Object.keys(previous.receipt).filter(
        (k) => !["version", "total_cents", "discount_cents", "updated_at"].includes(k),
      ))
        requireValue(same(n.receipt[k], previous.receipt[k]), "Identidad de compra alterada.");
      requireValue(
        typeof row.reason === "string" &&
          text(row.reason, "Motivo") === row.reason &&
          typeof n.reference === "string" &&
          text(n.reference, "Referencia") === n.reference,
        "Metadatos de compra inválidos.",
      );
      const audits = s.audit.filter((a) => a.action === PURCHASE_RECTIFY && a.entity_id === row.id);
      const a = audits[0];
      requireValue(
        audits.length === 1 &&
          a.created_by === row.created_by &&
          a.created_at === row.created_at &&
          a.actor_role === "ADMIN" &&
          a.request_id === n.request_id &&
          a.payload.id === receipt.id &&
          a.payload.expected_version === previous.receipt.version &&
          Number.isSafeInteger(a.payload.expected_revision) &&
          a.payload.expected_revision >= 0 &&
          a.payload.expected_revision < s.revision &&
          a.payload.date === n.date &&
          a.payload.reference.trim() === n.reference &&
          a.payload.reason.trim() === row.reason,
        "Auditoría de compra inválida.",
      );
      requireValue(
        date(n.date) >= receipt.document_date && n.date <= row.created_at.slice(0, 10),
        "Fecha de corrección inválida.",
      );
      const amounts = receiptAmounts(
        { ...s, microIngredients: s.microIngredients.map((m) => ({ ...m, is_active: true })) },
        a.payload,
        receipt.document_date,
      );
      requireValue(
        amounts.total === n.receipt.total_cents &&
          amounts.discount === n.receipt.discount_cents &&
          n.lines.length === previous.lines.length &&
          n.lines.length === amounts.lines.length &&
          n.differences.length === n.lines.length,
        "Importes de corrección inválidos.",
      );
      for (const line of n.lines) {
        const old = previous.lines.find((l) => l.micro_ingredient_id === line.micro_ingredient_id);
        const amount = amounts.lines.find((l) => l.micro_ingredient_id === line.micro_ingredient_id);
        const d = n.differences.find((d) => d.new_line_id === line.id);
        requireValue(
          old &&
            amount &&
            d &&
            line.receipt_id === receipt.id &&
            line.version === n.receipt.version &&
            line.is_current === true &&
            Object.keys(amount).every((k) => same(line[k], amount[k])) &&
            d.old_line_id === old.id &&
            d.micro_ingredient_id === line.micro_ingredient_id &&
            d.quantity_delta_grams === line.quantity_grams - old.quantity_grams &&
            d.cost_delta_cents === line.total_cost_cents - old.total_cost_cents,
          "Diferencias de compra inválidas.",
        );
        requireValue(
          same(
            s.microReceiptLines.find((l) => l.id === line.id),
            { ...line, is_current: line.version === receipt.version },
          ),
          "Renglón corregido inconsistente.",
        );
        const changed = d.quantity_delta_grams !== 0 || d.cost_delta_cents !== 0;
        requireValue(
          Array.isArray(d.events) && d.events.length === (changed ? 1 : 0),
          "Movimiento de compra incompleto.",
        );
        for (const event of d.events) {
          const ledger = s.microLedgers.find(
            (l) => l.micro_ingredient_id === line.micro_ingredient_id,
          )?.ledger;
          requireValue(
            !usedEvents.has(event.input.id) &&
              same(
                ledger?.events.find((e) => e.input.id === event.input.id),
                event,
              ) &&
              event.input.type === "PURCHASE_ADJUSTMENT" &&
              event.input.id === line.id &&
              event.input.receipt_id === receipt.id &&
              event.input.micro_ingredient_id === line.micro_ingredient_id &&
              event.input.request_id === n.request_id &&
              event.actor_id === row.created_by &&
              event.input.date === n.date &&
              event.input.quantity_grams === d.quantity_delta_grams &&
              event.input.cost_delta_cents === d.cost_delta_cents,
            "Evento de corrección inválido.",
          );
          usedEvents.add(event.input.id);
        }
      }
      previous = snapshot(n.receipt, n.lines);
    }
    requireValue(
      same(previous, snapshot(receipt, currentLines(s, receipt.id))),
      "Compra vigente sin cadena válida.",
    );
    let gross = 0;
    let discounts = 0;
    const lines = currentLines(s, receipt.id);
    requireValue(
      lines.length > 0 && new Set(lines.map((l) => l.micro_ingredient_id)).size === lines.length,
      "Renglones de compra duplicados.",
    );
    for (const line of lines) {
      requireValue(
        Number.isSafeInteger(line.quantity_grams) &&
          line.quantity_grams > 0 &&
          roundedProduct(line.quantity_grams, line.unit_price_cents, 1000) === line.amount_cents &&
          line.discount_cents >= 0 &&
          line.discount_cents <= line.amount_cents &&
          line.total_cost_cents === line.amount_cents - line.discount_cents,
        "Renglón de compra inválido.",
      );
      gross = safe(gross + line.amount_cents);
      discounts = safe(discounts + line.discount_cents);
    }
    const expense = s.expenses.find((e) => e.id === receipt.expense_id);
    requireValue(
      gross - discounts === receipt.total_cents &&
        discounts === receipt.discount_cents &&
        expense?.amount === receipt.total_cents &&
        expense.status === "CONFIRMED" &&
        expense.date === receipt.document_date,
      "Gasto único de compra inconsistente.",
    );
    for (const line of s.microReceiptLines.filter(
      (l) => l.receipt_id === receipt.id && !coveredLines.has(l.id),
    )) {
      requireValue(
        Number.isSafeInteger(line.version) &&
          line.version > 0 &&
          line.version < original.receipt.version &&
          line.is_current === false,
        "Renglón histórico sin versión documental.",
      );
      const drafts = s.audit.filter(
        (a) =>
          a.action === "MICRO_RECEIPT_SAVE" &&
          a.entity_id === receipt.id &&
          a.payload.status === "DRAFT" &&
          (a.payload.expected_version ?? 0) + 1 === line.version,
      );
      requireValue(drafts.length === 1, "Renglón histórico sin borrador auditable.");
      const draftLines = s.microReceiptLines.filter(
        (l) => l.receipt_id === receipt.id && l.version === line.version,
      );
      const values = receiptAmounts(
        {
          ...draftOpeningState(s, drafts[0], draftLines),
          microIngredients: s.microIngredients.map((m) => ({ ...m, is_active: true })),
        },
        drafts[0].payload,
        drafts[0].payload.document_date,
      ).lines;
      const value = values.find((l) => l.micro_ingredient_id === line.micro_ingredient_id);
      requireValue(
        value &&
          Object.keys(value).every((k) => same(value[k], line[k])) &&
          s.microReceiptLines.filter((l) => l.receipt_id === receipt.id && l.version === line.version)
            .length === values.length,
        "Borrador histórico adulterado.",
      );
    }
    for (const line of original.lines) {
      const stored = s.microReceiptLines.find((l) => l.id === line.id);
      const records = s.microValuationEvents.filter((e) => e.receipt_line_id === line.id);
      const event = records[0]?.event;
      if (records[0]) usedReceiptEvents.add(records[0].id);
      requireValue(
        stored &&
          same(stored, { ...line, is_current: chain.length === 0 }) &&
          records.length === 1 &&
          event?.input.type === "RECEIPT" &&
          event.actor_id === confirmation.created_by &&
          line.created_by === confirmation.created_by &&
          event.input.request_id === original.receipt.request_id &&
          event.input.id === line.id &&
          event.input.quantity_grams === line.quantity_grams &&
          event.input.total_cost_cents === line.total_cost_cents &&
          same(
            s.microLedgers
              .find((l) => l.id === records[0].ledger_id)
              ?.ledger.events.find((e) => e.input.id === line.id),
            event,
          ),
        "Recepción original alterada.",
      );
    }
  }
  requireValue(
    s.microValuationEvents.length === usedReceiptEvents.size &&
      s.microValuationEvents.every((e) => usedReceiptEvents.has(e.id)),
    "Evidencia de recepción huérfana.",
  );
  for (const l of s.microLedgers)
    for (const e of l.ledger.events.filter((e) => e.input.type === "RECEIPT"))
      requireValue(
        s.microValuationEvents.some((v) => v.ledger_id === l.id && same(v.event, e)),
        "Recepción sin evidencia documental.",
      );
  for (const row of corrections)
    requireValue(
      s.microReceipts.some((r) => r.id === row.entity_id && r.status === "CONFIRMED"),
      "Corrección de compra huérfana.",
    );
  for (const a of s.audit.filter((a) => a.action === PURCHASE_RECTIFY))
    requireValue(
      corrections.some((r) => r.id === a.entity_id),
      "Auditoría de compra huérfana.",
    );
  for (const ledger of s.microLedgers)
    for (const event of ledger.ledger.events.filter((e) => e.input.type === "PURCHASE_ADJUSTMENT"))
      requireValue(usedEvents.has(event.input.id), "Ajuste de compra huérfano.");
}
