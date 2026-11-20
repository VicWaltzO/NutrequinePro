import { useEffect, useState } from "react";
import { TriangleAlert } from "lucide-react";
import { adminFetch, onSessionRequired, onSessionRestored } from "@/client/session-api";
import { alertWeight, type MicroAlertOverview } from "./preparation-view";
import type { AppState } from "@/lib/domain-types";

interface Snapshot {
  revision: number;
  alerts: MicroAlertOverview;
}

// Only retain the existing public preventive projection, never recipes or order evaluations.
export default function GlobalMicroAlerts({ state, context }: { state: AppState; context: string }) {
  const revision = state.revision;
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let active = true;
    // Each effect owns its requests. Cleanup also invalidates the entire effect
    // through active, so a previous revision/session cannot publish into this one.
    let sequence = 0;
    let controller: AbortController | undefined;
    const load = async () => {
      const request = ++sequence;
      controller?.abort();
      controller = new AbortController();
      setLoading(true);
      setError(false);
      try {
        const response = await adminFetch("/api/micro-preparations", { signal: controller.signal });
        const next: Snapshot = await response.json();
        if (!active || request !== sequence) return;
        if (next.revision !== revision) throw new Error("Revisión diferente");
        setSnapshot({
          revision: next.revision,
          alerts: { preventive: next.alerts.preventive, by_order: [] },
        });
      } catch {
        if (active && request === sequence) setError(true);
      } finally {
        if (active && request === sequence) setLoading(false);
      }
    };
    const unsubscribe = onSessionRequired(() => {
      ++sequence;
      controller?.abort();
      setSnapshot(null);
      setError(true);
      setLoading(false);
    });
    const unsubscribeRestored = onSessionRestored(load);
    void load();
    window.addEventListener("focus", load);
    return () => {
      active = false;
      ++sequence;
      controller?.abort();
      unsubscribe();
      unsubscribeRestored();
      window.removeEventListener("focus", load);
    };
  }, [revision, state, context]);

  const current = snapshot?.revision === revision;
  const preventive = current ? snapshot.alerts.preventive : null;
  return <MicroAlertBanner preventive={preventive} loading={loading || (!current && !error)} error={error} />;
}

export function MicroAlertBanner({
  preventive,
  loading,
  error,
}: {
  preventive: MicroAlertOverview["preventive"] | null;
  loading: boolean;
  error: boolean;
}) {
  const warnings = preventive?.items.filter((item) => item.status !== "COVERED") ?? [];
  const low = warnings.filter((item) => item.status === "LOW").length;
  const unknown = warnings.length - low;
  const incomplete = !!preventive?.unavailable_families.length;
  if (!loading && !error && !warnings.length && !incomplete) return null;
  return (
    <section className="pending-stock global-micro-alerts" aria-label="Alertas globales de microinsumos">
      <div className="pending-stock-summary">
        <TriangleAlert size={20} aria-hidden="true" />
        <p role="status" aria-live="polite" aria-atomic="true">
          <strong>
            {loading
              ? "Actualizando avisos de microinsumos…"
              : error
                ? "Avisos de microinsumos no disponibles. Vuelva a actualizar los datos."
                : low
                  ? `${low} ${low === 1 ? "microinsumo requiere" : "microinsumos requieren"} reposición`
                  : "Microinsumos: evaluación incompleta"}
          </strong>
          {!loading && !error && unknown > 0 && <span> · {unknown} con saldo no disponible</span>}
          {!loading && !error && incomplete && <span> · Mínimos incompletos</span>}
        </p>
      </div>
      <details>
        <summary>Ver detalle de microinsumos</summary>
        {(loading || error) && (
          <p className="pending-stock-help">
            El detalle anterior no se presenta como vigente. Actualice los datos para consultar los mínimos.
          </p>
        )}
        {!loading && !error && preventive && (
          <>
            {incomplete && (
              <p className="pending-stock-help">
                Evaluación incompleta. Fórmula activa completa o autorización no disponible:{" "}
                {preventive.unavailable_families
                  .map((family) => (family === "ROSADO" ? "Rosado" : "Verde/Amarillo"))
                  .join(", ")}
                . Los mínimos disponibles pueden ser parciales.
              </p>
            )}
            <ul className="pending-stock-products" aria-label="Microinsumos con incidencias">
              {warnings.map((item) => (
                <li key={item.micro_ingredient_id}>
                  <strong>
                    ID {item.operational_id} · {item.name}
                  </strong>
                  <p>
                    {item.status === "UNAVAILABLE"
                      ? "Saldo no disponible; registre o revise la apertura."
                      : `Faltan ${alertWeight(item.missing_hundredths)} para el mínimo preventivo.`}
                  </p>
                </li>
              ))}
            </ul>
          </>
        )}
      </details>
    </section>
  );
}
