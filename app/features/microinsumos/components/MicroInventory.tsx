import HistoricalPurchases from "./HistoricalPurchases";
import { orderNominal } from "@/shared/lib/nominal-order.mjs";
import { useEffect, useRef, useState } from "react";
import type { AppState, Submit, MicroIngredient, MicroOpening } from "@/lib/domain-types";
import { Input, Field, SortableTable, kg, money } from "@/shared/ui";

export default function MicroInventory({
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
  const [query, setQuery] = useState("");
  const [editor, setEditor] = useState<MicroIngredient | "new" | null>(null);
  const [opening, setOpening] = useState<MicroIngredient | null>(null);
  const trigger = useRef<HTMLButtonElement | null>(null);
  const formRef = useRef<HTMLFormElement | null>(null);
  useEffect(() => {
    if (editor || opening) formRef.current?.querySelector("input")?.focus();
    else trigger.current?.focus();
  }, [editor, opening]);
  const [name, setName] = useState("");
  const [operational, setOperational] = useState("");
  const [price, setPrice] = useState("");
  const [active, setActive] = useState(true);
  const [quantity, setQuantity] = useState("");
  const [cutoff, setCutoff] = useState("");
  const [measurement, setMeasurement] = useState("REAL");
  const [source, setSource] = useState("");
  const [notes, setNotes] = useState("");
  const [reason, setReason] = useState("");
  const [snapshot, setSnapshot] = useState<MicroOpening | undefined>();
  const close = () => {
    setEditor(null);
    setOpening(null);
  };
  const start = (micro: MicroIngredient | "new", button: HTMLButtonElement) => {
    trigger.current = button;
    setOpening(null);
    setEditor(micro);
    setName(micro === "new" ? "" : micro.name);
    setOperational(micro === "new" ? "" : String(micro.operational_id));
    setPrice(
      micro === "new" || micro.known_price_per_kg === null ? "" : (micro.known_price_per_kg / 100).toFixed(2),
    );
    setActive(micro === "new" || micro.is_active);
  };
  const startOpening = (micro: MicroIngredient, button: HTMLButtonElement) => {
    trigger.current = button;
    setEditor(null);
    setOpening(micro);
    const row = s.microOpenings.find((x) => x.micro_ingredient_id === micro.id);
    setSnapshot(row);
    setQuantity(row ? String(row.quantity_grams / 1000) : "");
    setCutoff(row?.cutoff_date ?? "");
    setPrice(row?.unit_cost_cents == null ? "" : (row.unit_cost_cents / 100).toFixed(2));
    setMeasurement(row?.measurement ?? "REAL");
    setSource(row?.source ?? "");
    setNotes(row?.notes ?? "");
    setReason("");
  };
  const rows = orderNominal(
    s.microIngredients.filter((x) =>
      x.name.toLocaleLowerCase("es-PE").includes(query.toLocaleLowerCase("es-PE")),
    ),
    (x) => x.name,
    (x) => x.id,
  );
  return (
    <section className="panel micro-inventory">
      <h2>Microinsumos</h2>
      <p>Almacén único de micros · Cantidades netas en kg.</p>
      <p>
        El saldo inicial requiere una cantidad física real o estimada. Las dosis de fórmula no son
        existencias.
      </p>
      <Input label="Buscar microinsumo" value={query} onChange={setQuery} type="search" />
      {admin && (
        <button type="button" disabled={busy} onClick={(e) => start("new", e.currentTarget)}>
          Nuevo microinsumo
        </button>
      )}
      {admin && (editor || opening) && (
        <form
          ref={formRef}
          key={editor ? "catalog" : "opening"}
          onSubmit={async (e) => {
            e.preventDefault();
            const result = editor
              ? await run("MICRO_SAVE", {
                  ...(editor === "new" ? {} : { id: editor.id }),
                  name,
                  operational_id: operational,
                  known_price_per_kg: price,
                  is_active: active,
                })
              : await run(snapshot ? "MICRO_CORRECT" : "MICRO_OPEN", {
                  micro_ingredient_id: opening!.id,
                  ...(snapshot ? { id: snapshot.id, expected_version: snapshot.version, reason } : {}),
                  quantity_kg: quantity,
                  cutoff_date: cutoff,
                  measurement,
                  source,
                  notes,
                  unit_cost: price,
                });
            if (result) close();
          }}
        >
          <h3>
            {editor
              ? editor === "new"
                ? "Nuevo microinsumo"
                : "Editar microinsumo"
              : `${snapshot ? "Corregir" : "Registrar"} saldo inicial: ${opening!.name}`}
          </h3>
          <fieldset disabled={busy}>
            {editor ? (
              <>
                <Input
                  label="Nombre comercial exacto"
                  value={name}
                  onChange={setName}
                  required
                  maxLength={2000}
                />
                <Input
                  label="ID operativo"
                  value={operational}
                  onChange={setOperational}
                  required
                  readOnly={editor !== "new"}
                  inputMode="numeric"
                />
                <Field label="Estado">
                  <select
                    aria-label="Estado"
                    value={active ? "active" : "inactive"}
                    onChange={(e) => setActive(e.target.value === "active")}
                  >
                    <option value="active">Activo</option>
                    <option value="inactive">Inactivo</option>
                  </select>
                </Field>
              </>
            ) : (
              <>
                <Input
                  label="Cantidad neta (kg)"
                  value={quantity}
                  onChange={setQuantity}
                  required
                  inputMode="decimal"
                  placeholder="Ej. 0.05"
                />
                <Input label="Fecha de corte" value={cutoff} onChange={setCutoff} required type="date" />
                <Field label="Medición">
                  <select
                    aria-label="Medición"
                    value={measurement}
                    onChange={(e) => setMeasurement(e.target.value)}
                  >
                    <option value="REAL">Real</option>
                    <option value="ESTIMATED">Estimada</option>
                  </select>
                </Field>
                <Input
                  label="Procedencia de la cantidad"
                  value={source}
                  onChange={setSource}
                  required
                  maxLength={2000}
                />
                <Input label="Observación" value={notes} onChange={setNotes} maxLength={2000} />
                {snapshot && (
                  <Input
                    label="Motivo de corrección"
                    value={reason}
                    onChange={setReason}
                    required
                    maxLength={2000}
                  />
                )}
              </>
            )}
            <Input
              label={editor ? "Precio conocido por kg (S/, opcional)" : "Costo inicial por kg (S/, opcional)"}
              value={price}
              onChange={setPrice}
              inputMode="decimal"
            />
            <small>Deje el precio vacío si no se conoce. Use punto decimal, sin separadores de miles.</small>
            <div className="form-actions">
              <button type="button" onClick={close}>
                Cancelar
              </button>
              <button className="primary" type="submit">
                {busy ? "Guardando…" : editor ? "Guardar microinsumo" : "Guardar saldo"}
              </button>
            </div>
          </fieldset>
        </form>
      )}
      {rows.length === 0 ? (
        <p role="status">
          {query
            ? "No hay coincidencias."
            : "Aún no hay microinsumos. Registre el catálogo antes de abrir saldos."}
        </p>
      ) : (
        <SortableTable
          heads={[
            "Microinsumo",
            "ID operativo",
            "Estado",
            "Saldo inicial (kg)",
            "Medición",
            "Fecha de corte",
            "Valor inicial",
            "Acciones",
          ]}
          rows={rows}
          values={[
            (x) => x.name,
            (x) => x.operational_id,
            (x) => (x.is_active ? "Activo" : "Inactivo"),
            (x) => s.microOpenings.find((o) => o.micro_ingredient_id === x.id)?.quantity_grams ?? null,
            null,
            (x) => s.microOpenings.find((o) => o.micro_ingredient_id === x.id)?.cutoff_date ?? null,
            (x) => s.microOpenings.find((o) => o.micro_ingredient_id === x.id)?.valuation_cents ?? null,
            null,
          ]}
          tie={(x) => [x.name, x.id]}
        >
          {(micro) => {
            const row = s.microOpenings.find((x) => x.micro_ingredient_id === micro.id);
            return (
              <tr key={micro.id}>
                <td>
                  {micro.name}
                  <details>
                    <summary>Trazabilidad de {micro.name}</summary>
                    <p>
                      Precio conocido por kg:{" "}
                      {micro.known_price_per_kg === null ? "Desconocido" : money(micro.known_price_per_kg)}
                    </p>
                    {row && (
                      <>
                        <p>Procedencia: {row.source}</p>
                        <p>Observación: {row.notes || "Sin observación"}</p>
                        <p>
                          Registrado por:{" "}
                          {s.users.find((user) => user.id === row.created_by)?.name ?? row.created_by} ·{" "}
                          {row.created_at}
                        </p>
                        <p>
                          Versión del saldo: {row.version}
                          {row.updated_at ? ` · Corregido: ${row.updated_at}` : ""}
                        </p>
                        <p>
                          Costo inicial por kg:{" "}
                          {row.unit_cost_cents === null ? "Desconocido" : money(row.unit_cost_cents)}
                        </p>
                      </>
                    )}
                  </details>
                </td>
                <td>{micro.operational_id}</td>
                <td>{micro.is_active ? "Activo" : "Inactivo"}</td>
                <td>{row ? kg(row.quantity_grams) : "Sin registrar"}</td>
                <td>{row ? (row.measurement === "REAL" ? "Real" : "Estimada") : "—"}</td>
                <td>{row?.cutoff_date ?? "—"}</td>
                <td>{row?.valuation_cents == null ? "Desconocido" : money(row.valuation_cents)}</td>
                <td>
                  {admin && (
                    <>
                      <button
                        aria-label={`Editar ${micro.name}`}
                        disabled={busy}
                        onClick={(e) => start(micro, e.currentTarget)}
                      >
                        Editar
                      </button>
                      {(micro.is_active || row) && (
                        <button
                          aria-label={`${row ? "Corregir saldo" : "Registrar saldo"} de ${micro.name}`}
                          disabled={busy}
                          onClick={(e) => startOpening(micro, e.currentTarget)}
                        >
                          {row ? "Corregir saldo" : "Registrar saldo"}
                        </button>
                      )}
                    </>
                  )}
                </td>
              </tr>
            );
          }}
        </SortableTable>
      )}
      <HistoricalPurchases s={s} admin={admin} run={run} busy={busy} />
    </section>
  );
}
