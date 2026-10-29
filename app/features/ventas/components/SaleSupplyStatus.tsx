import type { Sale, SaleSummary, AppState } from "@/lib/domain-types";
import { unitLabels } from "@/shared/domain/presentation.mjs";
import { find, kg } from "@/shared/ui";

/** Read-only presentation of the domain contract; never allocates or infers coverage. */
export function SaleSupplyStatus({
  sale,
  summary,
  state,
}: {
  sale: Sale;
  summary: SaleSummary;
  state: AppState;
}) {
  if (["DRAFT", "CANCELLED"].includes(sale.commercial_status)) return null;
  if (sale.coverage_version !== 1) {
    return (
      <section className="sale-supply" aria-label="Abastecimiento">
        <h3>Abastecimiento</h3>
        <p>Flujo legacy · sin cobertura registrada.</p>
        <p className="metadata">
          {sale.fulfillment_status === "DELIVERED"
            ? "Entrega registrada en el flujo legacy. Este registro no acredita un recuento físico."
            : "La disponibilidad se valida al entregar; este pedido no tiene unidades reservadas acreditadas."}
        </p>
      </section>
    );
  }
  return (
    <section className="sale-supply" aria-label="Abastecimiento">
      <h3>Abastecimiento</h3>
      <p role="status">
        <strong>{summary.coverage_label}</strong>
        {sale.fulfillment_status === "DELIVERED" ? " · Entregado" : " · Entrega pendiente"}
      </p>
      {summary.coverage_lines?.map(({ item, covered, missing }) => (
        <p key={item.id} className="sale-supply-line">
          {find(state, "products", item.product_id)?.name} · {kg(item.unit_weight_kg)} kg por{" "}
          {unitLabels(item).singular}: {covered} de {item.quantity} {unitLabels(item).plural} cubiertos.
          {missing > 0 && (
            <strong>
              {missing === 1 ? " Falta " : " Faltan "}
              {missing} {missing === 1 ? unitLabels(item).singular : unitLabels(item).plural}.
            </strong>
          )}
        </p>
      ))}
      <p className="metadata">
        La cobertura no acredita entrega ni recuento físico. El pago es independiente.
      </p>
    </section>
  );
}
