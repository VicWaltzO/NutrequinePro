import { useEffect, useRef, useState } from "react";
import { Input } from "@/shared/ui";
import type { AppState, MicroConfirmation, Submit } from "@/lib/domain-types";
import { createCommandRequest } from "@/lib/command-request.mjs";
import { correctedPreparation, rectificationHistory } from "../domain/rectifications.mjs";
import { rationalMoney } from "./preparation-view";

export default function RectificationActions({
  s,
  confirmation,
  canWrite,
  run,
  busy,
}: {
  s: AppState;
  confirmation: MicroConfirmation;
  canWrite: boolean;
  run: Submit;
  busy: boolean;
}) {
  const current = correctedPreparation(s, confirmation);
  const history = rectificationHistory(s, confirmation.preparation_id);
  const closed =
    current.mode === "AUDIT_ONLY" ||
    s.productionJourneyLinks.some(
      (l) =>
        l.preparation_id === confirmation.preparation_id &&
        s.millClosures.some((c) => c.line_id === l.line_id),
    );
  const [selection, setSelection] = useState<{ revision: number; nuclei: number; closed: boolean } | null>(
    null,
  );
  const [nuclei, setNuclei] = useState("");
  const [date, setDate] = useState("");
  const [reason, setReason] = useState("");
  const [reference, setReference] = useState("");
  const [recoverable, setRecoverable] = useState(false);
  const [attempted, setAttempted] = useState(false);
  const [requests] = useState(createCommandRequest);
  const form = useRef<HTMLFormElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const restore = useRef(false);
  useEffect(() => {
    if (selection) form.current?.querySelector("input")?.focus();
    else if (restore.current && !busy) {
      trigger.current?.focus();
      restore.current = false;
    }
  }, [selection, busy]);
  const cancel = () => {
    requests.reset();
    setSelection(null);
    setAttempted(false);
    restore.current = true;
  };
  return (
    <div className="preparation-rectification">
      {history.length > 0 && (
        <p role="status">
          Cantidad rectificada: {current.nuclei_hundredths / 100} núcleos ·{" "}
          {current.mode === "AUDIT_ONLY"
            ? "Diferencia auditada; inventario y costos históricos conservados"
            : `Costo vigente de preparación: ${rationalMoney(current.total_cost_cents)}`}
          .
        </p>
      )}
      {canWrite && (
        <button
          ref={trigger}
          type="button"
          disabled={busy || selection !== null}
          onClick={() => {
            requests.reset();
            setNuclei("");
            setDate("");
            setReason("");
            setReference("");
            setRecoverable(false);
            setAttempted(false);
            setSelection({ revision: s.revision, nuclei: current.nuclei_hundredths, closed });
          }}
        >
          Rectificar cantidad preparada
        </button>
      )}
      {selection && (
        <form
          ref={form}
          aria-label="Rectificación de preparación"
          aria-busy={busy}
          onSubmit={async (e) => {
            e.preventDefault();
            const payload = {
              preparation_id: confirmation.preparation_id,
              nuclei,
              date,
              reason,
              reference,
              recoverable: selection.closed ? false : recoverable,
              expected_revision: selection.revision,
            };
            const request = requests.begin(JSON.stringify(payload));
            if (!request) return;
            setAttempted(true);
            try {
              if (await run("MICRO_PREPARATION_RECTIFY", payload, request)) cancel();
            } finally {
              requests.finish();
            }
          }}
        >
          <h5>Rectificar preparación</h5>
          <p>
            Original confirmado: {confirmation.nuclei_hundredths / 100}. Antes de esta rectificación:{" "}
            {selection.nuclei / 100}.
          </p>
          <p>
            {selection.closed
              ? "Lote comercial cerrado: se documentará la diferencia sin devolver insumos, cambiar ventas ni recalcular costos históricos."
              : "Se aplicará únicamente la diferencia de consumo. No pueden devolverse dosis de núcleos ya vinculados a una jornada. Los registros originales se conservan."}
          </p>
          <fieldset disabled={busy || attempted}>
            <Input
              label="Cantidad preparada corregida"
              value={nuclei}
              onChange={setNuclei}
              inputMode="decimal"
              required
            />
            <Input label="Fecha de rectificación" value={date} onChange={setDate} type="date" required />
            <Input label="Motivo de rectificación" value={reason} onChange={setReason} required />
            <Input label="Referencia de rectificación" value={reference} onChange={setReference} required />
            {!selection.closed && (
              <label className="check">
                <input
                  type="checkbox"
                  checked={recoverable}
                  onChange={(e) => setRecoverable(e.target.checked)}
                />
                Confirmo que las dosis a devolver no se utilizaron y son físicamente recuperables
              </label>
            )}
          </fieldset>
          <p>
            Después: {nuclei || "sin indicar"} núcleos. El servidor calculará las diferencias exactas por
            ingrediente y validará el saldo antes de registrar.
          </p>
          {attempted && (
            <p role="status">
              Si perdió la respuesta, reintente la misma solicitud. Para cambiar datos, cancele y vuelva a
              abrir con el saldo actualizado.
            </p>
          )}
          <div className="form-actions">
            <button type="button" disabled={busy} onClick={cancel}>
              Cancelar rectificación
            </button>
            <button
              type="submit"
              className="primary"
              disabled={busy || !nuclei || !date || !reason.trim() || !reference.trim()}
            >
              {attempted ? "Reintentar rectificación" : "Registrar rectificación auditada"}
            </button>
          </div>
        </form>
      )}
      {history.length > 0 && (
        <details>
          <summary>Historial de rectificaciones ({history.length})</summary>
          {history.map((r) => (
            <div key={r.id}>
              <p>
                {r.code} · {r.old_snapshot.nuclei_hundredths / 100} → {r.new_snapshot.nuclei_hundredths / 100}{" "}
                núcleos ·{" "}
                {r.new_snapshot.mode === "AUDIT_ONLY"
                  ? "Sin efecto en stock ni costos históricos"
                  : "Compensación física"}
              </p>
              <p>
                {s.users.find((u) => u.id === r.created_by)?.name ?? r.created_by} · {r.created_at} · Motivo:{" "}
                {r.reason} · Referencia: {r.new_snapshot.reference}
              </p>
              {r.new_snapshot.lines?.map((line) => (
                <p key={line.issue_id}>
                  Microinsumo {s.microIngredients.find((m) => m.id === line.micro_ingredient_id)?.name}:
                  diferencia {line.quantity_delta_hundredths / 100} g · costo exacto {line.cost_delta_cents.n}
                  /{line.cost_delta_cents.d} céntimos · ISSUE original {line.issue_id}.
                </p>
              ))}
            </div>
          ))}
        </details>
      )}
    </div>
  );
}
