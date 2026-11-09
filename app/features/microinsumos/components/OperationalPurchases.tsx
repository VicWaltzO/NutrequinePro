import { useEffect, useRef, useState } from "react";
import type { AppState, Submit, MicroReceipt } from "@/lib/domain-types";
import { Input, Field, money, kg } from "@/shared/ui";
import { orderNominal } from "@/shared/lib/nominal-order.mjs";

type Line = {
  micro_ingredient_id: string;
  quantity_kg: string;
  unit_price: string;
  amount: string;
  discount: string;
};
const blank = (): Line => ({
  micro_ingredient_id: "",
  quantity_kg: "",
  unit_price: "",
  amount: "",
  discount: "0",
});
export default function OperationalPurchases({
  s,
  admin,
  run,
  busy,
}: {
  s: AppState;
  admin: boolean;
  run: Submit;
  busy: boolean;
}) {
  const [editing, setEditing] = useState<MicroReceipt | "new" | null>(null);
  const [supplier, setSupplier] = useState("");
  const [reference, setReference] = useState("");
  const [source, setSource] = useState("");
  const [date, setDate] = useState("");
  const [total, setTotal] = useState("");
  const [discount, setDiscount] = useState("0");
  const [received, setReceived] = useState(false);
  const [reviewed, setReviewed] = useState(false);
  const [lines, setLines] = useState<Line[]>([blank()]);
  const form = useRef<HTMLFormElement>(null);
  const trigger = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    if (editing) form.current?.querySelector("input")?.focus();
    else trigger.current?.focus();
  }, [editing]);
  const start = (row: MicroReceipt | "new", button: HTMLButtonElement) => {
    trigger.current = button;
    setEditing(row);
    setReceived(false);
    setReviewed(false);
    const r = row === "new" ? null : row;
    setSupplier(r?.supplier ?? "");
    setReference(r?.reference ?? "");
    setSource(r?.source ?? "");
    setDate(r?.document_date ?? "");
    setTotal(r ? String(r.total_cents / 100) : "");
    setDiscount(r ? String(r.discount_cents / 100) : "0");
    setLines(
      r
        ? s.microReceiptLines
            .filter((l) => l.receipt_id === r.id && l.is_current)
            .map((l) => ({
              micro_ingredient_id: l.micro_ingredient_id,
              quantity_kg: String(l.quantity_grams / 1000),
              unit_price: String(l.unit_price_cents / 100),
              amount: String(l.amount_cents / 100),
              discount: String(l.discount_cents / 100),
            }))
        : [blank()],
    );
  };
  const save = async (status: string) => {
    const result = await run("MICRO_RECEIPT_SAVE", {
      ...(editing && editing !== "new" ? { id: editing.id, expected_version: editing.version } : {}),
      status,
      supplier,
      reference,
      source,
      document_date: date,
      total,
      discount,
      currency: "PEN",
      payment_method: "CASH",
      receive_confirmed: received,
      reviewed_expenses: reviewed,
      lines,
    });
    if (result) setEditing(null);
  };
  const micros = orderNominal(
    s.microIngredients.filter((m) => m.is_active),
    (m) => m.name,
    (m) => m.id,
  );
  const change = (index: number, field: keyof Line, value: string) =>
    setLines((old) => old.map((l, i) => (i === index ? { ...l, [field]: value } : l)));
  const roundedMoney = (n: bigint, d: bigint) => {
    const cents = (n * BigInt(2) + d) / (BigInt(2) * d);
    return `S/ ${cents / BigInt(100)}.${String(cents % BigInt(100)).padStart(2, "0")}`;
  };
  return (
    <section className="operational-purchases" aria-labelledby="operational-title">
      <h3 id="operational-title">Compras operativas</h3>
      <p>Recepción posterior al corte · Pago al contado en PEN · Un gasto por factura.</p>
      <p>
        El flete se registra por separado en Gastos, categoría Logística. Los descuentos requieren importe
        documentado por artículo.
      </p>
      {admin && (
        <button type="button" disabled={busy} onClick={(e) => start("new", e.currentTarget)}>
          Registrar compra operativa
        </button>
      )}
      {admin && editing && (
        <form
          ref={form}
          onSubmit={(e) => {
            e.preventDefault();
            void save("CONFIRMED");
          }}
        >
          <h4>{editing === "new" ? "Nueva compra operativa" : "Completar borrador operativo"}</h4>
          <fieldset disabled={busy}>
            <Input
              label="Proveedor de compra"
              value={supplier}
              onChange={setSupplier}
              required
              maxLength={2000}
            />
            <Input
              label="Referencia de compra"
              value={reference}
              onChange={setReference}
              required
              maxLength={2000}
            />
            <Input
              label="Fecha de recepción y comprobante"
              value={date}
              onChange={setDate}
              type="date"
              required
            />
            <Input
              label="Fuente / observaciones de compra"
              value={source}
              onChange={setSource}
              required
              maxLength={2000}
            />
            <Input
              label="Total pagado por insumos (S/)"
              value={total}
              onChange={setTotal}
              required
              inputMode="decimal"
            />
            <Input
              label="Descuento total documentado (S/)"
              value={discount}
              onChange={setDiscount}
              required
              inputMode="decimal"
            />
          </fieldset>
          {lines.map((line, i) => (
            <fieldset className="receipt-line" key={i} disabled={busy}>
              <legend>Renglón {i + 1}</legend>
              <Field label={`Microinsumo recibido ${i + 1}`}>
                <select
                  aria-label={`Microinsumo recibido ${i + 1}`}
                  value={line.micro_ingredient_id}
                  onChange={(e) => change(i, "micro_ingredient_id", e.target.value)}
                  required
                >
                  <option value="">Seleccionar microinsumo</option>
                  {micros.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Input
                label={`Kg recibidos ${i + 1}`}
                value={line.quantity_kg}
                onChange={(v) => change(i, "quantity_kg", v)}
                inputMode="decimal"
                placeholder="Ej. 0.001"
                required
              />
              <Input
                label={`Precio por kg (S/) ${i + 1}`}
                value={line.unit_price}
                onChange={(v) => change(i, "unit_price", v)}
                inputMode="decimal"
                required
              />
              <Input
                label={`Importe bruto (S/) ${i + 1}`}
                value={line.amount}
                onChange={(v) => change(i, "amount", v)}
                inputMode="decimal"
                required
              />
              <Input
                label={`Descuento del artículo (S/) ${i + 1}`}
                value={line.discount}
                onChange={(v) => change(i, "discount", v)}
                inputMode="decimal"
                required
              />
              <button type="button" onClick={() => setLines((old) => old.filter((_, j) => i !== j))}>
                Retirar renglón {i + 1}
              </button>
            </fieldset>
          ))}
          <button
            type="button"
            disabled={busy || lines.length >= 100}
            onClick={() => setLines((old) => [...old, blank()])}
          >
            Añadir artículo recibido
          </button>
          <label className="receipt-confirmation">
            <input
              type="checkbox"
              checked={reviewed}
              onChange={(e) => setReviewed(e.target.checked)}
              disabled={busy}
            />
            Revisé los gastos previos para evitar duplicados
          </label>
          <label className="receipt-confirmation">
            <input
              type="checkbox"
              checked={received}
              onChange={(e) => setReceived(e.target.checked)}
              disabled={busy}
            />
            Confirmo la recepción física y el pago de esta compra
          </label>
          <p>
            Una compra confirmada conserva sus renglones y gasto. Las correcciones posteriores aún no están
            habilitadas.
          </p>
          <div className="form-actions">
            <button type="button" disabled={busy} onClick={() => setEditing(null)}>
              Cancelar compra
            </button>
            <button type="button" disabled={busy} onClick={() => void save("DRAFT")}>
              Guardar borrador operativo
            </button>
            <button className="primary" type="submit" disabled={busy}>
              {busy ? "Guardando…" : "Confirmar compra y recepción"}
            </button>
          </div>
        </form>
      )}
      <h4>Existencias y costo medio actuales</h4>
      {s.microLedgers.length === 0 ? (
        <p>Sin recepciones confirmadas. Consulte los saldos iniciales.</p>
      ) : (
        <ul>
          {orderNominal(
            s.microLedgers,
            (l) => s.microIngredients.find((m) => m.id === l.micro_ingredient_id)?.name ?? "",
            (l) => l.id,
          ).map((l) => {
            const value = l.ledger.value_cents;
            return (
              <li key={l.id}>
                {s.microIngredients.find((m) => m.id === l.micro_ingredient_id)?.name} · Stock físico:{" "}
                {kg(l.ledger.quantity_grams)} kg · Valor:{" "}
                {value ? roundedMoney(BigInt(value.n), BigInt(value.d)) : "Desconocido"} · Costo medio/kg:{" "}
                {value && l.ledger.quantity_grams > 0
                  ? roundedMoney(
                      BigInt(value.n) * BigInt(1000),
                      BigInt(value.d) * BigInt(l.ledger.quantity_grams),
                    )
                  : "Sin stock"}
              </li>
            );
          })}
        </ul>
      )}
      {s.microReceipts.length === 0 && <p role="status">Aún no hay compras operativas registradas.</p>}
      {s.microReceipts.map((r) => (
        <details key={r.id} className="receipt-record">
          <summary>
            {r.reference} · {r.supplier} · {r.status === "DRAFT" ? "Borrador" : "Confirmada"} ·{" "}
            {money(r.total_cents)}
          </summary>
          <p>
            Fecha: {r.document_date} · Versión: {r.version} · Fuente: {r.source}
          </p>
          <p>
            Registrado por {s.users.find((u) => u.id === r.created_by)?.name ?? r.created_by} · {r.created_at}
          </p>
          <p>Gasto asociado: {r.expense_id ?? "Sin gasto: borrador"}</p>
          <ul>
            {s.microReceiptLines
              .filter((l) => l.receipt_id === r.id && l.is_current)
              .map((l) => (
                <li key={l.id}>
                  {s.microIngredients.find((m) => m.id === l.micro_ingredient_id)?.name} ·{" "}
                  {kg(l.quantity_grams)} kg · Precio/kg: {money(l.unit_price_cents)} · Bruto:{" "}
                  {money(l.amount_cents)} · Descuento: {money(l.discount_cents)} · Recibido:{" "}
                  {money(l.total_cost_cents)}
                </li>
              ))}
          </ul>
          {admin && r.status === "DRAFT" && (
            <button type="button" disabled={busy} onClick={(e) => start(r, e.currentTarget)}>
              Completar {r.reference}
            </button>
          )}
        </details>
      ))}
    </section>
  );
}
