import { useRef, useState } from "react";
import type { FormProps } from "@/shared/types/forms";
import { Input, money } from "@/shared/ui";
import { Footer } from "@/shared/ui/FormFooter";
import { createCommandRequest } from "@/lib/command-request.mjs";
import { millCostHistory, millCostInputSnapshot } from "../domain/mill-cost.mjs";

export function MillCostForm({ s, record, submit, close, busy }: FormProps) {
  const line = s.productionJourneyLines.find((l) => l.id === record?.id);
  const previous = line && millCostHistory(s, line.id).at(-1)?.new_snapshot;
  const [packaging, setPackaging] = useState(previous ? (previous.packaging_cents / 100).toFixed(2) : "");
  const [reference, setReference] = useState(previous?.packaging_reference ?? "");
  const [extras, setExtras] = useState(
    previous?.extras.map((row) => ({
      amount: (row.amount_cents / 100).toFixed(2),
      description: row.description,
      reference: row.reference,
    })) ?? [],
  );
  const [reviewed, setReviewed] = useState(false);
  const [reason, setReason] = useState("");
  const [revision, setRevision] = useState(s.revision);
  const [attempted, setAttempted] = useState(false);
  const [requests] = useState(createCommandRequest);
  const frozen = useRef<object | null>(null);
  if (!line) return <p role="alert">El lote no está disponible. Recargue los datos.</p>;
  const payload = {
    line_id: line.id,
    packaging_amount: packaging,
    packaging_reference: reference,
    extras,
    reviewed_costs: reviewed,
    reason,
    expected_revision: revision,
  };
  let error = "";
  try {
    millCostInputSnapshot(payload);
  } catch (e) {
    error = e instanceof Error ? e.message : "Revise los importes.";
  }
  return (
    <form
      aria-label="Costos documentados por producto"
      aria-busy={busy}
      onSubmit={async (e) => {
        e.preventDefault();
        const value = frozen.current ?? payload;
        const id = requests.begin(JSON.stringify(value));
        if (!id) return;
        frozen.current = value;
        setAttempted(true);
        try {
          if (await submit("MILL_COST_INPUT", value, id)) close();
        } finally {
          requests.finish();
        }
      }}
    >
      <h2>{line.product_name}</h2>
      <p>
        Registre el total documentado de esta línea. Estos importes reemplazan su versión anterior; no crean
        gastos ni pagos.
      </p>
      <fieldset disabled={busy || attempted}>
        <legend>Envases efectivamente consumidos</legend>
        <Input
          label="Total de envases S/"
          type="number"
          min="0"
          step="0.01"
          value={packaging}
          onChange={setPackaging}
          required
        />
        <Input
          label="Referencia de envases o confirmación de costo cero"
          value={reference}
          onChange={setReference}
          required
        />
        <p>
          Use el costo de los envases realmente consumidos, incluidos los perdidos. Si no corresponde,
          confirme 0 con su referencia; un importe faltante no equivale a cero.
        </p>
        <h3>Otros costos directos</h3>
        <p>Excluya microinsumos, macroinsumos y servicio ya incluidos. Mantenga el flete separado.</p>
        {extras.map((row, index) => (
          <div className="journey-reference" key={index}>
            <Input
              label={`Descripción del costo ${index + 1}`}
              value={row.description}
              onChange={(value) =>
                setExtras((rows) => rows.map((r, i) => (i === index ? { ...r, description: value } : r)))
              }
              required
            />
            <Input
              label={`Importe del costo ${index + 1} S/`}
              type="number"
              min="0.01"
              step="0.01"
              value={row.amount}
              onChange={(value) =>
                setExtras((rows) => rows.map((r, i) => (i === index ? { ...r, amount: value } : r)))
              }
              required
            />
            <Input
              label={`Referencia del costo ${index + 1}`}
              value={row.reference}
              onChange={(value) =>
                setExtras((rows) => rows.map((r, i) => (i === index ? { ...r, reference: value } : r)))
              }
              required
            />
            <button type="button" onClick={() => setExtras((rows) => rows.filter((_, i) => i !== index))}>
              Quitar costo {index + 1}
            </button>
          </div>
        ))}
        <button
          type="button"
          disabled={extras.length >= 20}
          onClick={() => setExtras((rows) => [...rows, { amount: "", description: "", reference: "" }])}
        >
          Agregar costo directo
        </button>
        {!extras.length && <p>Sin otros costos directos: al confirmar la revisión se registra {money(0)}.</p>}
        <label>
          <input
            type="checkbox"
            checked={reviewed}
            onChange={(e) => setReviewed(e.target.checked)}
            required
          />{" "}
          Revisé los comprobantes: estos costos corresponden solo a este producto, no duplican componentes
          incluidos y no contienen flete.
        </label>
        <Input label="Motivo del registro" value={reason} onChange={setReason} required />
      </fieldset>
      {error && <p role="status">{error}</p>}
      {attempted && (
        <div role="status">
          <p>Si perdió la respuesta, reintente la misma solicitud.</p>
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
        label={attempted ? "Reintentar costos documentados" : "Guardar costos documentados"}
      />
    </form>
  );
}
