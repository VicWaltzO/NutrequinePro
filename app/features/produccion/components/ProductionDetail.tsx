import { productionSummary } from "@/lib/domain-preview.mjs";
import { SortableTable, Metrics, Badge, History, money, kg, find, stamp, label } from "@/shared/ui";
import type { DetailProps } from "@/shared/types/details";
import { ProductName } from "@/shared/ui/ProductMarker";
import DownloadPdfButton from "@/features/documentos/components/DownloadPdfButton.tsx";
export default function ProductionDetail({ s: state, actor, id, open, run }: DetailProps) {
  const admin = actor.role === "ADMIN";
  const write = actor.role !== "VIEWER";
  const p = find(state, "productions", id);
  if (!p) return null;
  const a = productionSummary(state, p);
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
        <DownloadPdfButton kind="production" id={id}>
          Exportar lote PDF
        </DownloadPdfButton>
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
        <SortableTable
          heads={["Producto", "Versión", "Núcleos", "Sacos", "Kg comerciales", "Kg fórmula"]}
          rows={a.products}
          values={[
            (x) => find(state, "products", x.product_id)?.name,
            (x) => find(state, "formulas", x.formula_id)?.version,
            (x) => x.nuclei_count,
            (x) => x.bags_produced,
            (x) => x.commercial_weight_kg,
            (x) => x.formula_weight_kg,
          ]}
          tie={(x) => [find(state, "products", x.product_id)?.name, x.id]}
        >
          {(x) => (
            <tr key={x.id}>
              <td>
                <ProductName name={find(state, "products", x.product_id)?.name ?? ""} />
              </td>
              <td>v{find(state, "formulas", x.formula_id)?.version}</td>
              <td>{x.nuclei_count}</td>
              <td>{x.bags_produced}</td>
              <td>{kg(x.commercial_weight_kg)}</td>
              <td>{kg(x.formula_weight_kg)}</td>
            </tr>
          )}
        </SortableTable>
        {a.products.map((x) => (
          <details key={x.id}>
            <summary>Snapshot de fórmula · {find(state, "products", x.product_id)?.name}</summary>
            <SortableTable
              heads={["Insumo", "Kg por núcleo"]}
              rows={x.formula_snapshot}
              values={[(f) => find(state, "ingredients", f.ingredient_id)?.name, (f) => f.kg_per_nucleus]}
              tie={(f) => [find(state, "ingredients", f.ingredient_id)?.name, f.ingredient_id, f.id]}
            >
              {(f) => (
                <tr key={f.id}>
                  <td>{find(state, "ingredients", f.ingredient_id)?.name}</td>
                  <td>{kg(f.kg_per_nucleus)}</td>
                </tr>
              )}
            </SortableTable>
          </details>
        ))}
      </section>
      <section className="panel">
        <h3>Costos de insumos y diferencias</h3>
        <SortableTable
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
          rows={a.ingredients}
          values={[
            (x) => find(state, "ingredients", x.ingredient_id)?.name,
            (x) => x.total_kg,
            (x) => x.historical_price_per_kg,
            (x) => x.theoretical_gross_cost,
            (x) => x.discount_amount,
            (x) => x.theoretical_net_cost,
            (x) => x.actual_charge,
            (x) => x.difference,
            (x) => x.is_paid,
          ]}
          tie={(x) => [find(state, "ingredients", x.ingredient_id)?.name, x.id]}
        >
          {(x) => (
            <tr key={x.id}>
              <td>{find(state, "ingredients", x.ingredient_id)?.name}</td>
              <td>{kg(x.total_kg)}</td>
              <td>{money(x.historical_price_per_kg)}</td>
              <td>{money(x.theoretical_gross_cost)}</td>
              <td>{money(x.discount_amount)}</td>
              <td>{money(x.theoretical_net_cost)}</td>
              <td>{x.actual_charge === null ? "Pendiente" : money(x.actual_charge)}</td>
              <td>{x.difference === null ? "—" : money(x.difference)}</td>
              <td>{x.is_paid ? "Sí" : "No"}</td>
            </tr>
          )}
        </SortableTable>
      </section>
      <section className="panel">
        <h3>Costos adicionales</h3>
        <SortableTable
          heads={["Categoría", "Descripción", "Cantidad", "Costo unitario", "Importe", "Pagado"]}
          rows={a.costs}
          values={[
            (x) => label(x.category),
            (x) => [x.description, find(state, "ingredients", x.ingredient_id)?.name],
            (x) => x.quantity,
            (x) => x.unit_cost,
            (x) => x.amount,
            (x) => x.is_paid,
          ]}
          tie={(x) => [x.description, x.id]}
        >
          {(x) => (
            <tr key={x.id}>
              <td>{label(x.category)}</td>
              <td>
                {x.description}
                {x.ingredient_id && " · " + find(state, "ingredients", x.ingredient_id)?.name}
              </td>
              <td>{x.quantity ?? "—"}</td>
              <td>{x.unit_cost === undefined ? "—" : money(x.unit_cost)}</td>
              <td>{money(x.amount)}</td>
              <td>{x.is_paid ? "Sí" : "No"}</td>
            </tr>
          )}
        </SortableTable>
      </section>
      {p.cancellation_reason && <p className="warning">Anulada: {p.cancellation_reason}</p>}
      <History s={state} type="PRODUCTION" id={id} />
      <p className="metadata">
        Registrada por {find(state, "users", p.created_by)?.name} · {stamp(p.created_at)}
        {p.confirmed_at && " · Confirmada " + stamp(p.confirmed_at)}
        {p.closed_at && " · Cerrada " + stamp(p.closed_at)}
      </p>
    </>
  );
}
