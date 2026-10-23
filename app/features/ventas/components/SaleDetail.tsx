import { saleSummary, deliveryAvailability } from "@/lib/domain-preview.mjs";
import { Table, Metrics, Badge, History, money, kg, find, stamp, label } from "@/shared/ui";
import type { DetailProps } from "@/shared/types/details";
import DownloadPdfButton from "@/features/documentos/components/DownloadPdfButton.tsx";
import { unitLabels } from "@/shared/domain/presentation.mjs";
export default function SaleDetail({ s: state, actor, id, open, run }: DetailProps) {
  const admin = actor.role === "ADMIN";
  const write = actor.role !== "VIEWER";
  const sale = find(state, "sales", id);
  if (!sale) return null;
  const a = saleSummary(state, sale);
  const payments = state.paymentApplications.filter((x) => x.sale_id === id);
  const availability = deliveryAvailability(state, a.items);
  const shortage = availability.some((x) => x.missing_quantity || x.missing_weight);
  return (
    <>
      <div className="detail-heading">
        <div>
          <span className="eyebrow">VENTA · {sale.sale_date}</span>
          <h2>{sale.code}</h2>
          <p>
            {find(state, "customers", sale.customer_id)?.name} · {find(state, "sites", sale.site_id)?.name}
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
        <DownloadPdfButton kind="sale" id={id}>
          Descargar nota de venta PDF
        </DownloadPdfButton>
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
              Falta stock de uno o más productos. Registre el ingreso o la producción pendiente, o rectifique
              las cantidades antes de registrar la entrega.
            </p>
          ) : (
            <p className="notice">
              Stock suficiente para entregar. Las unidades comprometidas no se descuentan otra vez del stock
              físico.
            </p>
          )}
          <Table
            heads={[
              "Producto",
              "Venta (cantidad / kg)",
              "Stock físico (cantidad / kg)",
              "Faltan (cantidad / kg)",
            ]}
          >
            {availability.map((x) => (
              <tr key={x.product_id}>
                <td>
                  {find(state, "products", x.product_id)?.name} ·{" "}
                  {unitLabels(a.items.find((row) => row.product_id === x.product_id)).plural}
                </td>
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
            "Cantidad",
            "Kg / unidad",
            "Kg totales",
            "Precio lista",
            "Precio aplicado",
            "Subtotal",
          ]}
        >
          {a.items.map((x) => (
            <tr key={x.id}>
              <td>{find(state, "products", x.product_id)?.name}</td>
              <td>
                {x.quantity} {unitLabels(x).plural}
              </td>
              <td>
                {kg(x.unit_weight_kg)} / {unitLabels(x).singular}
              </td>
              <td>{kg(x.total_weight_kg)}</td>
              <td>{money(x.reference_unit_price)}</td>
              <td>
                {money(x.unit_price)} / {unitLabels(x).singular}
              </td>
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
            const p = find(state, "payments", x.payment_id);
            if (!p) return null;
            const reversed = state.paymentReversals.some((r) => r.payment_id === p.id);
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
      {state.saleProductionLinks.filter((x) => x.sale_id === id).length > 0 && (
        <section className="panel">
          <h3>Producciones vinculadas</h3>
          {state.saleProductionLinks
            .filter((x) => x.sale_id === id)
            .map((x) => {
              const p = find(state, "productions", x.production_id);
              if (!p) return null;
              return (
                <button key={x.id} onClick={() => open("production-detail", p)}>
                  {p.code} · {label(p.status)}
                </button>
              );
            })}
        </section>
      )}
      {state.returns
        .filter((x) => x.sale_id === id)
        .map((r) => (
          <section className="panel" key={r.id}>
            <h3>
              {r.code} · Devolución · {r.return_date}
            </h3>
            <p>
              {r.reason} · Reducción económica {money(r.economic_amount)}
            </p>
            <Table heads={["Producto", "Cantidad", "Peso"]}>
              {state.returnItems
                .filter((x) => x.return_id === r.id)
                .map((x) => (
                  <tr key={x.id}>
                    <td>
                      {find(state, "products", find(state, "saleItems", x.sale_item_id)?.product_id)?.name}
                    </td>
                    <td>
                      {x.quantity} {unitLabels(find(state, "saleItems", x.sale_item_id)).plural}
                    </td>
                    <td>{kg(x.weight_kg)} kg</td>
                  </tr>
                ))}
            </Table>
          </section>
        ))}
      <History s={state} type="SALE" id={id} />
      <p className="metadata">
        Creada por {find(state, "users", sale.created_by)?.name} · {stamp(sale.created_at)}
        {sale.delivered_at && " · Entregada " + stamp(sale.delivered_at)}
      </p>
    </>
  );
}
