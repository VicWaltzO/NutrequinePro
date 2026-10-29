import { TriangleAlert } from "lucide-react";
import type { AppState, OpenModal } from "@/lib/domain-types";
import { pendingStock } from "../domain/pending-stock.mjs";

function units(quantity: number, unit: string) {
  const names: Record<string, [string, string]> = {
    BAG: ["saco", "sacos"],
    BOTTLE: ["frasco", "frascos"],
    UNIT: ["unidad", "unidades"],
  };
  const labels = names[unit] ?? names.UNIT;
  return `${quantity} ${labels[quantity === 1 ? 0 : 1]}`;
}
const supplyLabels: Record<string, string> = {
  NUCLEUS_PRODUCTION: "Por producir",
  DIRECT_STOCK: "Por abastecer",
  UNKNOWN: "Abastecimiento por determinar",
};

export default function PendingStockBanner({ state, open }: { state: AppState; open: OpenModal }) {
  const pending = pendingStock(state);
  if (!pending.orders) return null;
  const summary = `${pending.orders} ${pending.orders === 1 ? "pedido pendiente" : "pedidos pendientes"} por stock`;
  return (
    <section className="pending-stock" aria-label="Pedidos pendientes por stock">
      <div className="pending-stock-summary">
        <TriangleAlert size={20} aria-hidden="true" />
        <p role="status" aria-live="polite" aria-atomic="true">
          <strong>{summary}</strong>
          {pending.productionBags > 0 && <span> · {units(pending.productionBags, "BAG")} por producir</span>}
          {pending.groups
            .filter((group) => group.supply !== "NUCLEUS_PRODUCTION")
            .map((group) => (
              <span key={group.key}>
                {" "}
                · {group.name}: {units(group.missing, group.unit)}{" "}
                {group.supply === "DIRECT_STOCK" ? "por abastecer" : "por clasificar"}
              </span>
            ))}
        </p>
      </div>
      <details>
        <summary>Ver faltantes por producto y presentación</summary>
        <p className="pending-stock-help">
          Faltantes netos según cobertura registrada. La cobertura completa no registra la entrega.
        </p>
        <ul className="pending-stock-products">
          {pending.groups.map((group) => (
            <li key={group.key}>
              <div className="pending-stock-product">
                <strong>
                  {group.name} · {group.grams / 1000} kg por {units(1, group.unit).slice(2)}
                </strong>
                <span>
                  {units(group.missing, group.unit)} · {supplyLabels[group.supply]}
                </span>
              </div>
              <ul
                className="pending-stock-orders"
                aria-label={`Pedidos de ${group.name}, ${group.grams / 1000} kg`}
              >
                {group.orders.map((order) => (
                  <li key={order.id}>
                    <button className="text-button" onClick={() => open("sale-detail", { id: order.id })}>
                      Ver venta {order.code}
                    </button>
                    <span>
                      {units(order.missing, group.unit)} · Entrega: {order.deliveryDate ?? "sin fecha propia"}
                    </span>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      </details>
    </section>
  );
}
