"use client";
import { saleSummary } from "@/lib/domain.mjs";
import { deliveryAvailability } from "@/lib/domain.mjs";
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
export default function SaleDetail({ s, actor, id, open, run }: DetailProps) {
  const admin = actor.role === "ADMIN",
    write = actor.role !== "VIEWER";
  const sale = find(s, "sales", id);
  if (!sale) return null;
  const a = saleSummary(s, sale);
  const payments = s.paymentApplications.filter((x) => x.sale_id === id);
  const availability = deliveryAvailability(s, a.items),
    shortage = availability.some((x) => x.missing_quantity || x.missing_weight);
  return (
    <>
      <div className="detail-heading">
        <div>
          <span className="eyebrow">VENTA · {sale.sale_date}</span>
          <h2>{sale.code}</h2>
          <p>
            {find(s, "customers", sale.customer_id)?.name} · {find(s, "sites", sale.site_id)?.name}
          </p>
        </div>
        <div className="status-group">
          <Badge value={sale.commercial_status} />
          <Badge value={a.financial_status} />
          <Badge value={sale.fulfillment_status} />
        </div>
      </div>
      <Metrics
        items={[
          { label: "Total comercial", value: money(a.total) },
          { label: "Cobrado", value: money(a.paid) },
          { label: "Saldo", value: money(a.balance) },
        ]}
      />
      <div className="detail-actions">
        {sale.commercial_status === "DRAFT" && write && (
          <button onClick={() => open("sale", sale, "sale")}>Editar / confirmar borrador</button>
        )}
        {sale.fulfillment_status === "PENDING" &&
          sale.commercial_status !== "DRAFT" &&
          sale.commercial_status !== "CANCELLED" &&
          write && (
            <button className="primary" disabled={shortage} onClick={() => run("SALE_DELIVER", { id })}>
              Registrar entrega
            </button>
          )}
        {a.balance > 0 && sale.commercial_status !== "DRAFT" && write && (
          <button onClick={() => open("payment", sale)}>Registrar pago</button>
        )}
        {["CONFIRMED", "RECTIFIED"].includes(sale.commercial_status) && admin && (
          <button onClick={() => open("sale", sale, "correct")}>Rectificar</button>
        )}
        {sale.fulfillment_status === "DELIVERED" && write && (
          <button onClick={() => open("return", sale)}>Devolución</button>
        )}
        {sale.commercial_status !== "CANCELLED" && admin && (
          <button
            className="danger"
            onClick={() => open("reason", { ...sale, _operation: "SALE_CANCEL" }, "reason")}
          >
            Anular
          </button>
        )}
      </div>
      {sale.fulfillment_status === "PENDING" && !["DRAFT", "CANCELLED"].includes(sale.commercial_status) && (
        <section className="panel">
          <h3>Stock para esta entrega</h3>
          {shortage ? (
            <p className="warning">
              Falta stock de uno o más productos. Complete la producción pendiente o rectifique las cantidades
              antes de registrar la entrega.
            </p>
          ) : (
            <p className="notice">
              Stock suficiente para entregar. Los sacos comprometidos no se descuentan otra vez del stock
              físico.
            </p>
          )}
          <Table
            heads={["Producto", "Venta (sacos / kg)", "Stock físico (sacos / kg)", "Faltan (sacos / kg)"]}
          >
            {availability.map((x) => (
              <tr key={x.product_id}>
                <td>{find(s, "products", x.product_id)?.name}</td>
                <td>
                  {x.requested} / {kg(x.weight)}
                </td>
                <td>
                  {x.quantity} / {kg(x.weight_kg)}
                </td>
                <td>
                  {x.missing_quantity} / {kg(x.missing_weight)}
                </td>
              </tr>
            ))}
          </Table>
        </section>
      )}
      <section className="panel">
        <h3>Detalle comercial</h3>
        <Table
          heads={[
            "Producto",
            "Sacos",
            "Kg / saco",
            "Kg totales",
            "Precio lista",
            "Precio aplicado",
            "Subtotal",
          ]}
        >
          {a.items.map((x) => (
            <tr key={x.id}>
              <td>{find(s, "products", x.product_id)?.name}</td>
              <td>{x.quantity}</td>
              <td>{kg(x.unit_weight_kg)}</td>
              <td>{kg(x.total_weight_kg)}</td>
              <td>{money(x.reference_unit_price)}</td>
              <td>{money(x.unit_price)}</td>
              <td>{money(x.subtotal)}</td>
            </tr>
          ))}
        </Table>
        <p>
          {sale.payment_condition === "CASH" ? "Contado" : "Crédito"} · {sale.notes || "Sin notas"}
        </p>
        {sale.cancellation_reason && <p className="warning">Anulada: {sale.cancellation_reason}</p>}
      </section>
      <section className="panel">
        <h3>Pagos aplicados</h3>
        <Table heads={["Pago", "Fecha", "Método", "Aplicado", "Estado"]}>
          {payments.map((x) => {
            const p = find(s, "payments", x.payment_id);
            if (!p) return null;
            const reversed = s.paymentReversals.some((r) => r.payment_id === p.id);
            return (
              <tr key={x.id}>
                <td>
                  <button className="text-button" onClick={() => open("payment-detail", p)}>
                    {p.code}
                  </button>
                </td>
                <td>{p.payment_date}</td>
                <td>{label(p.payment_method)}</td>
                <td>{money(x.applied_amount)}</td>
                <td>{reversed ? "Revertido" : "Registrado"}</td>
              </tr>
            );
          })}
        </Table>
      </section>
      {s.saleProductionLinks.filter((x) => x.sale_id === id).length > 0 && (
        <section className="panel">
          <h3>Producciones vinculadas</h3>
          {s.saleProductionLinks
            .filter((x) => x.sale_id === id)
            .map((x) => {
              const p = find(s, "productions", x.production_id);
              if (!p) return null;
              return (
                <button key={x.id} onClick={() => open("production-detail", p)}>
                  {p.code} · {label(p.status)}
                </button>
              );
            })}
        </section>
      )}
      {s.returns
        .filter((x) => x.sale_id === id)
        .map((r) => (
          <section className="panel" key={r.id}>
            <h3>
              {r.code} · Devolución · {r.return_date}
            </h3>
            <p>
              {r.reason} · Reducción económica {money(r.economic_amount)}
            </p>
            <Table heads={["Producto", "Sacos", "Peso"]}>
              {s.returnItems
                .filter((x) => x.return_id === r.id)
                .map((x) => (
                  <tr key={x.id}>
                    <td>{find(s, "products", find(s, "saleItems", x.sale_item_id)?.product_id)?.name}</td>
                    <td>{x.quantity}</td>
                    <td>{kg(x.weight_kg)} kg</td>
                  </tr>
                ))}
            </Table>
          </section>
        ))}
      <History s={s} type="SALE" id={id} />
      <p className="metadata">
        Creada por {find(s, "users", sale.created_by)?.name} · {stamp(sale.created_at)}
        {sale.delivered_at && " · Entregada " + stamp(sale.delivered_at)}
      </p>
    </>
  );
}
