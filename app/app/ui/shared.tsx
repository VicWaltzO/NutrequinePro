"use client";
import React from "react";
import type { AppState, Tables, TableName } from "../../lib/domain-types";
export const money = (n: number | null | undefined) =>
  new Intl.NumberFormat("es-PE", { style: "currency", currency: "PEN" }).format((n ?? 0) / 100);
export const kg = (n: number | null | undefined) =>
  new Intl.NumberFormat("es-PE", { maximumFractionDigits: 3 }).format((n ?? 0) / 1000);
export const num = (n: number | null | undefined) => new Intl.NumberFormat("es-PE").format(n ?? 0);
export const day = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Lima" }).format(new Date());
export const stamp = (v: string | undefined) =>
  v
    ? new Intl.DateTimeFormat("es-PE", {
        timeZone: "America/Lima",
        dateStyle: "medium",
        timeStyle: "short",
      }).format(new Date(v))
    : "—";
export const names: Record<string, string> = {
  DRAFT: "Borrador",
  CONFIRMED: "Confirmada",
  CLOSED: "Cerrada",
  CANCELLED: "Anulada",
  RECTIFIED: "Rectificada",
  PENDING: "Pendiente",
  PARTIAL: "Pago parcial",
  PAID: "Pagada",
  DELIVERED: "Entregada",
  CASH: "Efectivo",
  CREDIT: "Crédito",
  TRANSFER: "Transferencia",
  CHECK: "Cheque",
  OTHER: "Otro",
  NUCLEUS: "Núcleos",
  PACKAGING: "Sacos / envases",
  FREIGHT: "Flete",
  HANDLING: "Carga / descarga",
  PERSONNEL: "Personal",
  SERVICE: "Servicio",
  INGREDIENT_EXTRA: "Extra por insumo",
  LOGISTICS: "Logística",
  OPERATING: "Operativo",
  ADMINISTRATIVE: "Administrativo",
  PRODUCTION_IN: "Entrada de producción",
  SALE_OUT: "Salida de venta",
  RETURN_IN: "Devolución",
  ADJUSTMENT_IN: "Ajuste de entrada",
  ADJUSTMENT_OUT: "Ajuste de salida",
  CANCELLATION_REVERSAL: "Reversión",
  CONSUMPTION_OUT: "Consumo de insumo",
  ADMIN: "Administrador",
  OPERATOR: "Operador",
  VIEWER: "Consulta",
};
export const label = (x: string) => names[x] ?? x;
export function find<K extends TableName>(
  s: AppState,
  t: K,
  id: string | null | undefined,
): Tables[K][number] | undefined {
  return s[t].find((x) => x.id === id) as Tables[K][number] | undefined;
}
export function Badge({ value }: { value: string }) {
  return <span className={"badge status-" + value}>{label(value)}</span>;
}
export function Field({
  label: caption,
  children,
  hint,
}: {
  label: string;
  children: React.ReactNode;
  hint?: string;
}) {
  return (
    <label className="field">
      <span>{caption}</span>
      {children}
      {hint && <small>{hint}</small>}
    </label>
  );
}
type InputProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, "onChange"> & {
  label: string;
  onChange: (value: string) => void;
};
export function Input({
  label: caption,
  value,
  onChange,
  type = "text",
  required = false,
  ...rest
}: InputProps) {
  return (
    <Field label={caption}>
      <input
        type={type}
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        {...rest}
      />
    </Field>
  );
}
type SelectProps = {
  label: string;
  value?: string | null;
  onChange: (value: string) => void;
  options: (string | { id: string; name: string })[];
  empty?: string | false;
  required?: boolean;
};
export function Select({
  label: caption,
  value,
  onChange,
  options,
  empty = "Seleccionar",
  required = false,
}: SelectProps) {
  return (
    <Field label={caption}>
      <select
        aria-label={caption}
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        required={required}
      >
        {empty !== false && <option value="">{empty}</option>}
        {options.map((x) => {
          const id = typeof x === "string" ? x : x.id;
          return (
            <option value={id} key={id}>
              {typeof x === "string" ? label(x) : x.name}
            </option>
          );
        })}
      </select>
    </Field>
  );
}
export function Check({
  label: caption,
  value,
  onChange,
}: {
  label: string;
  value?: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="check">
      <input type="checkbox" checked={!!value} onChange={(e) => onChange(e.target.checked)} />
      <span>{caption}</span>
    </label>
  );
}
export function Empty({
  text = "No hay operaciones registradas.",
  action,
}: {
  text?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="empty">
      <span className="empty-mark">＋</span>
      <strong>{text}</strong>
      {action}
    </div>
  );
}
export function Table({ heads, children }: { heads: string[]; children: React.ReactNode }) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            {heads.map((x) => (
              <th key={x}>{x}</th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}
export function ProductImage({ image, name }: { image?: string | null; name: string }) {
  return image ? (
    <div role="img" aria-label={`Presentación real de ${name}`} className={"product-photo " + image} />
  ) : (
    <div className="product-photo base-product">
      NP<span>BASE</span>
    </div>
  );
}
export function Metrics({ items }: { items: { label: string; value: React.ReactNode; note?: string }[] }) {
  return (
    <div className="metrics">
      {items.map((x) => (
        <div className="metric" key={x.label}>
          <span>{x.label}</span>
          <strong>{x.value}</strong>
          {x.note && <small>{x.note}</small>}
        </div>
      ))}
    </div>
  );
}
export function History({ s, type, id }: { s: AppState; type: string; id: string }) {
  const rows = s.corrections.filter((x) => x.entity_type === type && x.entity_id === id);
  return rows.length > 0 ? (
    <section className="panel">
      <h3>Rectificaciones y valores anteriores</h3>
      {rows.map((x) => (
        <details key={x.id}>
          <summary>
            {x.code} · {x.reason} · {stamp(x.created_at)}
          </summary>
          <p>{find(s, "users", x.created_by)?.name ?? x.created_by}</p>
          <Table heads={["Campo", "Valor anterior", "Valor nuevo"]}>
            {s.correctionFields
              .filter((f) => f.correction_id === x.id)
              .map((f) => (
                <tr key={f.id}>
                  <td>{f.field_name}</td>
                  <td>
                    <pre>{f.old_value}</pre>
                  </td>
                  <td>
                    <pre>{f.new_value}</pre>
                  </td>
                </tr>
              ))}
          </Table>
        </details>
      ))}
    </section>
  ) : null;
}
export function PaymentFields({
  v,
  set,
}: {
  v: { payment_method: string; other_method?: string; reference: string };
  set: (k: string, v: string) => void;
}) {
  return (
    <>
      <Select
        label="Método de pago"
        required
        value={v.payment_method}
        onChange={(x) => set("payment_method", x)}
        options={["CASH", "TRANSFER", "CHECK", "OTHER"]}
      />
      {v.payment_method === "OTHER" && (
        <Input label="Otro método" required value={v.other_method} onChange={(x) => set("other_method", x)} />
      )}
      <Input label="Referencia (opcional)" value={v.reference} onChange={(x) => set("reference", x)} />
    </>
  );
}
