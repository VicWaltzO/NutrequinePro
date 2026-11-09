import {
  requireValue,
  text,
  scaled,
  date,
  pick,
  safe,
  roundedProduct,
} from "../../../shared/domain/core.mjs";
import { createValuation, applyValuation, assertValuationOpening } from "./valuation.mjs";

function fields(value, allowed) {
  requireValue(value && typeof value === "object" && !Array.isArray(value), "Datos de compra inválidos.");
  requireValue(
    Object.keys(value).every((key) => allowed.includes(key)),
    "Campo de compra desconocido.",
  );
}
function literal(value, label) {
  requireValue(
    typeof value === "string" && ![...value].some((c) => c.codePointAt(0) < 32 || c.codePointAt(0) === 127),
    `${label}: texto inválido.`,
  );
  return text(value, label);
}
function decimal(value, digits) {
  requireValue(
    typeof value === "string" && /^\d+(\.\d+)?$/.test(value),
    "Use un decimal explícito con punto.",
  );
  return scaled(value, digits);
}
const canonical = (v) => v.normalize("NFKC").trim().replace(/\s+/gu, " ").toLocaleUpperCase("es-PE");

// Called only through cloned command execution and the store's single CAS SQLite batch.
export function operationalSave({ s, p, actor, add, clock, request_id }) {
  fields(p, [
    "id",
    "expected_version",
    "status",
    "supplier",
    "reference",
    "source",
    "document_date",
    "total",
    "discount",
    "currency",
    "payment_method",
    "receive_confirmed",
    "reviewed_expenses",
    "lines",
  ]);
  requireValue(
    typeof request_id === "string" && /^[A-Za-z0-9_.:-]{1,100}$/.test(request_id),
    "Identificador global de compra inválido.",
  );
  requireValue(
    !s.microReceipts.some((row) => row.request_id === request_id && row.id !== p.id),
    "Identificador de compra ya utilizado.",
  );
  requireValue(["DRAFT", "CONFIRMED"].includes(p.status), "Estado de compra inválido.");
  requireValue(
    p.currency === "PEN" && p.payment_method === "CASH",
    "Solo se admiten compras al contado PEN.",
  );
  const current = p.id ? pick(s, "microReceipts", p.id) : null;
  requireValue(
    !current || current.status === "DRAFT",
    "Compra confirmada inmutable; correcciones pendientes de NQP26-35.",
  );
  requireValue(!current || current.version === p.expected_version, "Versión obsoleta. Recargue la compra.");
  const supplier = literal(p.supplier, "Proveedor");
  const reference = literal(p.reference, "Referencia");
  const documentKey = JSON.stringify(["DOCUMENT", canonical(supplier), canonical(reference)]);
  requireValue(
    !s.microPurchases.some((row) => row.document_key === documentKey) &&
      !s.microReceipts.some((row) => row.id !== current?.id && row.document_key === documentKey),
    "Comprobante ya registrado en compras históricas u operativas.",
  );
  const documentDate = date(literal(p.document_date, "Fecha"));
  const source = literal(p.source, "Fuente / observaciones");
  const total = decimal(p.total, 2);
  const discount = decimal(p.discount ?? "0", 2);
  requireValue(
    Array.isArray(p.lines) && p.lines.length > 0 && p.lines.length <= 100,
    "Incluya de 1 a 100 renglones.",
  );
  requireValue(
    new Set(p.lines.map((line) => line?.micro_ingredient_id)).size === p.lines.length,
    "Agrupe cada microinsumo en un solo renglón documentado.",
  );
  let gross = 0;
  let discounts = 0;
  const lines = p.lines.map((line) => {
    fields(line, ["micro_ingredient_id", "quantity_kg", "unit_price", "amount", "discount"]);
    const micro = pick(s, "microIngredients", literal(line.micro_ingredient_id, "Microinsumo"));
    requireValue(micro.is_active, "Microinsumo inactivo.");
    const opening = s.microOpenings.find((o) => o.micro_ingredient_id === micro.id);
    requireValue(
      opening && documentDate > opening.cutoff_date,
      "La compra debe ser posterior al corte de cada microinsumo. Use compras históricas para fechas anteriores.",
    );
    const quantity = decimal(line.quantity_kg, 3);
    const price = decimal(line.unit_price, 2);
    const amount = decimal(line.amount, 2);
    const reduction = decimal(line.discount ?? "0", 2);
    requireValue(quantity > 0, "Cantidad recibida debe ser mayor que cero.");
    requireValue(
      roundedProduct(quantity, price, 1000) === amount,
      "Importe no concilia con kg y precio del comprobante.",
    );
    requireValue(reduction <= amount, "Descuento de renglón excede su importe.");
    gross = safe(gross + amount);
    discounts = safe(discounts + reduction);
    return {
      micro_ingredient_id: micro.id,
      quantity_grams: quantity,
      unit_price_cents: price,
      amount_cents: amount,
      discount_cents: reduction,
      total_cost_cents: amount - reduction,
      cutoff_date_snapshot: opening.cutoff_date,
    };
  });
  requireValue(
    discounts === discount && gross - discount === total,
    "Total y descuentos no concilian. Documente el descuento de cada renglón; no se reparte automáticamente.",
  );
  const confirmed = p.status === "CONFIRMED";
  if (confirmed) {
    requireValue(
      p.receive_confirmed === true && p.reviewed_expenses === true,
      "Confirme recepción física y revisión de gastos previos.",
    );
    requireValue(
      !s.expenses.some((e) => e.status !== "CANCELLED" && e.date === documentDate && e.amount === total),
      "Existe un gasto candidato con fecha e importe iguales. Revise el comprobante antes de registrar otra compra.",
    );
  }
  const values = {
    document_key: documentKey,
    supplier,
    reference,
    source,
    document_date: documentDate,
    total_cents: total,
    discount_cents: discount,
    currency: "PEN",
    payment_method: "CASH",
    status: p.status,
    expense_id: null,
    request_id,
    version: (current?.version ?? 0) + 1,
  };
  const receipt = current ?? add("microReceipts", values);
  if (current) {
    Object.assign(current, values, { updated_at: clock });
    for (const line of s.microReceiptLines.filter((line) => line.receipt_id === current.id))
      line.is_current = false;
  }
  for (const values of lines) {
    const line = add("microReceiptLines", {
      ...values,
      receipt_id: receipt.id,
      is_current: true,
      version: receipt.version,
    });
    if (!confirmed) continue;
    const opening = s.microOpenings.find((o) => o.micro_ingredient_id === line.micro_ingredient_id);
    let row = s.microLedgers.find((o) => o.micro_ingredient_id === line.micro_ingredient_id);
    const ledger = row?.ledger ?? createValuation(opening, actor);
    assertValuationOpening(ledger, opening, actor);
    const next = applyValuation(
      ledger,
      {
        id: line.id,
        request_id,
        micro_ingredient_id: line.micro_ingredient_id,
        type: "RECEIPT",
        date: documentDate,
        quantity_grams: line.quantity_grams,
        expected_revision: ledger.revision,
        total_cost_cents: line.total_cost_cents,
      },
      actor,
    );
    if (!row)
      row = add("microLedgers", {
        micro_ingredient_id: line.micro_ingredient_id,
        opening_id: opening.id,
        ledger: next,
      });
    else Object.assign(row, { ledger: next, updated_at: clock });
    add("microValuationEvents", {
      ledger_id: row.id,
      receipt_line_id: line.id,
      request_id,
      revision: next.revision,
      event: next.events.at(-1),
    });
  }
  if (confirmed)
    receipt.expense_id = add("expenses", {
      date: documentDate,
      category: "OTHER",
      description: `Compra operativa de microinsumos: ${reference}`,
      amount: total,
      production_id: null,
      production_cost_id: null,
      sale_id: null,
      site_id: null,
      ingredient_id: null,
      status: "CONFIRMED",
      notes: source,
    }).id;
  return receipt.id;
}
