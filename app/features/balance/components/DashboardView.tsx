"use client";
import Image from "next/image";
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
  return (
    <>
      <div className="overview-banner">
        <div>
          <span className="eyebrow">CONTROL DE OPERACIONES</span>
          <h2>Producción y entregas</h2>
          <p>
            {
              state.sales.filter(
                (x) =>
                  x.fulfillment_status === "PENDING" && !["DRAFT", "CANCELLED"].includes(x.commercial_status),
              ).length
            }{" "}
            ventas pendientes de entrega · {state.productions.filter((x) => x.status === "DRAFT").length}{" "}
            lotes a producir
          </p>
        </div>
        <Image width={150} height={150} unoptimized src="/brand/logo.jpg" alt="Logo Nutrequine Pro" />
      </div>
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
          <h2>En operación</h2>
          <button
            className="operation-link"
            onClick={() => {
              go("productions", "draft");
            }}
          >
            <Factory size={20} />
            <div>
              <strong>{state.productions.filter((x) => x.status === "DRAFT").length} lotes a producir</strong>
              <small>Planificación pendiente</small>
            </div>
            <ChevronRight size={16} />
          </button>
          <button
            className="operation-link"
            onClick={() => {
              go("sales", "future");
            }}
          >
            <Package size={20} />
            <div>
              <strong>
                {
                  state.sales.filter(
                    (x) =>
                      x.fulfillment_status === "PENDING" &&
                      !["DRAFT", "CANCELLED"].includes(x.commercial_status),
                  ).length
                }{" "}
                ventas futuras
              </strong>
              <small>Por entregar</small>
            </div>
            <ChevronRight size={16} />
          </button>
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
        </section>
      </div>
    </>
  );
}
