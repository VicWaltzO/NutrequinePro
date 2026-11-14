import type { AppState } from "@/lib/domain-types";
import { money } from "@/shared/ui";
import { millCostSummary, millCostHistory, roundedCost } from "../domain/mill-cost.mjs";

export function MillCostDetail({ s, lineId }: { s: AppState; lineId: string }) {
  const cost = millCostSummary(s, lineId);
  const amount = (value: number | null) => (value === null ? "Pendiente" : money(value));
  return (
    <section aria-label="Costo de fabricación informativo">
      <h3>Costo de fabricación informativo</h3>
      <p>
        Variable según la última conciliación confirmada y los costos documentados. No fija el costo de
        inventario ni modifica costos históricos.
      </p>
      <dl>
        <dt>Microinsumos históricos atribuidos</dt>
        <dd>{amount(roundedCost(cost.micro))}</dd>
        <dt>Macroinsumos de la conciliación</dt>
        <dd>{amount(cost.macros_cents)}</dd>
        <dt>Servicio S/250 por tonelada encargada</dt>
        <dd>{amount(cost.service_cents)}</dd>
        <dt>Envases consumidos</dt>
        <dd>{amount(cost.packaging_cents)}</dd>
        <dt>Otros costos directos documentados</dt>
        <dd>{amount(cost.extras_cents)}</dd>
        <dt>Costo total informativo</dt>
        <dd>{amount(roundedCost(cost.total))}</dd>
        <dt>Sacos completos reales</dt>
        <dd>{cost.actual_bags ?? "Pendientes"}</dd>
        <dt>Costo informativo por saco</dt>
        <dd>
          {cost.actual_bags === 0
            ? "Indefinido: cero sacos comercializables"
            : amount(roundedCost(cost.unit))}
        </dd>
      </dl>
      {!cost.complete && (
        <p>
          Complete el cierre, confirme una conciliación y registre los costos documentados para conocer el
          total.
        </p>
      )}
      <p>
        La merma normal se absorbe entre los sacos reales. El flete permanece separado. Importes mostrados a
        céntimos; el cálculo conserva fracciones exactas.
      </p>
      <details>
        <summary>Fuentes y versiones del costo</summary>
        <p>
          Conciliación vigente: {cost.charge_id ?? "Pendiente"} · Documento vigente:{" "}
          {cost.input_id ?? "Pendiente"}
        </p>
        {cost.total && (
          <p>
            Total exacto: {cost.total.n}/{cost.total.d} céntimos · Unitario exacto:{" "}
            {cost.unit ? `${cost.unit.n}/${cost.unit.d} céntimos` : "Indefinido"}
          </p>
        )}
        {millCostHistory(s, lineId).map((row) => (
          <div className="journey-reference" key={row.id}>
            <p>
              {row.created_at} · {s.users.find((u) => u.id === row.created_by)?.name} · {row.reason}
            </p>
            <p>
              Envases: {money(row.new_snapshot.packaging_cents)} · {row.new_snapshot.packaging_reference}
            </p>
            <ul>
              {row.new_snapshot.extras.map((extra, i) => (
                <li key={i}>
                  {extra.description}: {money(extra.amount_cents)} · {extra.reference}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </details>
    </section>
  );
}
