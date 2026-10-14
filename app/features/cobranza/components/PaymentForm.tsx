"use client";
import { useState } from "react";
import type { PaymentValues, FormProps } from "@/shared/types/forms";
import { saleSummary, paymentSummary, customerSummary } from "@/lib/domain.mjs";
import { Input, Select, Table, PaymentFields, money, day, find } from "@/shared/ui";
import { Footer } from "@/shared/ui/FormFooter";

export function PaymentForm({ s: state, record, kind, submit, close, busy }: FormProps) {
  const usingCredit = kind === "credit";
  const source = state.payments.find((x) => x.id === record?.id);
  const available = source ? paymentSummary(state, source).available : 0;
  const [v, setV] = useState<PaymentValues>({
    customer_id: record?.customer_id ?? "",
    payment_date: day(),
    total_amount: "",
    payment_method: state.config.default_payment_method ?? "",
    reference: "",
    notes: "",
  });
  const [apps, setApps] = useState<Record<string, string>>({});
  const set = (k: string, x: string | boolean) => setV((a) => ({ ...a, [k]: x }));
  const sales = state.sales.filter(
    (x) =>
      x.customer_id === v.customer_id &&
      !["DRAFT", "CANCELLED"].includes(x.commercial_status) &&
      saleSummary(state, x).balance > 0,
  );
  const applied = Object.values(apps).reduce((a, x) => a + Math.round(Number(x || 0) * 100), 0);
  const received = usingCredit ? available : Math.round(Number(v.total_amount || 0) * 100);
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        const applications = Object.entries(apps)
          .filter(([, v]) => Number(v) > 0)
          .map(([sale_id, applied_amount]) => ({ sale_id, applied_amount }));
        await submit(
          usingCredit ? "PAYMENT_APPLY_CREDIT" : "PAYMENT_CREATE",
          usingCredit ? { payment_id: source?.id, applications } : { ...v, applications },
        );
      }}
    >
      {usingCredit ? (
        <p className="notice">
          Saldo a favor de {find(state, "customers", v.customer_id)?.name}: {money(available)} · Pago{" "}
          {source?.code}. Esta aplicación no registra un cobro nuevo.
        </p>
      ) : (
        <div className="form-grid">
          <Select
            label="Cliente"
            required
            value={v.customer_id}
            onChange={(x) => {
              set("customer_id", x);
              setApps({});
            }}
            options={state.customers.filter((x) => x.is_active || customerSummary(state, x.id).debt > 0)}
          />
          <Input
            label="Fecha del pago"
            type="date"
            required
            value={v.payment_date}
            onChange={(x) => set("payment_date", x)}
          />
          <Input
            label="Monto recibido S/"
            type="number"
            min="0.01"
            step="0.01"
            required
            value={v.total_amount}
            onChange={(x) => set("total_amount", x)}
          />
          <PaymentFields v={v} set={set} />
        </div>
      )}
      <h3>Aplicar a ventas pendientes</h3>
      <Table heads={["Venta", "Fecha", "Sede", "Saldo", "Aplicar S/"]}>
        {sales.map((x) => {
          const a = saleSummary(state, x);
          return (
            <tr key={x.id}>
              <td>{x.code}</td>
              <td>{x.sale_date}</td>
              <td>{find(state, "sites", x.site_id)?.name}</td>
              <td>{money(a.balance)}</td>
              <td>
                <input
                  aria-label={"Aplicar a " + x.code}
                  type="number"
                  min="0"
                  max={a.balance / 100}
                  step="0.01"
                  value={apps[x.id] ?? ""}
                  onChange={(e) => setApps((a) => ({ ...a, [x.id]: e.target.value }))}
                />
              </td>
            </tr>
          );
        })}
      </Table>
      <div className="total-line">
        <span>Aplicado {money(applied)}</span>
        <strong>Saldo a favor restante {money(Math.max(0, received - applied))}</strong>
      </div>
      {applied > received && <p className="error">El importe aplicado supera el monto disponible.</p>}
      {!usingCredit && (
        <>
          <p className="notice">
            El importe sin aplicar queda a favor del cliente. Puede usarlo posteriormente desde el detalle del
            pago.
          </p>
          <Input label="Notas" value={v.notes} onChange={(x) => set("notes", x)} />
        </>
      )}
      <Footer
        busy={busy}
        disabled={applied > received || received <= 0 || (usingCredit && applied <= 0)}
        close={close}
        label={usingCredit ? "Aplicar saldo a favor" : "Registrar pago"}
      />
    </form>
  );
}
