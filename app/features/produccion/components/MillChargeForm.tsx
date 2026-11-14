import { useRef, useState } from "react";
import type { FormProps } from "@/shared/types/forms";
import { Input, Table, kg, money } from "@/shared/ui";
import { Footer } from "@/shared/ui/FormFooter";
import { createCommandRequest } from "@/lib/command-request.mjs";
import { millChargeHistory, millChargeSnapshot } from "../domain/mill-charge.mjs";
import type { ChargeChange } from "../domain/mill-charge.mjs";

export function MillChargeForm({ s, record, submit, close, busy }: FormProps) {
  const line = s.productionJourneyLines.find((l) => l.id === record?.id);
  const previous = line && millChargeHistory(s, line.id).at(-1)?.new_snapshot;
  const [mode, setMode] = useState(previous?.mode ?? "THEORETICAL");
  const [changes, setChanges] = useState<ChargeChange[]>(
    previous?.mode === "ACTUAL"
      ? previous.rows.map((r) => ({
          ingredient_id: r.ingredient_id,
          quantity_kg: r.actual_grams / 1000,
          price_per_kg: r.actual_price_cents_per_kg / 100,
        }))
      : [],
  );
  const [reason, setReason] = useState("Conciliación del molino");
  const [revision, setRevision] = useState(s.revision);
  const [attempted, setAttempted] = useState(false);
  const [requests] = useState(createCommandRequest);
  const frozen = useRef<object | null>(null);
  if (!line) return <p role="alert">El lote no está disponible. Recargue los datos.</p>;
  let snapshot: ReturnType<typeof millChargeSnapshot> | undefined;
  let error = "";
  try {
    snapshot = millChargeSnapshot(line, mode, mode === "ACTUAL" ? changes : []);
  } catch (e) {
    error = e instanceof Error ? e.message : "Revise las cantidades y precios.";
  }
  const theoretical = millChargeSnapshot(line);
  const update = (id: string, field: "quantity_kg" | "price_per_kg", value: string) => {
    setChanges((rows) => [
      ...rows.filter((r) => r.ingredient_id !== id),
      {
        ...rows.find((r) => r.ingredient_id === id),
        ingredient_id: id,
        [field]: value,
      },
    ]);
  };
  return (
    <form
      aria-label="Conciliación del molino"
      aria-busy={busy}
      onSubmit={async (e) => {
        e.preventDefault();
        const payload = frozen.current ?? {
          line_id: line.id,
          mode,
          changes: mode === "ACTUAL" ? changes : [],
          reason,
          expected_revision: revision,
        };
        const id = requests.begin(JSON.stringify(payload));
        if (!id) return;
        frozen.current = payload;
        setAttempted(true);
        try {
          if (await submit("MILL_RECONCILE", payload, id)) close();
        } finally {
          requests.finish();
        }
      }}
    >
      <h2>{line.product_name}</h2>
      <p>
        El cobro real parte del teórico. Cambie únicamente las cantidades o precios cobrados que difieran.
      </p>
      <fieldset disabled={busy || attempted}>
        <label>
          Modalidad de cobro
          <select
            value={mode}
            onChange={(e) => {
              setMode(e.target.value as typeof mode);
              setChanges([]);
            }}
          >
            <option value="THEORETICAL">Cobro teórico</option>
            <option value="ACTUAL">Cobro real</option>
          </select>
        </label>
        <Table
          heads={[
            "Macroinsumo",
            "Kg teóricos",
            "S/ por kg teórico",
            "Kg cobrados",
            "S/ por kg cobrado",
            "Cobro real",
            "Diferencia",
          ]}
        >
          {theoretical.rows.map((r) => {
            const change = changes.find((c) => c.ingredient_id === r.ingredient_id);
            const calculated = snapshot?.rows.find((c) => c.ingredient_id === r.ingredient_id);
            return (
              <tr key={r.ingredient_id}>
                <td>{r.name}</td>
                <td>{kg(r.theoretical_grams)}</td>
                <td>{money(r.theoretical_price_cents_per_kg)}</td>
                <td>
                  <input
                    aria-label={`Kg cobrados ${r.name}`}
                    type="number"
                    min="0"
                    step="0.001"
                    required
                    disabled={mode === "THEORETICAL"}
                    value={change?.quantity_kg ?? r.theoretical_grams / 1000}
                    onChange={(e) => update(r.ingredient_id, "quantity_kg", e.target.value)}
                  />
                </td>
                <td>
                  <input
                    aria-label={`Precio cobrado ${r.name}`}
                    type="number"
                    min="0"
                    step="0.01"
                    required
                    disabled={mode === "THEORETICAL"}
                    value={change?.price_per_kg ?? r.theoretical_price_cents_per_kg / 100}
                    onChange={(e) => update(r.ingredient_id, "price_per_kg", e.target.value)}
                  />
                </td>
                <td>{calculated ? money(calculated.actual_charge) : "—"}</td>
                <td>{calculated ? money(calculated.difference) : "—"}</td>
              </tr>
            );
          })}
        </Table>
        {mode === "ACTUAL" && (
          <button type="button" onClick={() => setChanges([])}>
            Restablecer al teórico
          </button>
        )}
        <p>
          Servicio: {money(theoretical.service_cents)} · S/250 por tonelada encargada (
          {kg(line.planned_weight_grams)} kg). Se conserva aunque cambien los sacos obtenidos.
        </p>
        <p role="status">
          Teórico: {money(theoretical.theoretical_cents)} · Real:{" "}
          {snapshot ? money(snapshot.actual_cents) : "—"} · Diferencia:{" "}
          {snapshot ? money(snapshot.difference_cents) : "—"}
        </p>
        <p>Esta conciliación no genera gastos ni pagos. El costo final del producto sigue pendiente.</p>
        <Input label="Motivo" value={reason} onChange={setReason} required />
        {error && <p role="alert">{error}</p>}
      </fieldset>
      {attempted && (
        <div role="status">
          <p>Reintente la misma solicitud si perdió la respuesta; se conserva una sola versión.</p>
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              frozen.current = null;
              requests.reset();
              setRevision(s.revision);
              setAttempted(false);
            }}
          >
            Preparar otro intento con datos actuales
          </button>
        </div>
      )}
      <Footer
        busy={busy}
        close={close}
        disabled={!attempted && (!!error || !reason.trim())}
        label={attempted ? "Reintentar conciliación" : "Guardar conciliación del molino"}
      />
    </form>
  );
}
