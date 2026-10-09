"use client";
import { useState } from "react";
import { recordId } from "../../lib/domain-types";
import type { AppState, EditorRecord, Submit } from "../../lib/domain-types";
import type { SaleFields, SaleLine, PaymentValues, ReturnValues } from "./form-types";
import { stock, saleSummary, normalize, paymentSummary, customerSummary } from "../../lib/domain.mjs";
import { Input, Select, Check, Table, PaymentFields, money, kg, day, find } from "./shared";
export type FormProps = {
  s: AppState;
  record?: EditorRecord;
  kind?: string;
  submit: Submit;
  close: () => void;
  busy: boolean;
};
export function Footer({
  busy,
  close,
  label = "Guardar",
  disabled = false,
}: {
  busy: boolean;
  close: () => void;
  label?: string;
  disabled?: boolean;
}) {
  return (
    <footer className="form-footer">
      <button type="button" className="secondary" onClick={close} disabled={busy}>
        Cancelar
      </button>
      <button className="primary" disabled={busy || disabled}>
        {busy ? "Guardando…" : label}
      </button>
    </footer>
  );
}
export function SaleForm({ s, record, kind, submit, close, busy }: FormProps) {
  const old = record?.id ? saleSummary(s, { id: record.id }).items : [],
    edit = kind === "correct";
  const [v, setV] = useState<SaleFields>({
    sale_date: record?.sale_date ?? day(),
    customer_id: record?.customer_id ?? "",
    site_id: record?.site_id ?? "",
    payment_condition: record?.payment_condition ?? s.config.default_payment_condition ?? "CREDIT",
    notes: record?.notes ?? "",
    mode: "immediate",
    payment_method: s.config.default_payment_method ?? "",
    reference: "",
    reason: "",
    production_id: "",
    id: record?.id,
  });
  const set = (k: string, x: string | boolean) => setV((a) => ({ ...a, [k]: x }));
  const [rows, setRows] = useState<SaleLine[]>(
    old.length
      ? old.map((x) => ({
          original_item_id: x.id,
          product_id: x.product_id,
          quantity: x.quantity,
          unit_weight_kg: x.unit_weight_kg / 1000,
          unit_price: x.unit_price / 100,
        }))
      : [{ product_id: "", quantity: 1, unit_weight_kg: "", unit_price: "" }],
  );
  const [paidAmount, setPaidAmount] = useState<string | null>(null);
  const [quick, setQuick] = useState(""),
    [newName, setNewName] = useState(""),
    [duplicate, setDuplicate] = useState(false);
  const update = (i: number, k: keyof SaleLine, x: string) =>
    setRows((a) =>
      a.map((r, j) => {
        if (i !== j) return r;
        const n = { ...r, [k]: x };
        if (k === "product_id") {
          const p = find(s, "products", x);
          n.unit_price = (p?.default_sale_price ?? 0) / 100;
          n.unit_weight_kg = (p?.standard_bag_weight_kg ?? 0) / 1000;
        }
        return n;
      }),
    );
  const grouped: Record<string, { q: number; w: number }> = {};
  rows.forEach((r) => {
    grouped[r.product_id] ??= { q: 0, w: 0 };
    grouped[r.product_id].q += Number(r.quantity) || 0;
    grouped[r.product_id].w += (Number(r.quantity) || 0) * (Number(r.unit_weight_kg) || 0) * 1000;
  });
  const missing = Object.entries(grouped).filter(
    ([id, a]) =>
      id &&
      (a.q >
        stock(s, id).quantity +
          (edit && record?.fulfillment_status === "DELIVERED"
            ? old.filter((x) => x.product_id === id).reduce((n: number, x) => n + x.quantity, 0)
            : 0) ||
        a.w >
          stock(s, id).weight_kg +
            (edit && record?.fulfillment_status === "DELIVERED"
              ? old.filter((x) => x.product_id === id).reduce((n: number, x) => n + x.total_weight_kg, 0)
              : 0)),
  );
  const total = rows.reduce((a, r) => a + Math.round(Number(r.quantity) * Number(r.unit_price) * 100), 0),
    dup = s.customers.some((x) => normalize(x.name) === normalize(newName));
  const paid = paidAmount === null ? total : Math.round(Number(paidAmount || 0) * 100);
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        await submit(edit ? "SALE_CORRECT" : "SALE_SAVE", {
          ...v,
          paid_amount: paidAmount ?? total / 100,
          items: rows,
          confirm: kind !== "draft",
          deliver: v.mode === "immediate",
          create_production: v.mode === "planned",
        });
      }}
    >
      {!edit && (
        <>
          <div className="form-grid">
            <Input
              label="Fecha de venta"
              type="date"
              required
              value={v.sale_date}
              onChange={(x) => set("sale_date", x)}
            />
            <Select
              label="Cliente"
              required
              value={v.customer_id}
              onChange={(x) => {
                set("customer_id", x);
                const d = s.customerSites.find(
                  (a) => a.customer_id === x && a.is_default && a.is_active !== false,
                );
                if (d) set("site_id", d.site_id);
              }}
              options={s.customers.filter((x) => x.is_active && !x.deleted_at)}
            />
            <Select
              label="Sede destino"
              required
              value={v.site_id}
              onChange={(x) => set("site_id", x)}
              options={s.sites.filter((x) => x.is_active)}
            />
          </div>
          <div className="inline-actions">
            {["customer", "site"].map((k) => (
              <button
                key={k}
                type="button"
                className="text-button"
                onClick={() => {
                  setQuick(quick === k ? "" : k);
                  setNewName("");
                  setDuplicate(false);
                }}
              >
                ＋ Crear {k === "customer" ? "cliente aquí" : "sede"}
              </button>
            ))}
          </div>
          {quick && (
            <div className="inset">
              <Input
                label={quick === "customer" ? "Nombre del nuevo cliente" : "Nombre de sede"}
                value={newName}
                onChange={setNewName}
              />
              {quick === "customer" && dup && (
                <>
                  <p className="warning">Posible duplicado: ya existe un cliente con ese nombre.</p>
                  <Check label="Confirmo que es otro cliente" value={duplicate} onChange={setDuplicate} />
                </>
              )}
              <button
                type="button"
                disabled={busy || !newName.trim() || (quick === "customer" && dup && !duplicate)}
                onClick={async () => {
                  const r = await submit(quick === "customer" ? "CUSTOMER_SAVE" : "SITE_SAVE", {
                    name: newName,
                    is_active: true,
                    confirm_duplicate: duplicate,
                    _keep_open: true,
                  });
                  if (typeof r === "string") {
                    set(quick === "customer" ? "customer_id" : "site_id", r);
                    setQuick("");
                  }
                }}
              >
                Guardar {quick === "customer" ? "cliente" : "sede"}
              </button>
            </div>
          )}
        </>
      )}
      <h3>Productos</h3>
      <div className="line-editor">
        <Table heads={["Producto", "Sacos", "Kg / saco", "Precio S/", "Subtotal", ""]}>
          {rows.map((r, i) => {
            const product = find(s, "products", r.product_id);
            return (
              <tr key={i}>
                <td>
                  <select
                    aria-label="Producto"
                    required
                    value={r.product_id}
                    onChange={(e) => update(i, "product_id", e.target.value)}
                  >
                    <option value="">Seleccionar producto</option>
                    {s.products
                      .filter((x) => x.is_active && x.is_sellable)
                      .map((x) => (
                        <option key={x.id} value={x.id}>
                          {x.name}
                        </option>
                      ))}
                  </select>
                  {product && (
                    <small>
                      Stock: {stock(s, product.id).quantity} sacos · {kg(stock(s, product.id).weight_kg)} kg
                    </small>
                  )}
                </td>
                {(
                  [
                    ["quantity", "Cantidad de sacos", "1", "1"],
                    ["unit_weight_kg", "Peso por saco", "0.001", "0.001"],
                    ["unit_price", "Precio por saco", "0", "0.01"],
                  ] as const
                ).map(([k, l, min, step]) => (
                  <td key={k}>
                    <input
                      aria-label={l}
                      type="number"
                      min={min}
                      step={step}
                      required
                      value={r[k]}
                      onChange={(e) => update(i, k, e.target.value)}
                    />
                    {k === "unit_price" &&
                      product &&
                      Number(r.unit_price) * 100 !== product.default_sale_price && (
                        <small className="price-change">Lista: {money(product.default_sale_price)}</small>
                      )}
                  </td>
                ))}
                <td>{money(Math.round(Number(r.quantity) * Number(r.unit_price) * 100))}</td>
                <td>
                  <button
                    type="button"
                    className="icon-button"
                    aria-label="Quitar producto"
                    disabled={rows.length === 1}
                    onClick={() => setRows((a) => a.filter((_, j) => j !== i))}
                  >
                    ×
                  </button>
                </td>
              </tr>
            );
          })}
        </Table>
      </div>
      <button
        type="button"
        className="text-button"
        onClick={() =>
          setRows((a) => [...a, { product_id: "", quantity: 1, unit_weight_kg: "", unit_price: "" }])
        }
      >
        ＋ Agregar producto
      </button>
      <div className="total-line">
        <span>Total de venta</span>
        <strong>{money(total)}</strong>
      </div>
      {!edit && (
        <>
          <div className="form-grid">
            <Select
              label="Condición"
              required
              empty={false}
              value={v.payment_condition}
              onChange={(x) => set("payment_condition", x)}
              options={[
                { id: "CREDIT", name: "Crédito" },
                { id: "CASH", name: "Contado" },
              ]}
            />
            <Select
              label="Entrega"
              required
              empty={false}
              value={v.mode}
              onChange={(x) => set("mode", x)}
              options={[
                { id: "immediate", name: "Entregar ahora" },
                { id: "future", name: "Venta futura · pendiente" },
                { id: "planned", name: "Venta futura + lote a producir" },
              ]}
            />
          </div>
          {missing.length > 0 && (
            <div className="warning">
              <strong>Stock insuficiente</strong>
              {missing.map(([id, a]) => (
                <p key={id}>
                  {find(s, "products", id)?.name}: stock {stock(s, id).quantity}, solicitado {a.q}, faltan{" "}
                  {Math.max(0, a.q - stock(s, id).quantity)} sacos. Peso disponible:{" "}
                  {kg(stock(s, id).weight_kg)} kg.
                </p>
              ))}
              <p>Elija venta futura para continuar. El stock saldrá al entregar.</p>
            </div>
          )}
          {v.mode !== "immediate" && (
            <Select
              label="Asociar a un lote existente (opcional)"
              value={v.production_id}
              onChange={(x) => set("production_id", x)}
              options={s.productions
                .filter((x) => x.status !== "CANCELLED")
                .map((x) => ({ id: x.id, name: x.code }))}
            />
          )}
          {v.payment_condition === "CASH" && (
            <div className="inset">
              <h3>Pago inicial</h3>
              <div className="form-grid">
                <Input
                  label="Monto pagado S/"
                  type="number"
                  min="0"
                  step="0.01"
                  required
                  value={paidAmount ?? total / 100}
                  onChange={setPaidAmount}
                />
                {paid > 0 && (
                  <>
                    <PaymentFields v={v} set={set} />
                    <Input
                      label="Fecha del pago"
                      type="date"
                      required
                      value={v.payment_date ?? v.sale_date}
                      onChange={(x) => set("payment_date", x)}
                    />
                  </>
                )}
              </div>
              <div className="summary-strip">
                <span>Aplicado a la venta: {money(Math.min(total, paid))}</span>
                <span>Saldo por cobrar: {money(Math.max(0, total - paid))}</span>
                <strong>Saldo a favor: {money(Math.max(0, paid - total))}</strong>
              </div>
              <p className="notice">
                El pago puede ser parcial. El excedente queda a favor del cliente y puede aplicarse a otra
                venta desde el detalle del pago.
              </p>
            </div>
          )}
        </>
      )}
      {edit && (
        <>
          <p className="notice">
            Se conservarán los valores originales. La rectificación ajustará inventario y saldo.
          </p>
          <Input
            label="Motivo de rectificación"
            required
            value={v.reason}
            onChange={(x) => set("reason", x)}
          />
        </>
      )}
      <Input label="Notas (opcional)" value={v.notes} onChange={(x) => set("notes", x)} />
      <Footer
        busy={busy}
        disabled={!edit && kind !== "draft" && v.mode === "immediate" && missing.length > 0}
        close={close}
        label={edit ? "Registrar rectificación" : kind === "draft" ? "Guardar borrador" : "Confirmar venta"}
      />
    </form>
  );
}
export function PaymentForm({ s, record, kind, submit, close, busy }: FormProps) {
  const usingCredit = kind === "credit",
    source = s.payments.find((x) => x.id === record?.id),
    available = source ? paymentSummary(s, source).available : 0;
  const [v, setV] = useState<PaymentValues>({
    customer_id: record?.customer_id ?? "",
    payment_date: day(),
    total_amount: "",
    payment_method: s.config.default_payment_method ?? "",
    reference: "",
    notes: "",
  });
  const [apps, setApps] = useState<Record<string, string>>({});
  const set = (k: string, x: string | boolean) => setV((a) => ({ ...a, [k]: x }));
  const sales = s.sales.filter(
    (x) =>
      x.customer_id === v.customer_id &&
      !["DRAFT", "CANCELLED"].includes(x.commercial_status) &&
      saleSummary(s, x).balance > 0,
  );
  const applied = Object.values(apps).reduce((a, x) => a + Math.round(Number(x || 0) * 100), 0),
    received = usingCredit ? available : Math.round(Number(v.total_amount || 0) * 100);
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
          Saldo a favor de {find(s, "customers", v.customer_id)?.name}: {money(available)} · Pago{" "}
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
            options={s.customers.filter((x) => x.is_active || customerSummary(s, x.id).debt > 0)}
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
          const a = saleSummary(s, x);
          return (
            <tr key={x.id}>
              <td>{x.code}</td>
              <td>{x.sale_date}</td>
              <td>{find(s, "sites", x.site_id)?.name}</td>
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
export function ReturnForm({ s, record, submit, close, busy }: FormProps) {
  const id = recordId(record);
  const a = saleSummary(s, { id });
  const [q, setQ] = useState<Record<string, string>>({}),
    [v, setV] = useState<ReturnValues>({ return_date: day(), reason: "", economic_amount: "0", notes: "" });
  const set = (k: string, x: string | boolean) => setV((a) => ({ ...a, [k]: x }));
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        await submit("RETURN_CREATE", {
          ...v,
          sale_id: id,
          items: Object.entries(q)
            .filter(([, x]) => Number(x) > 0)
            .map(([sale_item_id, quantity]) => ({ sale_item_id, quantity })),
        });
      }}
    >
      <p className="notice">
        La devolución registra el retorno físico. La reducción económica se ingresa explícitamente; no se
        calcula como descuento automático.
      </p>
      <Input
        label="Fecha de devolución"
        type="date"
        value={v.return_date}
        onChange={(x) => set("return_date", x)}
      />
      <Table heads={["Producto", "Entregado", "Ya devuelto", "Devolver sacos"]}>
        {a.items.map((x) => {
          const returned = s.returnItems
            .filter((r) => r.sale_item_id === x.id)
            .reduce((n: number, r) => n + r.quantity, 0);
          return (
            <tr key={x.id}>
              <td>{find(s, "products", x.product_id)?.name}</td>
              <td>{x.quantity}</td>
              <td>{returned}</td>
              <td>
                <input
                  aria-label="Sacos a devolver"
                  type="number"
                  min="0"
                  step="1"
                  max={x.quantity - returned}
                  value={q[x.id] ?? 0}
                  onChange={(e) => setQ((a) => ({ ...a, [x.id]: e.target.value }))}
                />
              </td>
            </tr>
          );
        })}
      </Table>
      <Input
        label="Reducción económica S/ (0 si no aplica)"
        type="number"
        min="0"
        step="0.01"
        value={v.economic_amount}
        onChange={(x) => set("economic_amount", x)}
      />
      <Input label="Motivo de devolución" required value={v.reason} onChange={(x) => set("reason", x)} />
      <Footer busy={busy} close={close} label="Confirmar devolución" />
    </form>
  );
}
