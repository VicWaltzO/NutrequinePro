import { useSaleFormState } from "../hooks/useSaleFormState";
import { SaleLineEditor } from "./SaleLineEditor";
import { stock } from "@/lib/domain-preview.mjs";
import { Input, Select, Check, PaymentFields, money, kg, find } from "@/shared/ui";
import { Footer } from "@/shared/ui/FormFooter";
import type { FormProps } from "@/shared/types/forms";
export function SaleForm({ s: state, record, kind, submit, close, busy }: FormProps) {
  const {
    edit,
    v: values,
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
  } = useSaleFormState({ s: state, record, kind });
  let submitLabel = "Confirmar venta";
  if (edit) submitLabel = "Registrar rectificación";
  else if (kind === "draft") submitLabel = "Guardar borrador";
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        await submit(edit ? "SALE_CORRECT" : "SALE_SAVE", {
          ...values,
          paid_amount: paidAmount ?? total / 100,
          items: rows,
          confirm: kind !== "draft",
          deliver: values.mode === "immediate",
          create_production: values.mode === "planned",
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
              value={values.sale_date}
              onChange={(x) => set("sale_date", x)}
            />
            <Select
              label="Cliente"
              required
              value={values.customer_id}
              onChange={(x) => {
                set("customer_id", x);
                const d = state.customerSites.find(
                  (a) => a.customer_id === x && a.is_default && a.is_active !== false,
                );
                if (d) set("site_id", d.site_id);
              }}
              options={state.customers.filter((x) => x.is_active && !x.deleted_at)}
            />
            <Select
              label="Sede destino"
              required
              value={values.site_id}
              onChange={(x) => set("site_id", x)}
              options={state.sites.filter((x) => x.is_active)}
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
      <SaleLineEditor state={state} rows={rows} setRows={setRows} update={update} />
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
              value={values.payment_condition}
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
              value={values.mode}
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
                  {find(state, "products", id)?.name}: stock {stock(state, id).quantity}, solicitado {a.q},
                  faltan {Math.max(0, a.q - stock(state, id).quantity)} sacos. Peso disponible:{" "}
                  {kg(stock(state, id).weight_kg)} kg.
                </p>
              ))}
              <p>Elija venta futura para continuar. El stock saldrá al entregar.</p>
            </div>
          )}
          {values.mode !== "immediate" && (
            <Select
              label="Asociar a un lote existente (opcional)"
              value={values.production_id}
              onChange={(x) => set("production_id", x)}
              options={state.productions
                .filter((x) => x.status !== "CANCELLED")
                .map((x) => ({ id: x.id, name: x.code }))}
            />
          )}
          {values.payment_condition === "CASH" && (
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
                    <PaymentFields v={values} set={set} />
                    <Input
                      label="Fecha del pago"
                      type="date"
                      required
                      value={values.payment_date ?? values.sale_date}
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
            value={values.reason}
            onChange={(x) => set("reason", x)}
          />
        </>
      )}
      <Input label="Notas (opcional)" value={values.notes} onChange={(x) => set("notes", x)} />
      <Footer
        busy={busy}
        disabled={!edit && kind !== "draft" && values.mode === "immediate" && missing.length > 0}
        close={close}
        label={submitLabel}
      />
    </form>
  );
}
