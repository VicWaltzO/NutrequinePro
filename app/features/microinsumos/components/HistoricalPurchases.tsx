import { useEffect, useRef, useState } from "react";
import type { AppState, Submit, MicroPurchase } from "@/lib/domain-types";
import { Input, Field, money, kg } from "@/shared/ui";
import { orderNominal } from "@/shared/lib/nominal-order.mjs";

type Line = { micro_ingredient_id: string; quantity_kg: string; unit_price: string; amount: string };
const blankLine = (): Line => ({ micro_ingredient_id: "", quantity_kg: "", unit_price: "", amount: "" });
const decimal = (value: number | null, scale: number) => (value === null ? "" : String(value / scale));
export default function HistoricalPurchases({
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
  const [editing, setEditing] = useState<MicroPurchase | "new" | null>(null);
  const [kind, setKind] = useState("DOCUMENT");
  const [supplier, setSupplier] = useState("");
  const [reference, setReference] = useState("");
  const [source, setSource] = useState("");
  const [date, setDate] = useState("");
  const [total, setTotal] = useState("");
  const [discount, setDiscount] = useState("");
  const [expense, setExpense] = useState("");
  const [reviewed, setReviewed] = useState(false);
  const [reason, setReason] = useState("");
  const [lines, setLines] = useState<Line[]>([blankLine()]);
  const [query, setQuery] = useState("");
  const [cancelling, setCancelling] = useState<MicroPurchase | null>(null);
  const trigger = useRef<HTMLButtonElement | null>(null);
  const form = useRef<HTMLFormElement | null>(null);
  useEffect(() => {
    if (editing || cancelling) form.current?.querySelector("input")?.focus();
    else trigger.current?.focus();
  }, [editing, cancelling]);
  const close = () => {
    setEditing(null);
    setCancelling(null);
  };
  const start = (row: MicroPurchase | "new", button: HTMLButtonElement) => {
    trigger.current = button;
    setCancelling(null);
    setEditing(row);
    setReason("");
    setReviewed(false);
    const record = row === "new" ? null : row;
    setKind(record?.document_kind ?? "DOCUMENT");
    setSupplier(record?.supplier ?? "");
    setReference(record?.reference ?? "");
    setSource(record?.source ?? "");
    setDate(record?.document_date ?? "");
    setTotal(decimal(record?.total_cents ?? null, 100));
    setDiscount(decimal(record?.discount_cents ?? null, 100));
    setExpense(record?.expense_id ?? "");
    setLines(
      record
        ? s.microPurchaseLines
            .filter((x) => x.purchase_id === record.id && x.is_current)
            .map((x) => ({
              micro_ingredient_id: x.micro_ingredient_id,
              quantity_kg: decimal(x.quantity_grams, 1000),
              unit_price: decimal(x.unit_price_cents, 100),
              amount: decimal(x.amount_cents, 100),
            }))
        : [blankLine()],
    );
  };
  const save = async (status: string) => {
    const result = await run("MICRO_PURCHASE_SAVE", {
      ...(editing && editing !== "new" ? { id: editing.id, expected_version: editing.version, reason } : {}),
      status,
      document_kind: kind,
      supplier,
      reference,
      source,
      document_date: date,
      total,
      discount,
      payment_method: "CASH",
      existing_expense_id: expense,
      reviewed_expenses: reviewed,
      lines,
    });
    if (result) close();
  };
  const locked = editing && editing !== "new" && editing.status === "CONFIRMED";
  const micros = orderNominal(
    s.microIngredients,
    (x) => x.name,
    (x) => x.id,
  );
  const candidates = orderNominal(
    s.expenses.filter(
      (x) =>
        x.status === "CONFIRMED" &&
        !x.production_cost_id &&
        !x.production_id &&
        !x.sale_id &&
        !x.site_id &&
        !x.ingredient_id,
    ),
    (x) => x.description,
    (x) => x.id,
  );
  return (
    <section className="micro-inventory historical-purchases" aria-labelledby="historical-title">
      <h2 id="historical-title">Compras históricas documentales</h2>
      <p>
        Solo comprobantes anteriores o iguales al corte de cada microinsumo. No reciben stock: el saldo
        inicial y su valor permanecen iguales.
      </p>
      <p>
        Al confirmar se registra un único gasto al contado en la fecha del comprobante, o se vincula un gasto
        existente sin contabilizarlo otra vez. Las compras posteriores corresponden a NQP26-22.
      </p>
      <Input label="Buscar comprobante histórico" value={query} onChange={setQuery} type="search" />
      {admin && (
        <button type="button" disabled={busy} onClick={(e) => start("new", e.currentTarget)}>
          Registrar compra histórica
        </button>
      )}
      {editing && admin && (
        <form
          ref={form}
          onSubmit={(e) => {
            e.preventDefault();
            void save("CONFIRMED");
          }}
        >
          <h3>
            {editing === "new" ? "Documentar compra anterior al corte" : "Corregir documentación histórica"}
          </h3>
          <fieldset disabled={busy}>
            <Field label="Tipo de comprobante">
              <select
                aria-label="Tipo de comprobante"
                value={kind}
                disabled={!!locked}
                onChange={(e) => setKind(e.target.value)}
              >
                <option value="DOCUMENT">Comprobante de proveedor</option>
                <option value="MANUAL">Referencia manual única</option>
              </select>
            </Field>
            <Input
              label="Proveedor documental"
              value={supplier}
              onChange={setSupplier}
              readOnly={!!locked}
              maxLength={2000}
            />
            <Input
              label="Serie y número o referencia única"
              value={reference}
              onChange={setReference}
              readOnly={!!locked}
              required
              maxLength={2000}
            />
            <Input
              label="Fecha del comprobante"
              value={date}
              onChange={setDate}
              type="date"
              readOnly={!!locked}
            />
            <Input
              label="Fuente o ubicación del comprobante"
              value={source}
              onChange={setSource}
              maxLength={2000}
            />
            <Input
              label="Total pagado documentado (S/)"
              value={total}
              onChange={setTotal}
              inputMode="decimal"
              readOnly={!!locked && !editing.owns_expense}
            />
            <Input
              label="Descuento documentado (S/)"
              value={discount}
              onChange={setDiscount}
              inputMode="decimal"
            />
            <small>
              Contado · PEN. Datos desconocidos: deje vacío y guarde borrador. Use punto decimal; kg hasta 3
              decimales e importes hasta 2.
            </small>
          </fieldset>
          {lines.map((line, index) => (
            <fieldset key={index} disabled={busy}>
              <legend>Renglón {index + 1}</legend>
              <Field label={`Microinsumo ${index + 1}`}>
                <select
                  aria-label={`Microinsumo ${index + 1}`}
                  value={line.micro_ingredient_id}
                  onChange={(e) =>
                    setLines(
                      lines.map((x, i) => (i === index ? { ...x, micro_ingredient_id: e.target.value } : x)),
                    )
                  }
                >
                  <option value="">Seleccione microinsumo</option>
                  {micros.map((x) => (
                    <option key={x.id} value={x.id}>
                      {x.name} · corte{" "}
                      {s.microOpenings.find((o) => o.micro_ingredient_id === x.id)?.cutoff_date ??
                        "sin registrar"}
                    </option>
                  ))}
                </select>
              </Field>
              {(
                [
                  ["quantity_kg", "Kg documentados"],
                  ["unit_price", "Precio documentado por kg (S/)"],
                  ["amount", "Importe bruto del renglón (S/)"],
                ] as const
              ).map(([key, label]) => (
                <Input
                  key={key}
                  label={`${label} ${index + 1}`}
                  value={line[key]}
                  inputMode="decimal"
                  onChange={(value) =>
                    setLines(lines.map((x, i) => (i === index ? { ...x, [key]: value } : x)))
                  }
                />
              ))}
              <button type="button" onClick={() => setLines(lines.filter((_, i) => i !== index))}>
                Quitar renglón {index + 1}
              </button>
            </fieldset>
          ))}
          <button
            type="button"
            disabled={busy || lines.length >= 100}
            onClick={() => setLines([...lines, blankLine()])}
          >
            Añadir renglón
          </button>
          <fieldset disabled={busy}>
            <Field label="Gasto ya registrado">
              <select
                aria-label="Gasto ya registrado"
                value={expense}
                disabled={!!locked}
                onChange={(e) => setExpense(e.target.value)}
              >
                <option value="">Crear un gasto solo si falta</option>
                {candidates.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.date} · {x.description} · {money(x.amount)} · {x.id}
                  </option>
                ))}
              </select>
            </Field>
            <small>
              Revise Gastos y el comprobante original. Un candidato con fecha e importe iguales bloquea un
              gasto nuevo hasta verificar el vínculo. No se vincula automáticamente por coincidencias.
            </small>
            <label>
              <input type="checkbox" checked={reviewed} onChange={(e) => setReviewed(e.target.checked)} />{" "}
              Revisé los gastos existentes y la identidad del comprobante
            </label>
            {editing !== "new" && (
              <Input
                label="Motivo de rectificación documental"
                value={reason}
                onChange={setReason}
                maxLength={2000}
              />
            )}
            <div className="form-actions">
              <button type="button" onClick={close}>
                Cancelar documentación
              </button>
              {!locked && (
                <button type="button" onClick={() => void save("DRAFT")}>
                  Guardar borrador histórico
                </button>
              )}
              <button className="primary" type="submit">
                {busy ? "Guardando…" : "Confirmar solo efecto económico"}
              </button>
            </div>
          </fieldset>
        </form>
      )}
      {cancelling && admin && (
        <form
          ref={form}
          onSubmit={async (e) => {
            e.preventDefault();
            if (
              await run("MICRO_PURCHASE_CANCEL", {
                id: cancelling.id,
                expected_version: cancelling.version,
                reason,
              })
            )
              close();
          }}
        >
          <h3>Anular documentación: {cancelling.reference}</h3>
          <p>
            {cancelling.owns_expense
              ? "Se anula únicamente el gasto creado por esta compra, en su período original."
              : "El gasto preexistente se conserva. Su anulación económica requiere revisión separada en Gastos."}{" "}
            El stock permanece igual.
          </p>
          <Input
            label="Motivo de anulación documental"
            value={reason}
            onChange={setReason}
            required
            maxLength={2000}
          />
          <div className="form-actions">
            <button type="button" onClick={close}>
              Cancelar anulación
            </button>
            <button type="submit" disabled={busy}>
              Confirmar anulación documental
            </button>
          </div>
        </form>
      )}
      {s.microPurchases.length === 0 && <p role="status">Aún no hay compras históricas documentadas.</p>}
      {s.microPurchases.length > 0 &&
        !s.microPurchases.some((x) =>
          `${x.reference} ${x.supplier ?? ""}`
            .toLocaleLowerCase("es-PE")
            .includes(query.toLocaleLowerCase("es-PE")),
        ) && <p role="status">No hay comprobantes históricos coincidentes.</p>}
      {s.microPurchases
        .filter((x) =>
          `${x.reference} ${x.supplier ?? ""}`
            .toLocaleLowerCase("es-PE")
            .includes(query.toLocaleLowerCase("es-PE")),
        )
        .map((row) => (
          <article key={row.id}>
            <h3>
              {row.reference} ·{" "}
              {row.status === "CONFIRMED"
                ? "Confirmada"
                : row.status === "DRAFT"
                  ? "Borrador sin gasto"
                  : "Anulada"}
            </h3>
            <p>
              {row.document_date ?? "Fecha desconocida"} · {row.supplier ?? "Proveedor desconocido"} · Total
              histórico {row.total_cents === null ? "desconocido" : money(row.total_cents)} · Sin entrada
              física
            </p>
            <details>
              <summary>Comprobante y trazabilidad de {row.reference}</summary>
              <p>
                Fuente: {row.source ?? "Sin documentar"} · Gasto: {row.expense_id ?? "Sin gasto"} ·{" "}
                {row.owns_expense ? "Creado por este registro" : "Gasto preexistente o borrador"} · Versión{" "}
                {row.version}
              </p>
              <p>
                Autor: {s.users.find((u) => u.id === row.created_by)?.name ?? row.created_by} ·{" "}
                {row.created_at}
              </p>
              {s.microPurchaseLines
                .filter((x) => x.purchase_id === row.id && x.is_current)
                .map((x) => (
                  <p key={x.id}>
                    {s.microIngredients.find((m) => m.id === x.micro_ingredient_id)?.name} ·{" "}
                    {x.quantity_grams === null
                      ? "Kg desconocidos"
                      : `${kg(x.quantity_grams)} kg documentales`}{" "}
                    · {x.amount_cents === null ? "Importe no desglosado" : money(x.amount_cents)} · Corte
                    validado: {x.cutoff_date_snapshot ?? "Sin corte"}
                  </p>
                ))}
            </details>
            {admin && row.status !== "CANCELLED" && (
              <div className="form-actions">
                <button disabled={busy} onClick={(e) => start(row, e.currentTarget)}>
                  Corregir comprobante {row.reference}
                </button>
                <button
                  disabled={busy}
                  onClick={(e) => {
                    trigger.current = e.currentTarget;
                    setEditing(null);
                    setCancelling(row);
                    setReason("");
                  }}
                >
                  Anular comprobante {row.reference}
                </button>
              </div>
            )}
          </article>
        ))}
    </section>
  );
}
