import { useEffect, useRef, useState } from "react";
import { createCommandRequest } from "@/lib/command-request.mjs";
import type { Submit } from "@/lib/domain-types";
import { Input } from "@/shared/ui";
import { preparationWeight, type Evaluation } from "./preparation-view";
export default function AssignmentActions({
  orderId,
  evaluation,
  revision,
  run,
  busy,
  onRefresh,
}: {
  orderId: string;
  evaluation: Evaluation;
  revision: number;
  run: Submit;
  busy: boolean;
  onRefresh: () => void;
}) {
  const [decision, setDecision] = useState<{
    type: string;
    revision: number;
    assignmentId: string | null;
    evaluation: Evaluation;
  } | null>(null);
  const [reason, setReason] = useState("");
  const [attempted, setAttempted] = useState(false);
  const [requests] = useState(createCommandRequest);
  const form = useRef<HTMLFormElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const restoreFocus = useRef(false);
  useEffect(() => {
    if (!decision && !busy && restoreFocus.current) {
      trigger.current?.focus();
      restoreFocus.current = false;
    }
  }, [decision, busy]);
  useEffect(() => {
    if (decision) form.current?.querySelector("input")?.focus();
  }, [decision]);
  const assigned = evaluation.assignment_status === "ASSIGNED";
  const cancel = () => {
    requests.reset();
    restoreFocus.current = true;
    setDecision(null);
    setAttempted(false);
  };
  return (
    <div className="assignment-actions">
      <button
        ref={trigger}
        type="button"
        disabled={busy || !!decision}
        onClick={() => {
          requests.reset();
          setReason("");
          setAttempted(false);
          setDecision({
            type: assigned ? "MICRO_ASSIGNMENT_REVERSE" : "MICRO_ASSIGN",
            revision,
            assignmentId: evaluation.assignment_id,
            evaluation: structuredClone(evaluation),
          });
        }}
      >
        {assigned ? "Revertir asignación" : "Asignar ingredientes a esta orden"}
      </button>
      {decision && (
        <form
          ref={form}
          aria-label="Confirmación de asignación"
          aria-busy={busy}
          onSubmit={async (e) => {
            e.preventDefault();
            const payload = {
              ...(decision.type === "MICRO_ASSIGN"
                ? { preparation_id: orderId }
                : { assignment_id: decision.assignmentId }),
              reason,
              expected_revision: decision.revision,
            };
            const requestId = requests.begin(JSON.stringify(payload));
            if (!requestId) return;
            setAttempted(true);
            try {
              if (await run(decision.type, payload, requestId)) {
                requests.reset();
                restoreFocus.current = true;
                setDecision(null);
                setAttempted(false);
              }
            } finally {
              requests.finish();
              onRefresh();
            }
          }}
        >
          <h5>
            {decision.type === "MICRO_ASSIGN"
              ? "Confirmar asignación integral"
              : "Confirmar reversión completa"}
          </h5>
          <p>
            Orden: {orderId}.{" "}
            {decision.type === "MICRO_ASSIGN"
              ? "Se comprometen todos los ingredientes sin consumirlos."
              : "Se libera el compromiso completo y se conserva el historial. No cambia el saldo físico."}
          </p>
          {decision.evaluation.items.map((i) => (
            <p key={i.micro_ingredient_id}>
              ID {i.operational_id} · {i.name}: requerido {preparationWeight(i.required_hundredths)} ·
              asignado a esta orden {preparationWeight(i.own_assigned_hundredths)} · físico{" "}
              {preparationWeight(i.physical_hundredths)} · asignado total{" "}
              {preparationWeight(i.assigned_hundredths)} · libre {preparationWeight(i.available_hundredths)} ·
              faltante {preparationWeight(i.missing_hundredths)}
            </p>
          ))}
          <Input
            label="Motivo de asignación o reversión"
            value={reason}
            onChange={setReason}
            required
            disabled={busy || attempted}
          />
          {attempted && (
            <p role="status">
              Si no recibió confirmación, reintente con la misma solicitud. Si los datos cambiaron o faltan
              materiales, cancele, reevalúe y seleccione manualmente la orden.
            </p>
          )}
          <div className="form-actions">
            <button type="button" disabled={busy} onClick={cancel}>
              Cancelar selección
            </button>
            <button type="submit" className="primary" disabled={busy || !reason.trim()}>
              {busy
                ? "Procesando…"
                : attempted
                  ? "Reintentar solicitud"
                  : decision.type === "MICRO_ASSIGN"
                    ? "Confirmar asignación"
                    : "Confirmar reversión"}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
