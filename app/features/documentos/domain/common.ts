import type { AppState, User } from "../../../shared/types/domain.ts";
import { date, requireValue } from "../../../shared/domain/core.mjs";

export type DocumentKind = "production" | "sale" | "customer" | "balance";
export interface ReportBase {
  kind: DocumentKind;
  title: string;
  code: string;
  date: string;
  generatedAt: string;
  generatedDate: string;
  timezone: string;
  filename: string;
  company: { name: string; taxId?: string; address?: string; phone?: string; email?: string };
}

/** The read policy is the same as /api/state; no additional confidential data is loaded. */
export function canExportDocuments(actor: User | null | undefined) {
  return !!actor && !!actor.is_active && ["ADMIN", "OPERATOR", "VIEWER"].includes(actor.role);
}

export function businessDate(value: string, timezone: string) {
  return value.includes("T")
    ? new Intl.DateTimeFormat("en-CA", { timeZone: timezone }).format(new Date(value))
    : value;
}

export function reportRange(from = "", to = "") {
  if (from) date(from);
  if (to) date(to);
  requireValue(!from || !to || from <= to, "La fecha Desde no puede superar la fecha Hasta.");
  return { from, to };
}

export function within(value: string | undefined, from: string, to: string, timezone: string) {
  if (!value) return false;
  const day = businessDate(value, timezone);
  return (!from || day >= from) && (!to || day <= to);
}

export function monthRange(month: string) {
  requireValue(/^(?:19|[2-9]\d)\d{2}-(?:0[1-9]|1[0-2])$/.test(month), "Seleccione un mes válido (AAAA-MM).");
  const [year, number] = month.split("-").map(Number);
  const last = new Date(Date.UTC(year, number, 0)).getUTCDate();
  return { from: month + "-01", to: month + "-" + String(last).padStart(2, "0") };
}

export function baseReport<K extends DocumentKind>(
  state: AppState,
  kind: K,
  title: string,
  code: string,
  documentDate: string,
  generatedAt: string,
): ReportBase & { kind: K } {
  const generatedDate = businessDate(generatedAt, state.config.timezone);
  const safeCode =
    code
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^A-Za-z0-9_-]/g, "_")
      .slice(0, 80) || "sin-codigo";
  const names = { production: "Lote", sale: "Venta", customer: "Cliente", balance: "Balance" };
  return {
    kind,
    title,
    code,
    date: documentDate,
    generatedAt,
    generatedDate,
    timezone: state.config.timezone,
    filename:
      kind === "balance"
        ? `NUTREQUINE_Balance_${safeCode}.pdf`
        : `NUTREQUINE_${names[kind]}_${safeCode}${kind === "customer" ? "_Historial" : ""}_${generatedDate}.pdf`,
    company: {
      name: state.config.company_name,
      taxId: state.config.tax_id,
      address: state.config.address,
      phone: state.config.phone,
      email: state.config.contact_email,
    },
  };
}
