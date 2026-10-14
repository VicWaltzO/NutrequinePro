"use client";
import { paymentSummary } from "@/lib/domain.mjs";
import { Table, Metrics, money, find, stamp, label } from "@/shared/ui";
import type { DetailProps } from "@/shared/types/details";
export default function PaymentDetail({ s: state, actor, id, open }: DetailProps) {
  const admin = actor.role === "ADMIN";
  const write = actor.role !== "VIEWER";
  const p = find(state, "payments", id);
  const r = state.paymentReversals.find((x) => x.payment_id === id);
  if (!p) return null;
  const summary = paymentSummary(state, p);
  return (
    <>
      <div className="detail-heading">
        <div>
          <span className="eyebrow">PAGO · {p.payment_date}</span>
          <h2>{p.code}</h2>
          <p>{find(state, "customers", p.customer_id)?.name}</p>
        </div>
        <strong className="large-value">{money(p.total_amount)}</strong>
      </div>
      <Metrics
        items={[
          { label: "Recibido", value: money(p.total_amount) },
          { label: "Aplicado", value: money(summary.applied) },
          { label: "Saldo a favor disponible", value: money(summary.available) },
        ]}
      />
      {summary.available > 0 && write && (
        <button onClick={() => open("credit", p)}>Aplicar saldo a favor a una venta</button>
      )}
      <p>
        {label(p.payment_method)} {p.other_method} · Referencia {p.reference || "—"}
      </p>
      {r ? (
        <p className="warning">
          Revertido el {r.date}: {r.reason} · {money(r.amount)}
        </p>
      ) : (
        admin && (
          <button
            className="danger"
            onClick={() => open("reason", { ...p, _operation: "PAYMENT_REVERSE" }, "reason")}
          >
            Registrar reversión de pago
          </button>
        )
      )}
      <Table heads={["Venta", "Aplicación"]}>
        {state.paymentApplications
          .filter((x) => x.payment_id === id)
          .map((x) => (
            <tr key={x.id}>
              <td>
                <button
                  className="text-button"
                  onClick={() => open("sale-detail", find(state, "sales", x.sale_id))}
                >
                  {find(state, "sales", x.sale_id)?.code}
                </button>
              </td>
              <td>{money(x.applied_amount)}</td>
            </tr>
          ))}
      </Table>
      <p className="metadata">
        Registrado por {find(state, "users", p.created_by)?.name} · {stamp(p.created_at)}
      </p>
    </>
  );
}
