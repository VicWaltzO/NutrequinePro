import { useEffect, useRef, useState } from "react";
import { createCommandRequest } from "@/lib/command-request.mjs";
import type { Submit } from "@/lib/domain-types";
import { Input } from "@/shared/ui";

export default function ConfirmationActions({
  orderId,
  revision,
  planned,
  run,
  busy,
  onRefresh,
}: {
  orderId: string;
  revision: number;
  planned: number;
  run: Submit;
  busy: boolean;
  onRefresh: () => void;
}) {
  const [selection, setSelection] = useState<number | null>(null);
  const [nuclei, setNuclei] = useState("");
  const [date, setDate] = useState("");
  const [attempted, setAttempted] = useState(false);
  const [requests] = useState(createCommandRequest);
  const form = useRef<HTMLFormElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const restore = useRef(false);
  useEffect(() => {
    if (selection !== null) form.current?.querySelector("input")?.focus();
    else if (!busy && restore.current) {
      trigger.current?.focus();
      restore.current = false;
    }
  }, [selection, busy]);
  return (
    <div>
      <button
        ref={trigger}
        type="button"
        disabled={busy || selection !== null}
        onClick={() => {
          requests.reset();
          setNuclei("");
          setDate("");
          setAttempted(false);
          setSelection(revision);
        }}
      >
        Confirmar núcleos terminados
      </button>
      {selection !== null && (
        <form
          ref={form}
          aria-label="Confirmación de núcleos reales"
          aria-busy={busy}
          onSubmit={async (e) => {
            e.preventDefault();
            const payload = { preparation_id: orderId, nuclei, date, expected_revision: selection };
            const request = requests.begin(JSON.stringify(payload));
            if (!request) return;
            setAttempted(true);
            try {
              if (await run("MICRO_PREPARATION_CONFIRM", payload, request)) {
                requests.reset();
                setSelection(null);
                setAttempted(false);
              }
            } finally {
              requests.finish();
              onRefresh();
            }
          }}
        >
          <p>
            Planificados: {planned / 100}. Confirme únicamente los núcleos terminados. Se consumirán sus dosis
            automáticamente y se liberará toda asignación sobrante.
          </p>
          <p>
            Esta preparación quedará cerrada definitivamente. Para completar el resto deberá crear una orden
            nueva.
          </p>
          <Input
            label="Núcleos realmente terminados"
            value={nuclei}
            onChange={setNuclei}
            inputMode="decimal"
            required
            disabled={busy || attempted}
          />
          <Input
            label="Fecha real de preparación"
            type="date"
            value={date}
            onChange={setDate}
            required
            disabled={busy || attempted}
          />
          {attempted && (
            <p role="status">
              Si perdió la respuesta, reintente la misma solicitud. Si cambió el saldo, cancele y reevalúe
              antes de confirmar.
            </p>
          )}
          <div className="form-actions">
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                requests.reset();
                restore.current = true;
                setSelection(null);
                setAttempted(false);
              }}
            >
              Cancelar confirmación
            </button>
            <button type="submit" className="primary" disabled={busy || !nuclei || !date}>
              {busy ? "Procesando…" : attempted ? "Reintentar cierre" : "Confirmar consumo y cerrar"}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
