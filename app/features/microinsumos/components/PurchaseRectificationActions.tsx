import { useEffect, useRef, useState } from "react";
import type { AppState, MicroReceipt, Submit } from "@/lib/domain-types";
import { createCommandRequest } from "@/lib/command-request.mjs";
import { Input, money, weight } from "@/shared/ui";

export default function PurchaseRectificationActions({
  s,
  receipt,
  admin,
  run,
  busy,
}: {
  s: AppState;
  receipt: MicroReceipt;
  admin: boolean;
  run: Submit;
  busy: boolean;
}) {
  const [revision, setRevision] = useState<number | null>(null);
  const [version, setVersion] = useState(receipt.version);
  const [total, setTotal] = useState("");
  const [discount, setDiscount] = useState("");
  const [date, setDate] = useState("");
  const [reason, setReason] = useState("");
  const [reference, setReference] = useState("");
  const [lines, setLines] = useState<
    {
      micro_ingredient_id: string;
      quantity_kg: string;
      unit_price: string;
      amount: string;
      discount: string;
    }[]
  >([]);
  const [attempted, setAttempted] = useState(false);
  const [requests] = useState(createCommandRequest);
  const form = useRef<HTMLFormElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const restore = useRef(false);
  useEffect(() => {
    if (revision !== null) form.current?.querySelector("input")?.focus();
    else if (restore.current && !busy) {
      trigger.current?.focus();
      restore.current = false;
    }
  }, [revision, busy]);
  const close = () => {
    requests.reset();
    setRevision(null);
    restore.current = true;
    setAttempted(false);
  };
  const history = s.corrections.filter(
    (c) => c.entity_type === "MICRO_RECEIPT_RECTIFY" && c.entity_id === receipt.id,
  );
  return (
    <div className="purchase-rectification">
      {history.length > 0 && (
        <details>
          <summary>Historial de correcciones ({history.length})</summary>
          {history.map((c) => (
            <div key={c.id}>
              <p>
                {c.code} · {c.reason} · {s.users.find((u) => u.id === c.created_by)?.name ?? c.created_by} ·{" "}
                {c.created_at}
              </p>
              <ul>
                {s.correctionFields
                  .filter((f) => f.correction_id === c.id && ["reference", "date"].includes(f.field_name))
                  .map((f) => (
                    <li key={f.id}>
                      {f.field_name === "reference" ? "Referencia" : "Fecha"}:{" "}
                      {JSON.parse(f.new_value) as string}
                    </li>
                  ))}
              </ul>
            </div>
          ))}
          <h5>Versiones documentales conservadas</h5>
          <ul>
            {s.microReceiptLines
              .filter((l) => l.receipt_id === receipt.id)
              .map((l) => (
                <li key={l.id}>
                  Versión {l.version} · {s.microIngredients.find((m) => m.id === l.micro_ingredient_id)?.name}{" "}
                  · {weight(l.quantity_grams)} · Precio/kg: {money(l.unit_price_cents)} · Neto:{" "}
                  {money(l.total_cost_cents)}
                  {l.is_current ? " · Vigente" : " · Histórico"}
                </li>
              ))}
          </ul>
        </details>
      )}
      {admin && (
        <button
          ref={trigger}
          type="button"
          disabled={busy || revision !== null}
          onClick={() => {
            requests.reset();
            setAttempted(false);
            setVersion(receipt.version);
            setTotal(String(receipt.total_cents / 100));
            setDiscount(String(receipt.discount_cents / 100));
            setDate("");
            setReason("");
            setReference("");
            setLines(
              s.microReceiptLines
                .filter((l) => l.receipt_id === receipt.id && l.is_current)
                .map((l) => ({
                  micro_ingredient_id: l.micro_ingredient_id,
                  quantity_kg: String(l.quantity_grams / 1000),
                  unit_price: String(l.unit_price_cents / 100),
                  amount: String(l.amount_cents / 100),
                  discount: String(l.discount_cents / 100),
                })),
            );
            setRevision(s.revision);
          }}
        >
          Corregir compra {receipt.reference}
        </button>
      )}
      {revision !== null && (
        <form
          ref={form}
          aria-label={`Corrección de compra ${receipt.reference}`}
          aria-busy={busy}
          onSubmit={async (e) => {
            e.preventDefault();
            const payload = {
              id: receipt.id,
              expected_version: version,
              expected_revision: revision,
              date,
              reason,
              reference,
              total,
              discount,
              lines,
            };
            const request = requests.begin(JSON.stringify(payload));
            if (!request) return;
            setAttempted(true);
            try {
              if (await run("MICRO_RECEIPT_RECTIFY", payload, request)) close();
            } finally {
              requests.finish();
            }
          }}
        >
          <h4>Corregir compra confirmada</h4>
          <p>
            {receipt.supplier} · {receipt.reference} · Fecha original: {receipt.document_date} · Gasto:{" "}
            {receipt.expense_id}
          </p>
          <p>
            Se ajustará solo la diferencia física disponible y el importe del mismo gasto. Toda diferencia
            económica se aplicará al valor del stock restante. Los consumos, preparaciones y ventas cerrados
            conservarán sus costos.
          </p>
          <fieldset disabled={busy || attempted}>
            <Input
              label="Fecha de corrección de compra"
              value={date}
              onChange={setDate}
              type="date"
              required
            />
            <Input label="Motivo de corrección de compra" value={reason} onChange={setReason} required />
            <Input
              label="Referencia de corrección de compra"
              value={reference}
              onChange={setReference}
              required
            />
            <Input
              label="Total corregido (S/)"
              value={total}
              onChange={setTotal}
              inputMode="decimal"
              required
            />
            <Input
              label="Descuento total corregido (S/)"
              value={discount}
              onChange={setDiscount}
              inputMode="decimal"
              required
            />
          </fieldset>
          {lines.map((line, i) => {
            const old = s.microReceiptLines.find(
              (l) =>
                l.receipt_id === receipt.id &&
                l.is_current &&
                l.micro_ingredient_id === line.micro_ingredient_id,
            );
            const change = (key: keyof typeof line, value: string) =>
              setLines((ls) => ls.map((l, j) => (j === i ? { ...l, [key]: value } : l)));
            return (
              <fieldset className="receipt-line" key={line.micro_ingredient_id} disabled={busy || attempted}>
                <legend>{s.microIngredients.find((m) => m.id === line.micro_ingredient_id)?.name}</legend>
                <p>
                  Antes: {weight(old?.quantity_grams ?? 0)} · Neto: {money(old?.total_cost_cents ?? 0)}. El
                  servidor validará la diferencia exacta y los compromisos.
                </p>
                <Input
                  label={`Kg corregidos ${i + 1}`}
                  value={line.quantity_kg}
                  onChange={(v) => change("quantity_kg", v)}
                  inputMode="decimal"
                  required
                />
                <Input
                  label={`Precio corregido por kg (S/) ${i + 1}`}
                  value={line.unit_price}
                  onChange={(v) => change("unit_price", v)}
                  inputMode="decimal"
                  required
                />
                <Input
                  label={`Importe bruto corregido (S/) ${i + 1}`}
                  value={line.amount}
                  onChange={(v) => change("amount", v)}
                  inputMode="decimal"
                  required
                />
                <Input
                  label={`Descuento corregido (S/) ${i + 1}`}
                  value={line.discount}
                  onChange={(v) => change("discount", v)}
                  inputMode="decimal"
                  required
                />
              </fieldset>
            );
          })}
          <p>
            Total anterior: {money(receipt.total_cents)} · Total propuesto: S/ {total || "sin indicar"}.
            Cambiar solo precios no produce entradas ni salidas físicas. El flete permanece separado.
          </p>
          {attempted && (
            <p role="status">
              Si perdió la respuesta, reintente la misma solicitud. Para cambiar datos, cancele y vuelva a
              abrir con el saldo actualizado.
            </p>
          )}
          <div className="form-actions">
            <button type="button" disabled={busy} onClick={close}>
              Cancelar corrección de compra
            </button>
            <button
              type="submit"
              className="primary"
              disabled={busy || !date || !reason.trim() || !reference.trim()}
            >
              {attempted ? "Reintentar corrección de compra" : "Registrar corrección de compra"}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
