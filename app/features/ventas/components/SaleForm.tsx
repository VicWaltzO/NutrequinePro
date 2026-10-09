"use client";
import { useSaleFormState } from "../hooks/useSaleFormState";
import { stock } from "@/lib/domain.mjs";
import { Input } from "@/shared/ui";
import { Select } from "@/shared/ui";
import { Check } from "@/shared/ui";
import { Table } from "@/shared/ui";
import { PaymentFields } from "@/shared/ui";
import { money } from "@/shared/ui";
import { kg } from "@/shared/ui";
import { find } from "@/shared/ui";
import { Footer } from "@/shared/ui/FormFooter";
import type { FormProps } from "@/shared/types/forms";
export function SaleForm({ s, record, kind, submit, close, busy }: FormProps) {
  const {
    edit,
    v,
    set,
    rows,
    setRows,
    paidAmount,
    setPaidAmount,
    quick,
    setQuick,
    newName,
    setNewName,
    duplicate,
    setDuplicate,
    update,
    missing,
    total,
    dup,
    paid,
  } = useSaleFormState({ s, record, kind });
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
