import type { AppState } from "../shared/types/domain.ts";
import { productionReport, saleReport } from "../features/documentos/domain/operation-reports.ts";
import { customerReport } from "../features/documentos/domain/customer-report.ts";
import { balanceReport } from "../features/documentos/domain/balance-report.ts";
import { money, kg, num, label } from "../shared/lib/format.ts";
import { ReportLayout } from "./report-layout.mts";
import { HttpError } from "./authentication.mts";
import { reportDate } from "./report-format.mts";

type Report = ReturnType<
  typeof productionReport | typeof saleReport | typeof customerReport | typeof balanceReport
>;
export function documentModel(
  state: AppState,
  kind: string,
  id: string,
  query: Record<string, unknown>,
  generatedAt: string,
): Report {
  if (
    Object.entries(query).some(
      ([key, value]) => kind !== "customer" || !["from", "to"].includes(key) || typeof value !== "string",
    )
  )
    throw new HttpError(422, "Filtros de documento inválidos.");
  if (kind === "balance") return balanceReport(state, id, generatedAt);
  const collections: Record<string, { id: string }[]> = {
    production: state.productions,
    sale: state.sales,
    customer: state.customers,
  };
  const records = Object.hasOwn(collections, kind) ? collections[kind] : [];
  if (!records.some((row) => row.id === id))
    throw new HttpError(404, "No se encontró el registro solicitado.");
  if (kind === "production") return productionReport(state, id, generatedAt);
  if (kind === "sale") return saleReport(state, id, generatedAt);
  return customerReport(state, id, String(query.from ?? ""), String(query.to ?? ""), generatedAt);
}

