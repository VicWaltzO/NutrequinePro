import type { AppState, Sale, BalanceSummary } from "@/lib/domain-types";
import { Package, Factory, ChevronRight, ArrowUpRight } from "lucide-react";
import { Metrics, money } from "@/shared/ui";
import type { ReactNode } from "react";
export default function DashboardView({
  s: state,
  b,
  go,
  productCards,
  saleTable,
}: {
  s: AppState;
  b: BalanceSummary;
  go: (view: string, tab?: string) => void;
  productCards: ReactNode;
  saleTable: (rows: Sale[]) => ReactNode;
}) {
  const pendingDeliveries = state.sales.filter(
    (sale) =>
      sale.fulfillment_status === "PENDING" && !["DRAFT", "CANCELLED"].includes(sale.commercial_status),
  ).length;
  const plannedProductions = state.productions.filter((production) => production.status === "DRAFT").length;
  return (
    <>
      <section className="financial-overview" aria-label="Resumen financiero">
        <Metrics
          items={[
            { label: "Ventas registradas", value: money(b.sales) },
            { label: "Cobros reales", value: money(b.collections) },
            {
              label: "Saldo por cobrar",
              value: money(b.receivable),
              note: "Saldo a favor de clientes: " + money(b.customer_credit),
            },
            {
              label: "Resultado estimado",
              value: money(b.estimated_result),
              note: b.estimated_productions + " producciones con costo estimado",
            },
          ]}
        />
      </section>
      <section className="work-queue" aria-labelledby="work-queue-title">
        <div className="work-queue-heading">
          <h2 id="work-queue-title">Producción y entregas</h2>
          <p>Continúa donde hace falta.</p>
        </div>
        <button className="queue-action" onClick={() => go("productions", "draft")}>
          <span className="queue-icon">
            <Factory size={21} />
          </span>
          <span>
            <strong>{plannedProductions} lotes a producir</strong>
            <small>Planificación pendiente</small>
          </span>
          <ChevronRight size={17} />
        </button>
        <button className="queue-action" onClick={() => go("sales", "future")}>
          <span className="queue-icon delivery">
            <Package size={21} />
          </span>
          <span>
            <strong>{pendingDeliveries} ventas pendientes de entrega</strong>
            <small>Consulta las próximas entregas</small>
          </span>
          <ChevronRight size={17} />
        </button>
      </section>
      <div className="section-heading">
        <h2>Inventario de producto terminado</h2>
        <button className="text-button" onClick={() => go("inventory")}>
          Ver movimientos <ArrowUpRight size={15} />
        </button>
      </div>
      {productCards}
      <div className="dashboard-columns">
        <section className="panel">
          <div className="section-heading">
            <h2>Últimas ventas</h2>
            <button className="text-button" onClick={() => go("sales")}>
              Ver todas
            </button>
          </div>
          {saleTable(state.sales.slice(-5).reverse())}
        </section>
        <section className="panel compact">
          <h2>Costos de operación</h2>
          <p>Importes registrados en la operación.</p>
          <dl className="cost-summary">
            <div>
              <dt>Producción</dt>
              <dd>{money(b.costs)}</dd>
            </div>
            <div>
              <dt>Logística</dt>
              <dd>{money(b.logistics)}</dd>
            </div>
            <div>
              <dt>Otros gastos</dt>
              <dd>{money(b.other)}</dd>
            </div>
          </dl>
          <button className="text-button" onClick={() => go("balance")}>
            Consultar balance <ArrowUpRight size={15} />
          </button>
        </section>
      </div>
    </>
  );
}
