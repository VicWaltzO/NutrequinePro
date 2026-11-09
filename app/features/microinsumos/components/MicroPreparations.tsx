import { adminFetch } from "@/client/session-api";
import { createCommandRequest } from "@/lib/command-request.mjs";
import { useEffect, useRef, useState } from "react";
import type { AppState, Submit } from "@/lib/domain-types";
import { Input, Field } from "@/shared/ui";

interface Evaluation {
  id: string;
  sufficiency: "MISSING" | "POTENTIALLY_RESUMABLE";
  items: {
    micro_ingredient_id: string;
    name: string;
    operational_id: number;
    required_hundredths: number;
    available_hundredths: number;
    missing_hundredths: number;
    stock_source: string;
  }[];
}
interface Overview {
  can_create: boolean;
  revision: number;
  evaluated_at: string;
  authorizations: { formula_id: string; family: string }[];
  orders: Evaluation[];
}
// Exact decimal kg: one hundredth of a gram = 0.00001 kg.
export function exactKg(value: number) {
  return `${Math.floor(value / 100000)}.${String(value % 100000).padStart(5, "0")}`;
}
export default function MicroPreparations({ s, run, busy }: { s: AppState; run: Submit; busy: boolean }) {
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
          setData(null);
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
      <h3 id="micro-preparations-title">Preparaciones pendientes</h3>
      <p>Registre la intención de preparar núcleos. Ningún núcleo se ha preparado ni consumido al guardar.</p>
      <p className="preparation-warning">
        El saldo es compartido entre órdenes. La suficiencia es informativa: no garantiza atención simultánea,
        no asigna ni reserva ingredientes.
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
          const recipe = s.microFormulas.find((f) => f.id === order.formula_id);
          return (
            <article key={order.id} className="preparation-record" aria-label={`Preparación ${order.id}`}>
              <h4>
                {order.family === "ROSADO" ? "Rosado" : "Verde/Amarillo"} · {order.nuclei_hundredths / 100}{" "}
                núcleos planificados
              </h4>
              <p className="preparation-warning">
                Pendiente
                {evaluation
                  ? evaluation.sufficiency === "MISSING"
                    ? " por faltantes"
                    : " · Potencialmente reanudable: puede solicitar asignación"
                  : " · Evaluación pendiente"}
              </p>
              <p>
                Fecha prevista: {order.date} · Fórmula versión {recipe?.version} · {order.formula_id}
              </p>
              <p>
                Registrado por {s.users.find((u) => u.id === order.created_by)?.name ?? order.created_by} ·{" "}
                {order.created_at}
              </p>
              <details>
                <summary>Necesidades y faltantes por microinsumo</summary>
                {evaluation?.items.map((item) => (
                  <div key={item.micro_ingredient_id} className="preparation-item">
                    <strong>
                      ID {item.operational_id} · {item.name}
                    </strong>
                    <p>
                      Requerido: {exactKg(item.required_hundredths)} kg · Disponible:{" "}
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
