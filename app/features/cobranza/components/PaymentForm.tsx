import { useState } from "react";
import type { PaymentValues, FormProps } from "@/shared/types/forms";
import { saleSummary, paymentSummary, customerSummary } from "@/lib/domain-preview.mjs";
import { Input, Select, Table, PaymentFields, money, day, find } from "@/shared/ui";
import { Footer } from "@/shared/ui/FormFooter";
import { CreditCard, ListChecks, UserRound } from "lucide-react";
import { FormSection } from "@/shared/ui/FormSection";

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
      className="operation-form"
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
      <FormSection title="Cliente" label="Datos del cliente" icon={UserRound} meta="Titular del pago">
        {usingCredit ? (
          <p className="form-record-value">{find(state, "customers", v.customer_id)?.name}</p>
        ) : (
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
        )}
      </FormSection>
      <FormSection
        title={usingCredit ? "Saldo a favor" : "Cobro"}
        icon={CreditCard}
        meta={usingCredit ? "Pago registrado" : "Importe y medio de pago"}
        accent
      >
        {usingCredit ? (
          <p className="notice">
            Saldo a favor de {find(state, "customers", v.customer_id)?.name}: {money(available)} · Pago{" "}
            {source?.code}. Esta aplicación no registra un cobro nuevo.
          </p>
        ) : (
          <div className="form-grid">
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
      </FormSection>
      <FormSection
        title="Aplicar a ventas pendientes"
        label="Aplicación a ventas"
        icon={ListChecks}
        meta={`${sales.length} ${sales.length === 1 ? "venta pendiente" : "ventas pendientes"}`}
      >
        {sales.length ? (
          <div className="form-state-enter" key={v.customer_id}>
            <p className="form-table-hint">Desliza la tabla para consultar todas las columnas.</p>
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
          </div>
        ) : (
          <p className="form-empty" role="status">
            {v.customer_id
              ? "Este cliente no tiene ventas pendientes de pago."
              : "Selecciona un cliente para consultar sus ventas pendientes."}
          </p>
        )}
        <div className="total-line">
          <span>Aplicado {money(applied)}</span>
          <strong>Saldo a favor restante {money(Math.max(0, received - applied))}</strong>
        </div>
        {applied > received && <p className="error">El importe aplicado supera el monto disponible.</p>}
        {!usingCredit && (
          <>
            <p className="notice">
              El importe sin aplicar queda a favor del cliente. Puede usarlo posteriormente desde el detalle
              del pago.
            </p>
            <Input label="Notas" value={v.notes} onChange={(x) => set("notes", x)} />
          </>
        )}
      </FormSection>
      <Footer
        busy={busy}
        disabled={applied > received || received <= 0 || (usingCredit && applied <= 0)}
        close={close}
        label={usingCredit ? "Aplicar saldo a favor" : "Registrar pago"}
      />
    </form>
  );
}
