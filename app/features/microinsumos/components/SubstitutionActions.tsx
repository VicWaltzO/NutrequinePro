import { orderNominal } from "@/shared/lib/nominal-order.mjs";
import { useEffect, useRef, useState } from "react";
import type { AppState, Submit, MicroSubstitutionPolicy } from "@/lib/domain-types";
import { createCommandRequest } from "@/lib/command-request.mjs";
import { Field, Input, weight } from "@/shared/ui";

export default function SubstitutionActions({
  s,
  run,
  busy,
  policies,
  canWrite,
}: {
  s: AppState;
  run: Submit;
  busy: boolean;
  policies: MicroSubstitutionPolicy[];
  canWrite: boolean;
}) {
  const [mode, setMode] = useState("");
  const [revision, setRevision] = useState(0);
  const [selected, setSelected] = useState("");
  const [orderId, setOrderId] = useState("");
  const [reason, setReason] = useState("");
  const [group, setGroup] = useState("");
  const [consent, setConsent] = useState(false);
  const [requests] = useState(createCommandRequest);
  const form = useRef<HTMLFormElement>(null);
  const trigger = useRef<HTMLButtonElement | null>(null);
  const triggerAction = useRef("");
  useEffect(() => {
    if (mode) form.current?.querySelector("select")?.focus();
    else trigger.current?.focus();
  }, [mode]);
  const sortedPreparations = orderNominal(
    s.microPreparations,
    (p) => `${p.family} · ${p.nuclei_hundredths / 100} núcleos · ${p.id}`,
    (p) => p.id,
  );
  const sortedPolicies = orderNominal(
    policies,
    (p) => p.reference,
    (p) => p.id,
  );
  const sortedSubstitutions = orderNominal(
    s.microSubstitutions,
    (e) => e.approval_reference,
    (e) => e.id,
  );
  const pending = sortedPreparations.filter(
    (p) =>
      p.id === orderId ||
      (!s.microConfirmations.some((c) => c.preparation_id === p.id) &&
        !s.microSupersessions.some((e) => e.source_id === p.id)),
  );
  const selectedOrder = pending.find((p) => p.id === orderId);
  const proposedEvent = s.microSubstitutions.find((e) => e.id === selected);
  const proposedId =
    selectedOrder && proposedEvent
      ? proposedEvent[selectedOrder.family === "ROSADO" ? "rosado_formula_id" : "verde_formula_id"]
      : null;
  const proposedFormula = s.microFormulas.find((f) => f.id === proposedId);
  const policy = policies.find((p) => p.id === selected);
  return (
    <section aria-label="Sustituciones autorizadas">
      <h3>Sustituciones autorizadas</h3>
      <p>
        Colina y biocolina conservan identidades, existencias y costos independientes. Las dosis proceden de
        una aprobación técnica privada para ambas familias.
      </p>
      {!policies.length && <p>Sin políticas de sustitución aprobadas. La operación está bloqueada.</p>}
      {canWrite && !mode && (
        <div className="form-actions">
          {[
            ["MICRO_SUBSTITUTE", "Registrar sustitución autorizada"],
            ["MICRO_ADOPT", "Proponer cambio de receta pendiente"],
            ["MICRO_GROUP_LINK", "Vincular grupo a tanda"],
          ].map(([key, label]) => (
            <button
              key={key}
              ref={(node) => {
                if (node && triggerAction.current === key) trigger.current = node;
              }}
              type="button"
              disabled={busy || (key === "MICRO_SUBSTITUTE" && !policies.length)}
              onClick={(e) => {
                trigger.current = e.currentTarget;
                triggerAction.current = key;
                requests.reset();
                setRevision(s.revision);
                setSelected("");
                setOrderId("");
                setReason("");
                setGroup("");
                setConsent(false);
                setMode(key);
              }}
            >
              {label}
            </button>
          ))}
        </div>
      )}
      {mode && (
        <form
          ref={form}
          onSubmit={async (e) => {
            e.preventDefault();
            const payload =
              mode === "MICRO_SUBSTITUTE"
                ? { policy_id: selected, reason, expected_revision: revision }
                : mode === "MICRO_ADOPT"
                  ? {
                      preparation_id: orderId,
                      substitution_id: selected,
                      consent,
                      reason,
                      expected_revision: revision,
                    }
                  : { preparation_id: orderId, group_reference: group, reason, expected_revision: revision };
            const request = requests.begin(JSON.stringify(payload));
            if (!request) return;
            try {
              if (await run(mode, payload, request)) {
                requests.reset();
                setMode("");
              }
            } finally {
              requests.finish();
            }
          }}
        >
          <fieldset disabled={busy}>
            <legend>
              {mode === "MICRO_SUBSTITUTE"
                ? "Nueva versión futura en ambas familias"
                : mode === "MICRO_ADOPT"
                  ? "Revisar cambio propuesto"
                  : "Referencia compartida de tanda"}
            </legend>
            {mode !== "MICRO_SUBSTITUTE" && (
              <Field label="Preparación del grupo">
                <select
                  required
                  value={orderId}
                  onChange={(e) => {
                    setOrderId(e.target.value);
                    setConsent(false);
                  }}
                >
                  <option value="">Seleccione preparación</option>
                  {(mode === "MICRO_ADOPT"
                    ? pending
                    : sortedPreparations.filter(
                        (p) =>
                          p.id === orderId ||
                          !s.microPreparationGroups.some((g) => g.preparation_id === p.id),
                      )
                  ).map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.family} · {p.nuclei_hundredths / 100} núcleos · {p.id}
                    </option>
                  ))}
                </select>
              </Field>
            )}
            {mode === "MICRO_SUBSTITUTE" && (
              <>
                <Field label="Aprobación técnica">
                  <select
                    required
                    value={selected}
                    onChange={(e) => {
                      setSelected(e.target.value);
                      setConsent(false);
                    }}
                  >
                    <option value="">Seleccione aprobación</option>
                    {sortedPolicies
                      .filter(
                        (p) => p.id === selected || !s.microSubstitutions.some((e) => e.policy_id === p.id),
                      )
                      .map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.reference}
                        </option>
                      ))}
                  </select>
                </Field>
                {policy &&
                  Object.entries(policy.families).map(([family, f]) => (
                    <div key={family}>
                      <h4>{family}</h4>
                      <p>Fórmula histórica: {f.source_formula_id}</p>
                      {f.lines.map((l) => (
                        <p key={l.micro_ingredient_id}>
                          {s.microIngredients.find((m) => m.id === l.micro_ingredient_id)?.name}: nueva dosis{" "}
                          {weight(l.dose_grams)}/núcleo
                        </p>
                      ))}
                    </div>
                  ))}
              </>
            )}
            {mode === "MICRO_ADOPT" && (
              <>
                <Field label="Sustitución propuesta">
                  <select
                    required
                    value={selected}
                    onChange={(e) => {
                      setSelected(e.target.value);
                      setConsent(false);
                    }}
                  >
                    <option value="">Seleccione sustitución</option>
                    {sortedSubstitutions
                      .filter((e) => {
                        const p = pending.find((p) => p.id === orderId);
                        return (
                          p &&
                          p.formula_id === (p.family === "ROSADO" ? e.source_rosado_id : e.source_verde_id)
                        );
                      })
                      .map((e) => (
                        <option key={e.id} value={e.id}>
                          {e.approval_reference}
                        </option>
                      ))}
                  </select>
                </Field>
                <p>
                  Receta histórica:{" "}
                  {s.microPreparations.find((p) => p.id === orderId)?.formula_id ??
                    "Seleccione una preparación"}
                  . Se conservará íntegra y quedará supersedida. Se liberará su asignación sin consumo y se
                  creará una orden sucesora sin asignar.
                </p>
                {proposedEvent && selectedOrder && (
                  <div aria-label="Comparación de recetas">
                    <p>
                      Nueva fórmula versión {proposedFormula?.version}: {proposedId}
                    </p>
                    <p>
                      Aprobación: {proposedEvent.approval_reference} · Autor:{" "}
                      {s.users.find((u) => u.id === proposedEvent.created_by)?.name ??
                        proposedEvent.created_by}{" "}
                      · Motivo: {proposedEvent.reason}
                    </p>
                    {[
                      ["Receta histórica", selectedOrder.formula_id],
                      ["Receta propuesta", proposedId],
                    ].map(([label, id]) => (
                      <div key={label}>
                        <h4>{label}</h4>
                        {s.microFormulaLines
                          .filter((l) => l.formula_id === id)
                          .map((l) => (
                            <p key={l.id}>
                              {l.name_snapshot}: {weight(l.dose_grams)}/núcleo
                            </p>
                          ))}
                      </div>
                    ))}
                  </div>
                )}
                <label>
                  <input
                    type="checkbox"
                    checked={consent}
                    required
                    onChange={(e) => setConsent(e.target.checked)}
                  />{" "}
                  Confirmo expresamente adoptar la nueva fórmula de esta preparación pendiente
                </label>
              </>
            )}
            {mode === "MICRO_GROUP_LINK" && (
              <Input label="Referencia de tanda" required maxLength={100} value={group} onChange={setGroup} />
            )}
            <Input label="Motivo" required value={reason} onChange={setReason} />
          </fieldset>
          <div className="form-actions">
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                requests.reset();
                setMode("");
              }}
            >
              Cancelar cambio
            </button>
            <button type="submit" disabled={busy || (mode === "MICRO_ADOPT" && !consent)} className="primary">
              Confirmar operación autorizada
            </button>
          </div>
        </form>
      )}
      {s.microSubstitutions.map((e) => (
        <p key={e.id}>
          Aprobación {e.approval_reference} · Autor:{" "}
          {s.users.find((u) => u.id === e.created_by)?.name ?? e.created_by} · {e.created_at} · Motivo:{" "}
          {e.reason}
        </p>
      ))}
    </section>
  );
}
