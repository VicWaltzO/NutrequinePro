"use client";
import { paymentSummary } from "@/lib/domain.mjs";
import { Table } from "@/shared/ui";
import { Metrics } from "@/shared/ui";
import { money } from "@/shared/ui";
import { find } from "@/shared/ui";
import { stamp } from "@/shared/ui";
import { label } from "@/shared/ui";
import type { DetailProps } from "@/shared/types/details";
export default function PaymentDetail({ s, actor, id, open }: DetailProps) {
  const admin = actor.role === "ADMIN",
    write = actor.role !== "VIEWER";
  const p = find(s, "payments", id),
    r = s.paymentReversals.find((x) => x.payment_id === id);
  if (!p) return null;
  const summary = paymentSummary(s, p);
  return (
    <>
      <div className="detail-heading">
        <div>
          <span className="eyebrow">PAGO · {p.payment_date}</span>
          <h2>{p.code}</h2>
          <p>{find(s, "customers", p.customer_id)?.name}</p>
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
        {s.paymentApplications
          .filter((x) => x.payment_id === id)
          .map((x) => (
            <tr key={x.id}>
              <td>
                <button
                  className="text-button"
                  onClick={() => open("sale-detail", find(s, "sales", x.sale_id))}
                >
                  {find(s, "sales", x.sale_id)?.code}
                </button>
              </td>
              <td>{money(x.applied_amount)}</td>
            </tr>
          ))}
      </Table>
      <p className="metadata">
        Registrado por {find(s, "users", p.created_by)?.name} · {stamp(p.created_at)}
      </p>
    </>
  );
}
