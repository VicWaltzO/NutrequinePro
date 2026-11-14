import { useRef, useState } from "react";
import { CalendarDays, Package } from "lucide-react";
import { createCommandRequest } from "@/lib/command-request.mjs";
import type { FormProps } from "@/shared/types/forms";
import { Input, Select } from "@/shared/ui";
import { Footer } from "@/shared/ui/FormFooter";
import { FormSection } from "@/shared/ui/FormSection";
import { journeyFamily } from "../domain/journey-view.mjs";
import { orderNominal } from "@/shared/lib/nominal-order.mjs";

export function JourneyForm({ s, record, submit, close, busy, kind }: FormProps) {
  const [day, setDay] = useState("");
  const [notes, setNotes] = useState("");
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [preparation, setPreparation] = useState("");
  const [nuclei, setNuclei] = useState("");
  const [revision, setRevision] = useState(s.revision);
  const [attempted, setAttempted] = useState(false);
  const [requests] = useState(createCommandRequest);
  const frozenPayload = useRef<object | null>(null);
  const linking = kind === "link";
  const line = s.productionJourneyLines.find((l) => l.id === record?.id);
  const products = orderNominal(
    s.products.filter((p) => p.is_active && journeyFamily(p)),
    (p) => p.name,
    (p) => p.id,
  );
  const available = s.microConfirmations
    .filter((c) => {
      const prep = s.microPreparations.find((p) => p.id === c.preparation_id);
      const used = s.productionJourneyLinks
        .filter((l) => l.preparation_id === c.preparation_id)
        .reduce((n, l) => n + l.nuclei_hundredths, 0);
      return prep?.family === line?.family && c.nuclei_hundredths > used;
    })
    .map((c) => ({
      id: c.preparation_id,
      name: `${c.date} · ${c.preparation_id} · ${c.nuclei_hundredths / 100} confirmados · micro v${s.microFormulas.find((f) => f.id === c.formula_id)?.version}`,
    }));
  return (
    <form
      className="journey-form"
      aria-label={linking ? "Vincular preparación a producto" : "Planificar jornada"}
      aria-busy={busy}
      onSubmit={async (e) => {
        e.preventDefault();
        const payload = linking
          ? { line_id: line?.id, preparation_id: preparation, nuclei, expected_revision: revision }
          : {
              date: day,
              notes,
              expected_revision: revision,
              lines: products
                .filter((p) => quantities[p.id] && quantities[p.id] !== "0")
                .map((p) => ({
                  product_id: p.id,
                  nuclei: quantities[p.id],
                  formula_id: s.formulas.find((f) => f.product_id === p.id && f.is_active)?.id,
                  micro_formula_id: s.microFormulaHeads.find((h) => h.family === journeyFamily(p))
                    ?.active_formula_id,
                })),
            };
        const requestPayload = attempted && frozenPayload.current ? frozenPayload.current : payload;
        frozenPayload.current = requestPayload;
        const id = requests.begin(JSON.stringify(requestPayload));
        if (!id) return;
        setAttempted(true);
        try {
          if (await submit(linking ? "JOURNEY_LINK" : "JOURNEY_CREATE", requestPayload, id)) close();
        } finally {
          requests.finish();
        }
      }}
    >
      <fieldset disabled={busy || attempted}>
        {linking ? (
          <FormSection title={line?.product_name ?? "Producto"} icon={Package}>
            <p>
              Seleccione una preparación confirmada y la cantidad que corresponde a este producto. Conserva
              los consumos y costos originales.
            </p>
            {!available.length && (
              <p role="status">
                No hay preparaciones confirmadas disponibles para este producto. Confirme los núcleos en
                Inventario antes de vincularlos.
              </p>
            )}
            <Select
              label="Preparación confirmada"
              value={preparation}
              onChange={setPreparation}
              options={available}
              order="nominal"
              required
            />
            <Input
              label="Núcleos a vincular"
              value={nuclei}
              onChange={setNuclei}
              inputMode="decimal"
              required
            />
          </FormSection>
        ) : (
          <>
            <FormSection title="Jornada" icon={CalendarDays}>
              <Input label="Fecha de jornada" type="date" value={day} onChange={setDay} required />
              <Input label="Notas" value={notes} onChange={setNotes} />
            </FormSection>
            <FormSection title="Productos a fabricar" icon={Package} accent>
              <p>
                Indique los núcleos de cada producto. Deje vacío el que no se fabricará. Las fórmulas activas
                se conservan con esta orden.
              </p>
              {products.map((p) => (
                <Input
                  key={p.id}
                  label={`Núcleos de ${p.name}`}
                  value={quantities[p.id] ?? ""}
                  onChange={(v) => setQuantities((q) => ({ ...q, [p.id]: v }))}
                  inputMode="decimal"
                />
              ))}
              <p>Planificar no consume insumos ni ingresa sacos al inventario.</p>
            </FormSection>
          </>
        )}
      </fieldset>
      {attempted && (
        <div role="status">
          <p>
            Puede reintentar la misma solicitud si perdió la respuesta. Para cambiar datos, recargue y prepare
            otro intento.
          </p>
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              setRevision(s.revision);
              setAttempted(false);
              requests.reset();
            }}
          >
            Preparar otro intento con datos actuales
          </button>
        </div>
      )}
      <Footer
        busy={busy}
        close={close}
        label={attempted ? "Reintentar solicitud" : linking ? "Vincular núcleos" : "Guardar jornada"}
        disabled={!attempted && linking && !available.length}
      />
    </form>
  );
}
