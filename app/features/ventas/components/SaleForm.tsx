import { UserRound, CreditCard, Plus, X } from "lucide-react";
import { useSaleFormState } from "../hooks/useSaleFormState";
import { unitLabels } from "@/shared/domain/presentation.mjs";
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
  const hasProducts = rows.length > 0 && rows.every((row) => !!row.product_id);
  let submitLabel = "Confirmar venta";
  if (edit) submitLabel = "Registrar rectificación";
  else if (kind === "draft") submitLabel = "Guardar borrador";
  const toggleQuick = (field: string) => {
    setQuick(quick === field ? "" : field);
    setNewName("");
    setDuplicate(false);
  };
  const saveQuick = async () => {
    if (busy || !newName.trim() || (quick === "customer" && dup && !duplicate)) return;
    const result = await submit(quick === "customer" ? "CUSTOMER_SAVE" : "SITE_SAVE", {
      name: newName,
      is_active: true,
      ...(quick === "customer" ? { confirm_duplicate: duplicate } : {}),
      _keep_open: true,
    });
    if (typeof result === "string") {
      set(quick === "customer" ? "customer_id" : "site_id", result);
      setQuick("");
    }
  };
  return (
    <form
      className="sale-form"
      onSubmit={async (event) => {
        event.preventDefault();
        if (!hasProducts) return;
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
      <section className="sale-section sale-client" aria-label="Datos del cliente">
        <div className="sale-section-header">
          <h3 id="sale-client-title">
            <UserRound size={20} aria-hidden="true" />
            Cliente
          </h3>
          <span className="sale-section-meta">Datos de la operación</span>
        </div>
        <div className="sale-section-body">
          {!edit ? (
            <>
              <div className="sale-date">
                <Input
                  label="Fecha de venta"
                  type="date"
                  required
                  value={values.sale_date}
                  onChange={(value) => set("sale_date", value)}
                />
              </div>
              <div className="sale-party-grid">
                {(["customer", "site"] as const).map((field) => {
                  const customer = field === "customer";
                  const caption = customer ? "Cliente" : "Sede destino";
                  const options = customer
                    ? state.customers.filter((row) => row.is_active && !row.deleted_at)
                    : state.sites.filter((row) => row.is_active);
                  return (
                    <div className="sale-party-field" key={field}>
                      <div className="sale-field-heading">
                        <label htmlFor={"sale-" + field}>{caption}</label>
                        <button
                          type="button"
                          className="text-button"
                          aria-expanded={quick === field}
                          aria-controls={quick === field ? "sale-quick-create" : undefined}
                          disabled={busy}
                          onClick={() => toggleQuick(field)}
                        >
                          <Plus size={14} aria-hidden="true" />
                          Crear {customer ? "cliente" : "sede"}
                        </button>
                      </div>
                      <select
                        id={"sale-" + field}
                        aria-label={caption}
                        required
                        value={customer ? values.customer_id : values.site_id}
                        onChange={(event) => {
                          const value = event.target.value;
                          set(customer ? "customer_id" : "site_id", value);
                          if (customer) {
                            const defaultSite = state.customerSites.find(
                              (row) => row.customer_id === value && row.is_default && row.is_active !== false,
                            );
                            if (defaultSite) set("site_id", defaultSite.site_id);
                          }
                        }}
                      >
                        <option value="">Seleccionar</option>
                        {options.map((option) => (
                          <option key={option.id} value={option.id}>
                            {option.name}
                          </option>
                        ))}
                      </select>
                      {quick === field && (
                        <div className="sale-quick-create" id="sale-quick-create">
                          <Input
                            label={customer ? "Nombre del nuevo cliente" : "Nombre de sede"}
                            value={newName}
                            onChange={setNewName}
                            onKeyDown={(event) => {
                              if (event.key === "Enter") {
                                event.preventDefault();
                                void saveQuick();
                              }
                            }}
                          />
                          {customer && dup && (
                            <>
                              <p className="warning">
                                Posible duplicado: ya existe un cliente con ese nombre.
                              </p>
                              <Check
                                label="Confirmo que es otro cliente"
                                value={duplicate}
                                onChange={setDuplicate}
                              />
                            </>
                          )}
                          <div className="sale-quick-actions">
                            <button
                              type="button"
                              disabled={busy || !newName.trim() || (customer && dup && !duplicate)}
                              onClick={saveQuick}
                            >
                              Guardar {customer ? "cliente" : "sede"}
                            </button>
                            <button
                              type="button"
                              className="icon-button"
                              aria-label="Cancelar creación"
                              onClick={() => setQuick("")}
                              disabled={busy}
                            >
                              <X size={17} />
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          ) : (
            <dl className="sale-original-client">
              <div>
                <dt>Cliente</dt>
                <dd>{find(state, "customers", values.customer_id)?.name}</dd>
              </div>
              <div>
                <dt>Sede destino</dt>
                <dd>{find(state, "sites", values.site_id)?.name}</dd>
              </div>
              <div>
                <dt>Fecha de venta</dt>
                <dd>{values.sale_date}</dd>
              </div>
            </dl>
          )}
        </div>
      </section>
      <SaleLineEditor state={state} rows={rows} setRows={setRows} update={update} total={total}>
        {!hasProducts && (
          <p className="notice" role="status">
            Agrega al menos un producto y completa todas las líneas.
          </p>
        )}
        {!edit && (
          <div className="sale-delivery">
            <Select
              label="Entrega"
              required
              empty={false}
              value={values.mode}
              onChange={(value) => set("mode", value)}
              options={[
                { id: "immediate", name: "Entregar ahora" },
                { id: "future", name: "Venta futura · pendiente" },
                { id: "planned", name: "Venta futura + lote a producir" },
              ]}
            />
            {missing.length > 0 && (
              <div className="warning">
                <strong>Stock insuficiente</strong>
                {missing.map(([id, required]) => (
                  <p key={id}>
                    {find(state, "products", id)?.name}: stock {stock(state, id).quantity}, solicitado{" "}
                    {required.q}, faltan {Math.max(0, required.q - stock(state, id).quantity)}{" "}
                    {unitLabels(find(state, "products", id)).plural}. Peso disponible:{" "}
                    {kg(stock(state, id).weight_kg)} kg.
                  </p>
                ))}
                <p>Elija venta futura para continuar. El stock saldrá al entregar.</p>
              </div>
            )}
            {values.mode !== "immediate" && (
              <p className="notice">
                Los productos de ingreso directo quedan pendientes de existencias físicas. Solo los productos
                fabricables se incluyen en el lote a producir.
              </p>
            )}
            {values.mode !== "immediate" && (
              <Select
                label="Asociar a un lote existente (opcional)"
                value={values.production_id}
                onChange={(value) => set("production_id", value)}
                options={state.productions
                  .filter((row) => row.status !== "CANCELLED")
                  .map((row) => ({ id: row.id, name: row.code }))}
              />
            )}
          </div>
        )}
      </SaleLineEditor>
      <section className="sale-section sale-payments" aria-labelledby="sale-payments-title">
        <div className="sale-section-header">
          <h3 id="sale-payments-title">
            <CreditCard size={20} aria-hidden="true" />
            Pagos
          </h3>
          <span className="sale-section-meta">Condición y saldo</span>
        </div>
        <div className="sale-section-body">
          {!edit ? (
            <>
              <Select
                label="Condición"
                required
                empty={false}
                value={values.payment_condition}
                onChange={(value) => set("payment_condition", value)}
                options={[
                  { id: "CREDIT", name: "Crédito" },
                  { id: "CASH", name: "Contado" },
                ]}
              />
              {values.payment_condition === "CASH" ? (
                <>
                  <div className="form-grid sale-payment-fields">
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
                          onChange={(value) => set("payment_date", value)}
                        />
                      </>
                    )}
                  </div>
                  <div className="summary-strip">
                    <span>Aplicado a la venta: {money(Math.min(total, paid))}</span>
                    <span>Saldo por cobrar: {money(Math.max(0, total - paid))}</span>
                    <strong>Saldo a favor: {money(Math.max(0, paid - total))}</strong>
                  </div>
                  <p className="sale-section-help">
                    El pago puede ser parcial. El excedente queda a favor del cliente y puede aplicarse a otra
                    venta desde el detalle del pago.
                  </p>
                </>
              ) : (
                <p className="sale-credit-summary">
                  Saldo por cobrar <strong>{money(total)}</strong>
                  <small>Puedes registrar el cobro después de confirmar la venta.</small>
                </p>
              )}
            </>
          ) : (
            <>
              <p className="notice">
                Se conservarán los valores originales. La rectificación ajustará inventario y saldo.
              </p>
              <Input
                label="Motivo de rectificación"
                required
                value={values.reason}
                onChange={(value) => set("reason", value)}
              />
            </>
          )}
          <Input label="Notas (opcional)" value={values.notes} onChange={(value) => set("notes", value)} />
        </div>
      </section>
      <Footer
        busy={busy}
        disabled={
          !hasProducts || (!edit && kind !== "draft" && values.mode === "immediate" && missing.length > 0)
        }
        close={close}
        label={submitLabel}
      />
    </form>
  );
}
