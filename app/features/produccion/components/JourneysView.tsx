import type { AppState, OpenModal } from "@/lib/domain-types";
import { journeyFamily, journeySummary } from "../domain/journey-view.mjs";
import { Empty, money, num, weight } from "@/shared/ui";
import type { Searchable } from "@/shared/types/admin";

export default function JourneysView({
  s,
  write,
  open,
  match,
  filter = "",
}: {
  s: AppState;
  write: boolean;
  open: OpenModal;
  match: (record: Searchable) => boolean;
  filter?: string;
}) {
  const journeys = s.productionJourneys
    .filter(
      (j) =>
        match({
          ...j,
          description: [
            j.notes,
            ...s.productionJourneyLines.filter((l) => l.journey_id === j.id).map((l) => l.product_name),
          ].join(" "),
        }) &&
        (!filter || journeySummary(s, j).status === filter),
    )
    .slice()
    .reverse();
  return (
    <div className="journey-list">
      <div className="section-heading">
        <div>
          <h2>Órdenes de jornada</h2>
          <p>Planificación y núcleos por producto. El cierre del molino queda pendiente.</p>
        </div>
      </div>
      {!journeys.length && <Empty text="No hay jornadas registradas." />}
      {journeys.map((j) => {
        const summary = journeySummary(s, j);
        return (
          <details key={j.id} open>
            <summary>
              {j.code} · {j.date} · {journeyStatus(summary.status)}
            </summary>
            <p>
              {s.users.find((u) => u.id === j.created_by)?.name} · {j.timezone}
              {j.notes && ` · ${j.notes}`}
            </p>
            {summary.lines.map((line) => (
              <section className="journey-line" key={line.id} aria-label={line.product_name}>
                <div className="section-heading">
                  <h3>{line.product_name}</h3>
                  <span>{journeyStatus(line.status)}</span>
                </div>
                <p>
                  Planificados: {num(line.nuclei_hundredths / 100)} núcleos · Vinculados:{" "}
                  {num(line.confirmed_hundredths / 100)} · Peso comercial previsto:{" "}
                  {weight(line.planned_weight_grams)}
                </p>
                <p>
                  Macrofórmula v{s.formulas.find((f) => f.id === line.formula_id)?.version} · Microfórmula v
                  {s.microFormulas.find((f) => f.id === line.micro_formula_id)?.version} ·{" "}
                  {line.family === "ROSADO" ? "Rosado" : "Verde / Amarillo"}
                </p>
                <details>
                  <summary>Insumos y costos de {line.product_name}</summary>
                  <ul>
                    {line.macro_estimate.map((m) => (
                      <li key={m.ingredient_id}>
                        {m.name}: {weight(m.grams)} previstos · {money(m.estimated_cents)} estimados
                      </li>
                    ))}
                  </ul>
                </details>
                {line.links.map((link) => (
                  <div key={link.id} className="journey-reference">
                    <p>
                      {num(link.nuclei_hundredths / 100)} núcleos · Preparación {link.preparation_id} ·
                      Microfórmula v{s.microFormulas.find((f) => f.id === link.formula_id)?.version}
                      {link.group_reference && ` · Grupo ${link.group_reference}`}
                    </p>
                    <p>
                      Costo atribuido exacto: {link.cost_cents.n}/{link.cost_cents.d} céntimos (referencia al
                      consumo original)
                    </p>
                    <details>
                      <summary>Consumos atribuidos</summary>
                      <ul>
                        {link.consumptions.map((c) => (
                          <li key={c.issue_id}>
                            {s.microIngredients.find((m) => m.id === c.micro_ingredient_id)?.name}:{" "}
                            {c.quantity_hundredths.n}/{c.quantity_hundredths.d} centésimas de gramo
                          </li>
                        ))}
                      </ul>
                    </details>
                  </div>
                ))}
                <p>Merma: pendiente del molino · Costo final: pendiente</p>
                {write && line.confirmed_hundredths < line.nuclei_hundredths && (
                  <button onClick={() => open("journey-link", { id: line.id })}>
                    Vincular núcleos a {line.product_name}
                  </button>
                )}
              </section>
            ))}
          </details>
        );
      })}
    </div>
  );
}
export function journeyStatus(status: string) {
  return status === "READY"
    ? "Núcleos vinculados"
    : status === "PARTIAL"
      ? "Vinculación parcial"
      : "Pendiente de núcleos";
}
export { journeyFamily };
