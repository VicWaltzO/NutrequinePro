import SubstitutionActions from "./SubstitutionActions";
import ConfirmationActions from "./ConfirmationActions";
import { exactKg, rationalMoney, type Evaluation } from "./preparation-view";
import AssignmentActions from "./AssignmentActions";
import { adminFetch } from "@/client/session-api";
import { createCommandRequest } from "@/lib/command-request.mjs";
import { useEffect, useRef, useState } from "react";
import type { AppState, Submit } from "@/lib/domain-types";
import { Input, Field } from "@/shared/ui";

interface Overview {
  can_create: boolean;
  substitutions: import("@/lib/domain-types").MicroSubstitutionPolicy[];
  revision: number;
  evaluated_at: string;
  authorizations: { formula_id: string; family: string }[];
  orders: Evaluation[];
}
export default function MicroPreparations({ s, run, busy }: { s: AppState; run: Submit; busy: boolean }) {
  const seenConfirmations = useRef(new Set(s.microConfirmations.map((c) => c.id)));
  useEffect(() => {
    const added = s.microConfirmations.find((c) => !seenConfirmations.current.has(c.id));
    seenConfirmations.current = new Set(s.microConfirmations.map((c) => c.id));
    if (added) document.getElementById(`confirmation-${added.id}`)?.focus();
  }, [s.microConfirmations]);
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState("");
  const [refresh, setRefresh] = useState(0);
  const [editing, setEditing] = useState(false);
  const [family, setFamily] = useState("ROSADO");
  const [nuclei, setNuclei] = useState("");
  const [date, setDate] = useState("");
  const form = useRef<HTMLFormElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const [requests] = useState(createCommandRequest);
  const [selection, setSelection] = useState<{ formula_id: string | null; revision: number }>({
    formula_id: null,
    revision: 0,
  });
  useEffect(() => {
    const controller = new AbortController();
    let current = true;
    const load = async () => {
      try {
        const response = await adminFetch("/api/micro-preparations", { signal: controller.signal });
        if (!response.ok) throw new Error("No se pudo evaluar el saldo. Vuelva a consultar.");
        const next: Overview = await response.json();
        if (current) {
          setData(next);
          setError("");
        }
      } catch (e) {
        if (current && !controller.signal.aborted) {
          // Retain the last evaluation so a transport-uncertain operation keeps its request ID.
          setError(e instanceof Error ? e.message : "No se pudo consultar.");
        }
      }
    };
    void load();
    const focus = () => {
      void load();
    };
    window.addEventListener("focus", focus);
    return () => {
      current = false;
      controller.abort();
      window.removeEventListener("focus", focus);
    };
  }, [s.revision, refresh]);
  useEffect(() => {
    if (editing) form.current?.querySelector("select")?.focus();
    else trigger.current?.focus();
  }, [editing]);
  const active = selection.formula_id;
  const formula = s.microFormulas.find((f) => f.id === active);
  const approved = data?.authorizations.some((a) => a.formula_id === active);
  return (
    <section className="micro-preparations" aria-labelledby="micro-preparations-title">
      <SubstitutionActions
        s={s}
        run={run}
        busy={busy}
        policies={data?.substitutions ?? []}
        canWrite={data?.can_create ?? false}
      />
      <h3 id="micro-preparations-title">Preparaciones pendientes</h3>
      <p>Registre la intención de preparar núcleos. Ningún núcleo se ha preparado ni consumido al guardar.</p>
      <p className="preparation-warning">
        El saldo libre es compartido entre órdenes. La suficiencia es informativa: no garantiza atención
        simultánea. Elija una orden para asignarle todos sus ingredientes; asignar no consume material.
      </p>
      <button type="button" disabled={busy} onClick={() => setRefresh((value) => value + 1)}>
        Reevaluar materiales
      </button>
      {error && <p role="alert">{error}</p>}
      {!data && !error && <p role="status">Consultando materiales…</p>}
      {data && (
        <p>
          Evaluado:{" "}
          <time dateTime={data.evaluated_at}>{new Date(data.evaluated_at).toLocaleString("es-PE")}</time>
        </p>
      )}
      {data?.can_create && !editing && (
        <button
          ref={trigger}
          type="button"
          disabled={busy}
          onClick={() => {
            requests.reset();
            setSelection({
              formula_id: s.microFormulaHeads.find((h) => h.family === family)?.active_formula_id ?? null,
              revision: data.revision,
            });
            setNuclei("");
            setDate("");
            setEditing(true);
          }}
        >
          Nueva preparación pendiente
        </button>
      )}
      {data?.can_create && editing && (
        <form
          ref={form}
          onSubmit={async (event) => {
            event.preventDefault();
            if (!approved || !formula) return;
            const payload = {
              family,
              formula_id: formula.id,
              nuclei,
              date,
              expected_revision: selection.revision,
            };
            const requestId = requests.begin(JSON.stringify(payload));
            if (!requestId) return;
            try {
              if (await run("MICRO_PREPARATION_CREATE", payload, requestId)) {
                requests.reset();
                setEditing(false);
              }
            } finally {
              requests.finish();
              setRefresh((value) => value + 1);
            }
          }}
        >
          <h4>Nueva preparación pendiente</h4>
          <fieldset disabled={busy}>
            <Field label="Familia de núcleo">
              <select
                aria-label="Familia de núcleo"
                value={family}
                onChange={(e) => {
                  setFamily(e.target.value);
                  setSelection({
                    formula_id:
                      s.microFormulaHeads.find((h) => h.family === e.target.value)?.active_formula_id ?? null,
                    revision: data.revision,
                  });
                }}
              >
                <option value="ROSADO">Rosado · Potripregnant</option>
                <option value="VERDE_AMARILLO">Verde/Amarillo · Hi-Performance y Nutrelin Adulto</option>
              </select>
            </Field>
            <Input
              label="Núcleos planificados"
              value={nuclei}
              onChange={setNuclei}
              inputMode="decimal"
              required
            />
            <Input
              label="Fecha de preparación prevista"
              value={date}
              onChange={setDate}
              type="date"
              required
            />
          </fieldset>
          <p>
            {formula ? `Fórmula publicada versión ${formula.version} · ${formula.id}` : "Sin fórmula activa."}
          </p>
          {!approved && (
            <p role="status">
              Falta autorización privada de la receta completa. Solicite su revisión al administrador.
            </p>
          )}
          <div className="form-actions">
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                requests.reset();
                setEditing(false);
              }}
            >
              Cancelar preparación
            </button>
            <button type="submit" className="primary" disabled={busy || !approved}>
              Guardar preparación pendiente
            </button>
          </div>
        </form>
      )}
      {!s.microPreparations.length && <p>Aún no hay preparaciones pendientes.</p>}
      {s.microPreparations
        .slice()
        .reverse()
        .map((order) => {
          const evaluation = data?.orders.find((entry) => entry.id === order.id);
          const supersession = s.microSupersessions.find((e) => e.source_id === order.id);
          const group = s.microPreparationGroups.find((g) => g.preparation_id === order.id);
          const confirmation = s.microConfirmations.find((c) => c.preparation_id === order.id);
          // Keep a transport-uncertain confirmation mounted until its stable replay resolves.
          const locallyAssigned = s.microAssignments.some(
            (a) =>
              a.preparation_id === order.id &&
              !s.microAssignmentReversals.some((r) => r.assignment_id === a.id),
          );
          const recipe = s.microFormulas.find((f) => f.id === order.formula_id);
          return (
            <article key={order.id} className="preparation-record" aria-label={`Preparación ${order.id}`}>
              <h4>
                {order.family === "ROSADO" ? "Rosado" : "Verde/Amarillo"} · {order.nuclei_hundredths / 100}{" "}
                núcleos planificados
              </h4>
              <p className="preparation-warning">
                {confirmation
                  ? "Cerrada definitivamente"
                  : supersession
                    ? "Supersedida; no ejecutable"
                    : "Pendiente"}
                {!confirmation &&
                  !supersession &&
                  (evaluation?.assignment_status === "ASSIGNED"
                    ? " · Ingredientes asignados, sin consumir"
                    : evaluation
                      ? evaluation.sufficiency === "MISSING"
                        ? " por faltantes"
                        : " · Potencialmente reanudable: puede solicitar asignación"
                      : " · Evaluación pendiente")}
              </p>
              {group && (
                <p>
                  Tanda: {group.group_reference} · Grupo: {order.id}
                </p>
              )}
              {supersession && (
                <p>
                  Sucesora: {supersession.target_id} · Aprobación: {supersession.approval_reference} · Motivo:{" "}
                  {supersession.reason}
                </p>
              )}
              <p>
                Fecha prevista: {order.date} · Fórmula versión {recipe?.version} · {order.formula_id}
              </p>
              <p>
                Registrado por {s.users.find((u) => u.id === order.created_by)?.name ?? order.created_by} ·{" "}
                {order.created_at}
              </p>
              {!confirmation && !supersession && data?.can_create && evaluation && (
                <AssignmentActions
                  orderId={order.id}
                  evaluation={evaluation}
                  revision={data.revision}
                  run={run}
                  busy={busy}
                  onRefresh={() => setRefresh((v) => v + 1)}
                />
              )}
              {!confirmation && !supersession && data?.can_create && locallyAssigned && (
                <ConfirmationActions
                  orderId={order.id}
                  planned={order.nuclei_hundredths}
                  revision={data.revision}
                  run={run}
                  busy={busy}
                  onRefresh={() => setRefresh((v) => v + 1)}
                />
              )}
              {confirmation && (
                <div
                  id={`confirmation-${confirmation.id}`}
                  role="status"
                  tabIndex={-1}
                  aria-label="Resultado de preparación"
                >
                  <p>
                    Terminados reales: {confirmation.nuclei_hundredths / 100}. Restantes sin preparar:{" "}
                    {(order.nuclei_hundredths - confirmation.nuclei_hundredths) / 100}; requieren una orden
                    nueva.
                  </p>
                  <p>
                    Costo real total: {rationalMoney(confirmation.total_cost_cents)} · Costo por núcleo:{" "}
                    {rationalMoney(confirmation.unit_cost_cents)}.
                  </p>
                  <details>
                    <summary>Costos exactos</summary>
                    <p>
                      Total {confirmation.total_cost_cents.n}/{confirmation.total_cost_cents.d} céntimos; por
                      núcleo {confirmation.unit_cost_cents.n}/{confirmation.unit_cost_cents.d} céntimos. Los
                      importes S/ son de presentación.
                    </p>
                  </details>
                  <p>
                    Confirmado por{" "}
                    {s.users.find((u) => u.id === confirmation.created_by)?.name ?? confirmation.created_by} ·{" "}
                    {confirmation.created_at}
                  </p>
                  {s.microIssues
                    .filter((i) => i.confirmation_id === confirmation.id)
                    .map((i) => (
                      <p key={i.id}>
                        ID {s.microIngredients.find((m) => m.id === i.micro_ingredient_id)?.operational_id}:
                        consumido {exactKg(i.quantity_hundredths)} kg · asignación liberada sin consumir{" "}
                        {exactKg(i.released_hundredths)} kg.
                      </p>
                    ))}
                </div>
              )}
              {s.microAssignments
                .filter((a) => a.preparation_id === order.id)
                .map((a) => {
                  const reversed = s.microAssignmentReversals.find((r) => r.assignment_id === a.id);
                  return (
                    <details key={a.id}>
                      <summary>
                        Historial de asignación ·{" "}
                        {reversed
                          ? "Revertida"
                          : confirmation?.assignment_id === a.id
                            ? "Liquidada por consumo"
                            : "Vigente"}
                      </summary>
                      <p>
                        Referencia: {a.id} · {a.created_at} ·{" "}
                        {s.users.find((u) => u.id === a.created_by)?.name ?? a.created_by}
                      </p>
                      <p>Motivo: {a.reason}</p>
                      {reversed && (
                        <p>
                          Reversión: {reversed.id} · {reversed.created_at} ·{" "}
                          {s.users.find((u) => u.id === reversed.created_by)?.name ?? reversed.created_by} ·{" "}
                          {reversed.reason}
                        </p>
                      )}
                    </details>
                  );
                })}
              <details>
                <summary>
                  {confirmation
                    ? "Receta histórica y saldo actual"
                    : "Necesidades y faltantes por microinsumo"}
                </summary>
                {evaluation?.items.map((item) => (
                  <div key={item.micro_ingredient_id} className="preparation-item">
                    <strong>
                      ID {item.operational_id} · {item.name}
                    </strong>
                    <p>
                      Requerido: {exactKg(item.required_hundredths)} kg · Asignado a esta orden:{" "}
                      {exactKg(item.own_assigned_hundredths)} kg · Físico: {exactKg(item.physical_hundredths)}{" "}
                      kg · Asignado total: {exactKg(item.assigned_hundredths)} kg · Libre:{" "}
                      {exactKg(item.available_hundredths)} kg · Faltante: {exactKg(item.missing_hundredths)}{" "}
                      kg
                    </p>
                    {item.stock_source === "UNRECORDED" && (
                      <p>Sin saldo registrado; no se presume existencia.</p>
                    )}
                  </div>
                ))}
                <p>
                  Orden: {order.id} · Autorización: {order.authorization_reference}
                </p>
              </details>
            </article>
          );
        })}
    </section>
  );
}
