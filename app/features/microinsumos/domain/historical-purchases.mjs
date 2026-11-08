import {
  requireValue,
  text,
  scaled,
  date,
  pick,
  safe,
  roundedProduct,
} from "../../../shared/domain/core.mjs";

function fields(value, allowed) {
  requireValue(value && typeof value === "object" && !Array.isArray(value), "Datos documentales inválidos.");
  requireValue(
    Object.keys(value).every((key) => allowed.includes(key)),
    "Campo documental desconocido.",
  );
}
function literal(value, label, optional = false) {
  if (optional && (value == null || value === "")) return null;
  requireValue(typeof value === "string", `${label} debe ser texto.`);
  requireValue(
    ![...value].some((character) => character.codePointAt(0) < 32 || character.codePointAt(0) === 127),
    `${label} contiene caracteres inválidos.`,
  );
  return text(value, label);
}
function decimal(value, digits, optional = false) {
  if (optional && (value == null || value === "")) return null;
  requireValue(
    typeof value === "string" && /^\d+(\.\d+)?$/.test(value),
    "Use un decimal explícito con punto.",
  );
  return scaled(value, digits);
}
const canonical = (value) => value.normalize("NFKC").trim().replace(/\s+/gu, " ").toLocaleUpperCase("es-PE");

// This command writes only documentary rows and one financial fact, never stock.
export function historicalSave({ s, p, add, correction, clock }) {
  fields(p, [
    "id",
    "expected_version",
    "reason",
    "status",
    "document_kind",
    "supplier",
    "reference",
    "source",
    "document_date",
    "total",
    "discount",
    "payment_method",
    "existing_expense_id",
    "reviewed_expenses",
    "lines",
  ]);
  requireValue(["DRAFT", "CONFIRMED"].includes(p.status), "Estado documental inválido.");
  requireValue(["DOCUMENT", "MANUAL"].includes(p.document_kind), "Tipo de referencia inválido.");
  const current = p.id ? pick(s, "microPurchases", p.id) : null;
  requireValue(!current || current.status !== "CANCELLED", "El registro fue anulado; conserve su identidad.");
  if (current)
    requireValue(current.version === p.expected_version, "El registro cambió. Recargue antes de corregir.");
  const confirmed = p.status === "CONFIRMED";
  requireValue(
    !current || current.status !== "CONFIRMED" || confirmed,
    "No se puede devolver un gasto confirmado a borrador.",
  );
  const reference = literal(p.reference, "Referencia");
  const supplier = literal(p.supplier, "Proveedor", !confirmed || p.document_kind === "MANUAL");
  const documentKey = JSON.stringify([
    p.document_kind,
    p.document_kind === "MANUAL" ? "" : canonical(supplier ?? ""),
    canonical(reference),
  ]);
  requireValue(
    !s.microPurchases.some((row) => row.id !== current?.id && row.document_key === documentKey),
    "Comprobante o referencia ya registrado, incluso si fue anulado.",
  );
  requireValue(
    !s.microReceipts.some((row) => row.document_key === documentKey),
    "Comprobante ya registrado como compra operativa.",
  );
  const documentDate =
    p.document_date == null || p.document_date === "" ? null : date(literal(p.document_date, "Fecha"));
  const source = literal(p.source, "Fuente documental", !confirmed);
  const total = decimal(p.total, 2, !confirmed);
  const discount = decimal(p.discount, 2, true) ?? 0;
  requireValue(p.payment_method === "CASH", "Solo se admite pago histórico al contado.");
  requireValue(
    Array.isArray(p.lines) && p.lines.length <= 100 && (!confirmed || p.lines.length > 0),
    "Incluya de 1 a 100 renglones al confirmar.",
  );
  let allAmounts = true;
  let gross = 0;
  const lines = p.lines.map((line) => {
    fields(line, ["micro_ingredient_id", "quantity_kg", "unit_price", "amount"]);
    const micro = pick(s, "microIngredients", literal(line.micro_ingredient_id, "Microinsumo"));
    const opening = s.microOpenings.find((row) => row.micro_ingredient_id === micro.id);
    const quantity = decimal(line.quantity_kg, 3, !confirmed);
    if (quantity !== null) requireValue(quantity > 0, "La cantidad documental debe ser mayor que cero.");
    if (documentDate && opening)
      requireValue(documentDate <= opening.cutoff_date, "Compra posterior al corte: corresponde a NQP26-22.");
    if (confirmed) {
      requireValue(documentDate && opening, "Fecha y corte individual obligatorios al confirmar.");
      requireValue(documentDate <= opening.cutoff_date, "Compra posterior al corte: corresponde a NQP26-22.");
    }
    const unitPrice = decimal(line.unit_price, 2, true);
    let amount = decimal(line.amount, 2, true);
    if (unitPrice !== null && quantity !== null) {
      const calculated = roundedProduct(quantity, unitPrice, 1000);
      requireValue(
        amount === null || amount === calculated,
        "Importe del renglón no concilia con kg y precio.",
      );
      amount = calculated;
    }
    if (amount === null) allAmounts = false;
    else gross = safe(gross + amount);
    return {
      micro_ingredient_id: micro.id,
      quantity_grams: quantity,
      unit_price_cents: unitPrice,
      amount_cents: amount,
      cutoff_date_snapshot: opening?.cutoff_date ?? null,
    };
  });
  if (confirmed) {
    requireValue(gross <= total + discount, "El desglose conocido excede el total documentado.");
    requireValue(total > 0, "Importe pagado comprobable debe ser mayor que cero.");
    requireValue(
      allAmounts ? gross - discount === total : discount === 0,
      "Total, renglones y descuento no concilian; documente los importes para aplicar descuento.",
    );
    requireValue(p.reviewed_expenses === true, "Revise los gastos previos antes de confirmar.");
  }
  const requestedExpense =
    p.existing_expense_id == null || p.existing_expense_id === ""
      ? null
      : literal(p.existing_expense_id, "Gasto existente");
  if (current?.status === "CONFIRMED") {
    requireValue(
      current.document_key === documentKey &&
        current.document_date === documentDate &&
        current.expense_id === requestedExpense,
      "La identidad, fecha y vínculo confirmados son permanentes. Anule para rectificar su documentación.",
    );
    if (!current.owns_expense)
      requireValue(current.total_cents === total, "No se reescribe el importe de un gasto preexistente.");
  }
  let expense = requestedExpense ? pick(s, "expenses", requestedExpense) : null;
  let ownsExpense = current?.owns_expense ?? false;
  if (confirmed && expense) {
    requireValue(
      expense.status === "CONFIRMED" &&
        expense.date === documentDate &&
        (ownsExpense || expense.amount === total),
      "El gasto debe estar confirmado y coincidir en fecha e importe.",
    );
    requireValue(
      !expense.production_cost_id &&
        !expense.production_id &&
        !expense.sale_id &&
        !expense.ingredient_id &&
        !expense.site_id,
      "No vincule gastos imputados a otras operaciones.",
    );
    requireValue(
      !s.microPurchases.some((row) => row.id !== current?.id && row.expense_id === expense.id) &&
        !s.microReceipts.some((row) => row.expense_id === expense.id),
      "Gasto ya vinculado a otro comprobante.",
    );
  }
  if (confirmed && !expense) {
    requireValue(
      !s.expenses.some(
        (row) => row.status !== "CANCELLED" && row.date === documentDate && row.amount === total,
      ),
      "Existe un gasto candidato con fecha e importe iguales. Revíselo y vincúlelo si corresponde; no se crea otro gasto.",
    );
    expense = add("expenses", {
      date: documentDate,
      category: "OTHER",
      description: `Compra histórica de microinsumos: ${reference}`,
      amount: total,
      production_id: null,
      production_cost_id: null,
      sale_id: null,
      site_id: null,
      ingredient_id: null,
      status: "CONFIRMED",
      notes: source,
    });
    ownsExpense = true;
  }
  // Drafts cannot reserve or mutate an expense.
  requireValue(confirmed || !requestedExpense, "El vínculo económico requiere confirmación.");
  const values = {
    document_kind: p.document_kind,
    document_key: documentKey,
    supplier,
    reference,
    source,
    document_date: documentDate,
    total_cents: total,
    discount_cents: discount,
    payment_method: "CASH",
    status: p.status,
    expense_id: expense?.id ?? null,
    owns_expense: ownsExpense,
    version: (current?.version ?? 0) + 1,
  };
  if (current) {
    const why = literal(p.reason, "Motivo de corrección");
    correction(
      "MICRO_PURCHASE",
      current.id,
      structuredClone({
        ...current,
        lines: s.microPurchaseLines.filter((line) => line.purchase_id === current.id && line.is_current),
      }),
      { ...current, ...values, lines },
      why,
    );
    if (confirmed && ownsExpense && expense.amount !== total) {
      correction("EXPENSE", expense.id, structuredClone(expense), { ...expense, amount: total }, why);
      expense.amount = total;
      expense.updated_at = clock;
    }
    Object.assign(current, values, { updated_at: clock });
    for (const line of s.microPurchaseLines.filter((row) => row.purchase_id === current.id))
      line.is_current = false;
  }
  const purchase = current ?? add("microPurchases", values);
  for (const line of lines)
    add("microPurchaseLines", {
      ...line,
      purchase_id: purchase.id,
      is_current: true,
      version: purchase.version,
    });
  return purchase.id;
}

export function historicalCancel({ s, p, correction, clock, actor }) {
  fields(p, ["id", "expected_version", "reason"]);
  const current = pick(s, "microPurchases", p.id);
  requireValue(
    current.status !== "CANCELLED" && current.version === p.expected_version,
    "Registro anulado o versión obsoleta.",
  );
  const reason = literal(p.reason, "Motivo de anulación");
  const next = {
    ...current,
    status: "CANCELLED",
    version: current.version + 1,
    cancelled_at: clock,
    cancelled_by: actor.id,
    reason,
  };
  correction("MICRO_PURCHASE", current.id, structuredClone(current), next, reason);
  if (current.owns_expense && current.expense_id) {
    const expense = pick(s, "expenses", current.expense_id);
    correction("EXPENSE", expense.id, structuredClone(expense), { ...expense, status: "CANCELLED" }, reason);
    Object.assign(expense, { status: "CANCELLED", cancelled_at: clock, cancelled_by: actor.id, reason });
  }
  Object.assign(current, next);
  return current.id;
}
