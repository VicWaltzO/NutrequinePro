import { businessDate } from "../features/documentos/domain/common.ts";
export function reportDate(value: string | undefined, timezone: string) {
  if (!value) return "Sin fecha";
  const date = businessDate(value, timezone);
  return new Intl.DateTimeFormat("es-PE", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(date + "T12:00:00Z"));
}
