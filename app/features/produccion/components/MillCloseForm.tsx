import { useRef, useState } from "react";
import type { FormProps } from "@/shared/types/forms";
import { Input, kg, num } from "@/shared/ui";
import { Footer } from "@/shared/ui/FormFooter";
import { createCommandRequest } from "@/lib/command-request.mjs";
import { journeySummary } from "../domain/journey-view.mjs";

export function MillCloseForm({ s, record, submit, close, busy }: FormProps) {
  const line = s.productionJourneyLines.find((l) => l.id === record?.id);
  const journey = s.productionJourneys.find((j) => j.id === line?.journey_id);
  const summary = journey && journeySummary(s, journey).lines.find((l) => l.id === line?.id);
  const [bags, setBags] = useState("");
  const [day, setDay] = useState("");
  const [complete, setComplete] = useState(false);
  const [consent, setConsent] = useState(false);
  const [attempted, setAttempted] = useState(false);
  const [revision, setRevision] = useState(s.revision);
  const [requests] = useState(createCommandRequest);
  const frozen = useRef<object | null>(null);
  if (!line || !summary) return <p role="alert">El lote no está disponible. Recargue los datos.</p>;
  if (summary.closure)
    return <p role="status">Este lote ya está cerrado. Los sacos ingresaron una sola vez.</p>;
  const mismatch = summary.links.some((l) => l.formula_id !== line.micro_formula_id);
  const valid =
    /^\d+$/.test(bags) &&
    Number.isSafeInteger(Number(bags)) &&
    Number(bags) <= Math.floor(line.planned_weight_grams / 25000) &&
    (Number(bags) > 0 || line.planned_weight_grams < 25000);
  const ready = summary.confirmed_hundredths === line.nuclei_hundredths;
  return (
    <form
      aria-label="Cerrar lote del molino"
      aria-busy={busy}
      onSubmit={async (e) => {
        e.preventDefault();
        const payload = frozen.current ?? {
          line_id: line.id,
          date: day,
          actual_bags: Number(bags),
          lot_complete: complete,
          formula_consent: consent,
          expected_revision: revision,
        };
        const id = requests.begin(JSON.stringify(payload));
        if (!id) return;
        frozen.current = payload;
        setAttempted(true);
        try {
          if (await submit("MILL_CLOSE", payload, id)) close();
        } finally {
          requests.finish();
        }
      }}
    >
      <h2>{line.product_name}</h2>
      <p>
        Registre el total informado por el personal del molino al terminar este producto. El cierre es
        definitivo.
      </p>
      <p>
        Planificados: {num(line.nuclei_hundredths / 100)} núcleos · Vinculados:{" "}
        {num(summary.confirmed_hundredths / 100)} · Rendimiento teórico:{" "}
        {num(line.planned_weight_grams / 25000)} sacos de 25 kg.
      </p>
      {!ready && <p role="alert">Vincule todos los núcleos del lote antes de cerrar.</p>}
      <fieldset disabled={busy || attempted}>
        <Input label="Fecha de cierre" type="date" value={day} onChange={setDay} required />
        <Input label="Sacos completos reales" value={bags} onChange={setBags} inputMode="numeric" required />
        {bags && !valid && (
          <p role="alert">
            Ingrese sacos enteros dentro del rendimiento previsto. Cero solo se admite si el plan no alcanza
            un saco.
          </p>
        )}
        {valid && (
          <p role="status">
            Rendimiento real: {bags} sacos · Merma equivalente estimada:{" "}
            {kg(line.planned_weight_grams - Number(bags) * 25000)} kg. No representa un pesaje del sobrante.
          </p>
        )}
        <p>
          Los sacos incompletos quedan fuera del inventario comercial. El molino conserva los sacos completos
          como almacén. Costo definitivo: pendiente.
        </p>
        {mismatch && (
          <div role="note">
            <p>
              La microfórmula prevista difiere de las confirmaciones efectivas. Se conservan ambas versiones y
              los consumos y costos originales.
            </p>
            <p>
              Prevista: v{s.microFormulas.find((f) => f.id === line.micro_formula_id)?.version}. Efectivas:{" "}
              {summary.links
                .map(
                  (l) =>
                    `v${s.microFormulas.find((f) => f.id === l.formula_id)?.version} (${num(l.nuclei_hundredths / 100)} núcleos)`,
                )
                .join("; ")}
              .
            </p>
            <label>
              <input
                type="checkbox"
                checked={consent}
                onChange={(e) => setConsent(e.target.checked)}
                required
              />{" "}
              Confirmo la diferencia de microfórmulas para este cierre
            </label>
          </div>
        )}
        <label>
          <input
            type="checkbox"
            checked={complete}
            onChange={(e) => setComplete(e.target.checked)}
            required
          />{" "}
          El molino terminó la totalidad de este lote-producto
        </label>
      </fieldset>
      {attempted && (
        <div role="status">
          <p>Si perdió la respuesta, reintente la misma solicitud. No se duplicará el ingreso.</p>
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
        label={attempted ? "Reintentar cierre" : "Cerrar lote e ingresar sacos"}
        disabled={!attempted && (!valid || !day || !complete || (mismatch && !consent) || !ready)}
      />
    </form>
  );
}
