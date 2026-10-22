import { useState } from "react";
import type { AppState } from "@/shared/types/domain.ts";
import { balanceSummary } from "@/features/balance/domain/summary.mjs";
import { monthRange } from "../domain/common.ts";
import { day, money } from "@/shared/lib/format.ts";
import DownloadPdfButton from "./DownloadPdfButton.tsx";

export default function MonthlyBalanceExport({ state }: { state: AppState }) {
  const [month, setMonth] = useState(day().slice(0, 7));
  const valid = /^(?:19|[2-9]\d)\d{2}-(?:0[1-9]|1[0-2])$/.test(month);
  const range = valid ? monthRange(month) : null;
  const summary = range ? balanceSummary(state, range.from, range.to) : null;
  return (
    <section className="panel monthly-export" aria-label="Exportación del balance mensual">
      <div className="detail-actions">
        <label>
          Mes del PDF
          <input
            type="month"
            min="1900-01"
            value={month}
            onChange={(event) => setMonth(event.target.value)}
          />
        </label>
        {valid && (
          <DownloadPdfButton kind="balance" id={month}>
            Exportar balance mensual PDF
          </DownloadPdfButton>
        )}
      </div>
      {summary && range ? (
        <p className="metadata">
          PDF del {range.from} al {range.to} · Ventas {money(summary.sales)} · Cobros{" "}
          {money(summary.collections)} · Resultado estimado {money(summary.estimated_result)} · Caja{" "}
          {money(summary.cash_result)}. Este mes se selecciona independientemente de los filtros de pantalla.
        </p>
      ) : (
        <p role="status">Seleccione un mes válido para exportar.</p>
      )}
    </section>
  );
}
