import { alertWeight, type MicroAlertOverview } from "./preparation-view";

export function PreventiveAlerts({ alerts }: { alerts: MicroAlertOverview["preventive"] }) {
  const warnings = alerts.items.filter((item) => item.status !== "COVERED");
  return (
    <section aria-labelledby="micro-preventive-title">
      <h3 id="micro-preventive-title">Alertas preventivas · 20 núcleos</h3>
      <p>Mínimo por ingrediente: 20 veces la mayor dosis entre las fórmulas activas autorizadas.</p>
      {alerts.unavailable_families.length > 0 && (
        <p className="preparation-warning">
          Evaluación incompleta. Fórmula activa completa o autorización no disponible:{" "}
          {alerts.unavailable_families.map((f) => (f === "ROSADO" ? "Rosado" : "Verde/Amarillo")).join(", ")}.
          Los mínimos disponibles pueden ser parciales.
        </p>
      )}
      {warnings.map((item) => (
        <p key={item.micro_ingredient_id} className="preparation-warning">
          ID {item.operational_id} · {item.name}:{" "}
          {item.status === "UNAVAILABLE"
            ? "saldo no disponible; registre o revise la apertura."
            : `faltan ${alertWeight(item.missing_hundredths)} para el mínimo preventivo.`}{" "}
          Mínimo: {alertWeight(item.minimum_hundredths)}
          {item.status !== "UNAVAILABLE" && ` · Existencia física: ${alertWeight(item.physical_hundredths)}`}.
        </p>
      ))}
      {!warnings.length && !alerts.unavailable_families.length && <p>Mínimos preventivos cubiertos.</p>}
    </section>
  );
}
export function OrderAlerts({ items }: { items: MicroAlertOverview["by_order"][number]["items"] }) {
  return (
    <div aria-label="Alerta por orden">
      <h5>Faltantes de esta orden</h5>
      {items.map((item) => (
        <p key={item.micro_ingredient_id} className="preparation-warning">
          ID {item.operational_id} · {item.name}:{" "}
          {item.stock_source === "UNRECORDED"
            ? "saldo no disponible; no se presume existencia."
            : `faltan ${alertWeight(item.missing_hundredths)}.`}
        </p>
      ))}
    </div>
  );
}