export async function renderReport(report: Report) {
  const pdf = new ReportLayout(
    report,
    report.kind === "production" && report.status === "DRAFT" ? "PLANIFICADO · NO CONFIRMADO" : "",
  );
  const t = (value: string, bold = false) => pdf.text(value, bold);
  const table = (head: string[], rows: string[][], widths?: number[]) => pdf.table(head, rows, widths);
  const fecha = (value: string | undefined) => reportDate(value, report.timezone);
  if (report.kind !== "production") t("Importes en soles (PEN).");
  if (report.kind === "production") {
    t(
      report.status === "DRAFT"
        ? "PLANIFICADO · BORRADOR · No acredita producción ni modifica existencias"
        : "Estado: " + label(report.status),
      true,
    );
    if (report.cancellationReason) t("Motivo de anulación: " + report.cancellationReason);
    t("Productos del lote", true);
    table(
      ["Producto", "Núcleos", "Sacos / núcleo", "Sacos", "Kg comerciales", "Kg fórmula"],
      report.products.map((row) => [
        row.name,
        num(row.nuclei),
        num(row.bagsPerNucleus),
        num(row.bags),
        kg(row.commercialWeight),
        kg(row.formulaWeight),
      ]),
      [2.5, 1, 1.2, 1, 1.4, 1.4],
    );
    t(
      `Totales: ${num(report.bags)} sacos · ${kg(report.commercialWeight)} kg comerciales · ${kg(report.formulaWeight)} kg de fórmula`,
      true,
    );
    t("Insumos consolidados requeridos", true);
    table(
      ["Insumo", "Cantidad (kg)"],
      report.ingredients.map((row) => [row.name, kg(row.weight)]),
      [4, 1],
    );
    t("Total de insumos: " + kg(report.requiredWeight) + " kg");
    t("Los kg comerciales y los kg de fórmula son magnitudes distintas. No se incluyen costos ni precios.");
    t("Notas: " + (report.notes || "Sin notas."));
  } else if (report.kind === "sale") {
    t("COMPROBANTE INTERNO", true);
    t("NO VÁLIDO COMO COMPROBANTE DE PAGO TRIBUTARIO", true);
    t(
      "Cliente: " +
        report.customer.name +
        (report.customer.taxId ? " · Identificación: " + report.customer.taxId : ""),
    );
    t([report.customer.address, report.customer.phone].filter(Boolean).join(" · "));
    t("Sede: " + report.site + " · Condición: " + label(report.paymentCondition));
    t(
      `Estado: ${label(report.status)} · Entrega: ${label(report.fulfillment)} · Pago: ${label(report.financial)}`,
      true,
    );
    if (report.status === "DRAFT")
      t("BORRADOR · Importes propuestos; sin venta confirmada ni saldo exigible.");
    if (report.status === "CANCELLED")
      t("ANULADA · " + (report.cancellationReason || "Sin efecto comercial vigente."));
    if (report.hasCorrections) t("Incluye rectificaciones. Los importes reflejan la versión vigente.");
    table(
      ["Producto", "Cantidad", "Kg / unidad", "Kg", "Precio / unidad", "Subtotal"],
      report.items.map((row) => [
        row.name,
        num(row.bags) + " " + (row.bags === 1 ? row.unit : row.units),
        kg(row.bagWeight) + " / " + row.unit,
        kg(row.weight),
        money(row.price) + " / " + row.unit,
        money(row.subtotal),
      ]),
      [2.5, 0.8, 1, 1, 1.4, 1.4],
    );
    pdf.ensure(160);
    t("Subtotal: " + money(report.gross) + " · Devoluciones: " + money(report.returned));
    t((report.status === "DRAFT" ? "Total propuesto: " : "Total vigente: ") + money(report.total), true);
    t(
      "Pagos aplicados vigentes: " +
        money(report.applied) +
        (report.status === "DRAFT" ? " · Saldo propuesto: " : " · Saldo: ") +
        money(report.balance),
      true,
    );
    t("Notas: " + (report.notes || "Sin notas."));
    t(
      "Documento de control interno. No sustituye un comprobante tributario ni acredita por sí solo un pago.",
    );
  } else if (report.kind === "customer") {
    t(report.customer.name, true);
    t(
      [report.customer.taxId, report.customer.contact, report.customer.phone, report.customer.address]
        .filter(Boolean)
        .join(" · "),
    );
    t(
      "Periodo: " +
        (report.from ? fecha(report.from) : "Desde el inicio") +
        " a " +
        fecha(report.to || report.generatedDate),
    );
    t(
      "Sedes activas: " +
        (report.sites.map((site) => site.name + (site.principal ? " (principal)" : "")).join(", ") ||
          "Sin sedes vinculadas."),
    );
    t("Totales del periodo", true);
    t(
      `Ventas vigentes: ${money(report.totals.sales)} (${report.totals.count}) · Cobros vigentes recibidos en el periodo: ${money(report.totals.receipts)}`,
    );
    t("Aplicado actualmente a las ventas del periodo: " + money(report.totals.applied));
    t("Situación actual de todo el historial", true);
    t(
      `Deuda: ${money(report.current.debt)} · Saldo a favor: ${money(report.current.credit)} · Neto: ${money(report.current.net)}`,
    );
    t(
      "Los saldos y las aplicaciones son actuales, no reconstruyen un cierre histórico. Referencia indica un movimiento vinculado fuera del periodo.",
    );
    if (report.empty) t("Sin movimientos para el periodo seleccionado.", true);
    t("Ventas del periodo", true);
    table(
      ["Fecha / venta", "Sede / estado", "Total / propuesto", "Aplicado", "Saldo vigente"],
      report.sales.map((row) => [
        fecha(row.date) + "\n" + row.code,
        row.site + "\n" + label(row.status),
        money(row.summary.total),
        money(row.summary.paid),
        row.status === "DRAFT" ? "No exigible" : money(row.summary.balance),
      ]),
      [1.5, 2, 1.2, 1.2, 1.2],
    );
    t("Cobros y disponibilidad actual · cada cobro aparece una vez", true);
    table(
      ["Fecha / cobro", "Medio / alcance", "Recibido", "Aplicado", "Disponible / estado"],
      report.payments.map((row) => [
        fecha(row.date) + "\n" + row.code,
        label(row.method) + (row.inPeriod ? "" : "\nReferencia"),
        money(row.amount),
        money(row.applied),
        money(row.available) + (row.reversed ? "\nREVERTIDO" : ""),
      ]),
      [1.5, 1.4, 1.1, 1.1, 1.6],
    );
    t("Aplicaciones de cobros", true);
    table(
      ["Cobro / venta", "Fecha", "Importe", "Estado"],
      report.applications.map((row) => [
        row.payment + " / " + row.sale,
        fecha(row.date),
        money(row.amount),
        row.reversed ? "Revertida · sin efecto" : "Vigente",
      ]),
      [2, 1, 1, 1.5],
    );
    t("Devoluciones, rectificaciones y reversiones", true);
    table(
      ["Fecha / movimiento", "Referencia", "Detalle"],
      [
        ...report.returns.map((row) => [
          fecha(row.date) + "\n" + row.code,
          row.sale + (row.inPeriod ? "" : " (referencia)"),
          "Devolución " + money(row.amount) + " · " + row.reason,
        ]),
        ...report.corrections.map((row) => [
          fecha(row.date) + "\n" + row.code,
          row.sale + (row.inPeriod ? "" : " (referencia)"),
          "Rectificación · " + row.reason,
        ]),
        ...report.reversals.map((row) => [
          fecha(row.date) + "\n" + row.code,
          row.payment + (row.inPeriod ? "" : " (referencia)"),
          "Reversión " + money(row.amount) + " · " + row.reason,
        ]),
      ],
      [1.3, 1.3, 2.4],
    );
    if (report.customer.notes) t("Notas del cliente: " + report.customer.notes);
  } else {
    const b = report.summary;
    t("Periodo: " + fecha(report.from) + " al " + fecha(report.to), true);
    t("Resultado estimado según registros vigentes; no constituye un estado financiero auditado.");
    const metrics: [string, keyof typeof b][] = [
      ["Ventas registradas", "sales"],
      ["Cobros reales (menos reversiones del periodo)", "collections"],
      ["Costo de producción", "costs"],
      ["Costos de producción pagados", "paidCosts"],
      ["Gastos logísticos", "logistics"],
      ["Otros gastos", "other"],
      ["Resultado comercial estimado", "estimated_result"],
      ["Resultado de caja", "cash_result"],
    ];
    table(
      ["Concepto", "Mes seleccionado", "Mes anterior", "Variación absoluta"],
      metrics.map(([name, key]) => [
        name,
        money(b[key]),
        report.previous ? money(report.previous[key]) : "Sin datos",
        report.previous ? money(b[key] - report.previous[key]) : "—",
      ]),
      [2.5, 1.3, 1.3, 1.3],
    );
    t(
      report.previous
        ? "Comparación con " + report.previousMonth + "."
        : "Sin actividad comparable registrada en el mes anterior.",
    );
    t("Ventas y cobros reales", true);
    pdf.ensure(105);
    const maximum = Math.max(Math.abs(b.sales), Math.abs(b.collections), 1);
    const hasNegative = b.sales < 0 || b.collections < 0;
    const origin = hasNegative ? 280 : 42;
    for (const [name, value, color] of [
      ["Ventas", b.sales, "#334d60"],
      ["Cobros", b.collections, "#899ba7"],
    ] as const) {
      t(name + ": " + money(value));
      const length = (Math.abs(value) / maximum) * (hasNegative ? 220 : 340);
      pdf.doc.rect(value < 0 ? origin - length : origin, pdf.y, length, 12).fill(color);
      pdf.doc
        .moveTo(origin, pdf.y - 2)
        .lineTo(origin, pdf.y + 14)
        .strokeColor("#202c35")
        .lineWidth(0.5)
        .stroke();
      pdf.y += 23;
    }
    if (hasNegative) t("Eje cero: los importes negativos se extienden hacia la izquierda.");
    t(
      `Producciones con costo estimado: ${num(b.estimated_productions)}. El costo corresponde a producción registrada en el periodo, no a un margen por saco vendido.`,
    );
    t("Caja = cobros reales - costos de producción pagados - logística - otros gastos.");
    t(
      "Los cobros siguen la fecha de recepción y las reversiones su propia fecha. Las ventas reflejan devoluciones vigentes, incluso posteriores al mes.",
    );
    t("Saldos actuales globales · fuera del resultado mensual", true);
    t("Por cobrar: " + money(b.receivable) + " · Saldo a favor de clientes: " + money(b.customer_credit));
  }
  return pdf.finish();
}
