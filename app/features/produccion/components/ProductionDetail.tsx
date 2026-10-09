"use client";
import { productionSummary } from "@/lib/domain.mjs";
import { Table } from "@/shared/ui";
import { Metrics } from "@/shared/ui";
import { Badge } from "@/shared/ui";
import { History } from "@/shared/ui";
import { money } from "@/shared/ui";
import { kg } from "@/shared/ui";
import { find } from "@/shared/ui";
import { stamp } from "@/shared/ui";
import { label } from "@/shared/ui";
import type { DetailProps } from "@/shared/types/details";
export default function ProductionDetail({ s, actor, id, open, run }: DetailProps) {
  const admin = actor.role === "ADMIN",
    write = actor.role !== "VIEWER";
  const p = find(s, "productions", id);
  if (!p) return null;
  const a = productionSummary(s, p);
  return (
    <>
      <div className="detail-heading">
        <div>
          <span className="eyebrow">PRODUCCIÓN · {p.production_date}</span>
          <h2>{p.code}</h2>
          <p>{p.notes || "Producción por núcleos"}</p>
        </div>
        <Badge value={p.status} />
      </div>
      <Metrics
        items={[
          { label: "Producción", value: a.bags + " sacos", note: kg(a.weight) + " kg comerciales" },
          { label: "Estimado", value: money(a.estimated) },
          {
            label: a.reconciled ? "Costo real" : "Costo real parcial",
            value: money(a.real),
            note: "Variación " + money(a.variation),
          },
        ]}
      />
      {!a.reconciled && p.status !== "DRAFT" && p.status !== "CANCELLED" && (
        <p className="warning">Producción sin conciliar. Complete los cobros reales para cerrar.</p>
      )}
      <div className="detail-actions">
        {p.status === "DRAFT" && write && <button onClick={() => open("production", p)}>Editar lote</button>}
        {p.status === "DRAFT" && admin && (
          <button className="primary" onClick={() => run("PRODUCTION_CONFIRM", { id })}>
            Confirmar producción
          </button>
        )}
        {["CONFIRMED", "CLOSED"].includes(p.status) && admin && (
          <button onClick={() => open("production-quantities", p)}>Rectificar cantidades</button>
        )}
        {["CONFIRMED", "CLOSED"].includes(p.status) && admin && (
          <button onClick={() => open("reconcile", p)}>
            {p.status === "CLOSED" ? "Rectificar costos" : "Conciliar costos"}
          </button>
        )}
        {p.status === "CONFIRMED" && admin && (
          <button disabled={!a.reconciled} onClick={() => run("PRODUCTION_CLOSE", { id })}>
            Cerrar producción
          </button>
        )}
        {p.status !== "CANCELLED" && admin && (
          <button
            className="danger"
            onClick={() => open("reason", { ...p, _operation: "PRODUCTION_CANCEL" }, "reason")}
          >
            Anular
          </button>
        )}
      </div>
      <section className="panel">
        <h3>Productos y fórmula histórica</h3>
        <Table heads={["Producto", "Versión", "Núcleos", "Sacos", "Kg comerciales", "Kg fórmula"]}>
          {a.products.map((x) => (
            <tr key={x.id}>
              <td>{find(s, "products", x.product_id)?.name}</td>
              <td>v{find(s, "formulas", x.formula_id)?.version}</td>
              <td>{x.nuclei_count}</td>
              <td>{x.bags_produced}</td>
              <td>{kg(x.commercial_weight_kg)}</td>
              <td>{kg(x.formula_weight_kg)}</td>
            </tr>
          ))}
        </Table>
        {a.products.map((x) => (
          <details key={x.id}>
            <summary>Snapshot de fórmula · {find(s, "products", x.product_id)?.name}</summary>
            <Table heads={["Insumo", "Kg por núcleo"]}>
              {x.formula_snapshot?.map((f) => (
                <tr key={f.id}>
                  <td>{find(s, "ingredients", f.ingredient_id)?.name}</td>
                  <td>{kg(f.kg_per_nucleus)}</td>
                </tr>
              ))}
            </Table>
          </details>
        ))}
      </section>
      <section className="panel">
        <h3>Costos de insumos y diferencias</h3>
        <Table
          heads={[
            "Insumo",
            "Kg",
            "Precio histórico",
            "Bruto",
            "Descuento",
            "Neto teórico",
            "Cobro real",
            "Diferencia",
            "Pagado",
          ]}
        >
          {a.ingredients.map((x) => (
            <tr key={x.id}>
              <td>{find(s, "ingredients", x.ingredient_id)?.name}</td>
              <td>{kg(x.total_kg)}</td>
              <td>{money(x.historical_price_per_kg)}</td>
              <td>{money(x.theoretical_gross_cost)}</td>
              <td>{money(x.discount_amount)}</td>
              <td>{money(x.theoretical_net_cost)}</td>
              <td>{x.actual_charge === null ? "Pendiente" : money(x.actual_charge)}</td>
              <td>{x.difference === null ? "—" : money(x.difference)}</td>
              <td>{x.is_paid ? "Sí" : "No"}</td>
            </tr>
          ))}
        </Table>
      </section>
      <section className="panel">
        <h3>Costos adicionales</h3>
        <Table heads={["Categoría", "Descripción", "Cantidad", "Costo unitario", "Importe", "Pagado"]}>
          {a.costs.map((x) => (
            <tr key={x.id}>
              <td>{label(x.category)}</td>
              <td>
                {x.description}
                {x.ingredient_id && " · " + find(s, "ingredients", x.ingredient_id)?.name}
              </td>
              <td>{x.quantity ?? "—"}</td>
              <td>{x.unit_cost === undefined ? "—" : money(x.unit_cost)}</td>
              <td>{money(x.amount)}</td>
              <td>{x.is_paid ? "Sí" : "No"}</td>
            </tr>
          ))}
        </Table>
      </section>
      {p.cancellation_reason && <p className="warning">Anulada: {p.cancellation_reason}</p>}
      <History s={s} type="PRODUCTION" id={id} />
      <p className="metadata">
        Registrada por {find(s, "users", p.created_by)?.name} · {stamp(p.created_at)}
        {p.confirmed_at && " · Confirmada " + stamp(p.confirmed_at)}
        {p.closed_at && " · Cerrada " + stamp(p.closed_at)}
      </p>
    </>
  );
}
