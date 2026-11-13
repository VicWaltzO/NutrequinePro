import { useEffect, useRef, useState } from "react";
import type { AppState, Submit, MicroFamily, MicroFormula } from "@/lib/domain-types";
import { Input, Select, weight } from "@/shared/ui";
import { orderNominal } from "@/shared/lib/nominal-order.mjs";
const families: { id: MicroFamily; label: string; products: string }[] = [
  { id: "ROSADO", label: "Rosado", products: "Potripregnant" },
  { id: "VERDE_AMARILLO", label: "Verde / Amarillo", products: "Hi-Performance y Nutrelin Adulto" },
];
const kg = (grams: number) => String(grams / 1000);
type Line = { micro_ingredient_id: string; dose_kg: string };
export default function MicroFormulas({
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
  const [editing, setEditing] = useState<MicroFamily | null>(null);
  const [expected, setExpected] = useState(0);
  const [lines, setLines] = useState<Line[]>([]);
  const [notes, setNotes] = useState("");
  const form = useRef<HTMLFormElement>(null);
  const trigger = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    if (editing) form.current?.querySelector<HTMLElement>("select, input, button")?.focus();
    else trigger.current?.focus();
  }, [editing]);
  const start = (family: MicroFamily, button: HTMLButtonElement, source?: MicroFormula) => {
    trigger.current = button;
    setEditing(family);
    setExpected(s.microFormulaHeads.find((h) => h.family === family)?.version ?? 0);
    setLines(
      source
        ? s.microFormulaLines
            .filter((l) => l.formula_id === source.id)
            .map((l) => ({ micro_ingredient_id: l.micro_ingredient_id, dose_kg: kg(l.dose_grams) }))
        : [],
    );
    setNotes("");
  };
  const detail = (f: MicroFormula) => (
    <div className="micro-formula-detail">
      <p>
        Versión {f.version} · {f.published_at ? "Publicada" : "Borrador"} · {f.created_at}
        {" · "}
        {s.users.find((u) => u.id === f.created_by)?.name ?? f.created_by}
      </p>
      <ul>
        {s.microFormulaLines
          .filter((l) => l.formula_id === f.id)
          .map((l) => (
            <li key={l.id}>
              ID {l.operational_id_snapshot} · {l.name_snapshot}:{" "}
              <strong>{weight(l.dose_grams)}/núcleo</strong>
            </li>
          ))}
      </ul>
      <p>
        <strong>Total: {weight(f.total_grams)}/núcleo</strong>
      </p>
      {f.notes && <p>{f.notes}</p>}
    </div>
  );
  const options = orderNominal(
    s.microIngredients.filter((m) => m.is_active),
    (m) => m.name,
    (m) => m.id,
  );
  return (
    <section className="micro-formulas" aria-labelledby="micro-formulas-title">
      <h3 id="micro-formulas-title">Fórmulas de núcleos</h3>
      {families.map((family) => {
        const head = s.microFormulaHeads.find((h) => h.family === family.id);
        const active = s.microFormulas.find((f) => f.id === head?.active_formula_id);
        const history = s.microFormulas
          .filter((f) => f.family === family.id && f.published_at && f.id !== active?.id)
          .sort((a, b) => b.version - a.version);
        const drafts = s.microFormulas
          .filter((f) => f.family === family.id && !f.published_at)
          .sort((a, b) => b.version - a.version);
        return (
          <section key={family.id} className="micro-formula-family" aria-label={`Fórmula ${family.label}`}>
            <h4>{family.label}</h4>
            <p>{family.products}</p>
            {active ? (
              detail(active)
            ) : (
              <p>Sin fórmula activa. Registre los microinsumos y las dosis autorizadas antes de activar.</p>
            )}
            {admin && (
              <button
                type="button"
                disabled={busy || !!editing}
                onClick={(e) => start(family.id, e.currentTarget, active)}
              >
                Nueva versión {family.label}
              </button>
            )}
            <details>
              <summary>
                Historial {family.label} ({history.length})
              </summary>
              {history.length ? (
                history.map((f) => <div key={f.id}>{detail(f)}</div>)
              ) : (
                <p>Aún no hay versiones históricas.</p>
              )}
            </details>
            <details>
              <summary>
                Borradores {family.label} ({drafts.length})
              </summary>
              {drafts.map((f) => (
                <div key={f.id}>
                  {detail(f)}
                  {admin && (
                    <div className="form-actions">
                      <button
                        type="button"
                        disabled={busy || !!editing}
                        onClick={(e) => start(family.id, e.currentTarget, f)}
                      >
                        Crear versión desde borrador {f.version}
                      </button>
                      <button
                        type="button"
                        disabled={
                          busy ||
                          !!editing ||
                          f.total_grams === 0 ||
                          (!!active && f.version <= active.version)
                        }
                        onClick={() =>
                          run("MICRO_FORMULA_ACTIVATE", {
                            family: family.id,
                            formula_id: f.id,
                            expected_version: head?.version ?? 0,
                          })
                        }
                      >
                        Activar {family.label} versión {f.version}
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </details>
          </section>
        );
      })}
      {admin && editing && (
        <form
          ref={form}
          onSubmit={async (e) => {
            e.preventDefault();
            if (
              await run("MICRO_FORMULA_SAVE", { family: editing, expected_version: expected, lines, notes })
            )
              setEditing(null);
          }}
        >
          <h4>Nueva versión {families.find((f) => f.id === editing)?.label}</h4>
          <p>Guardar crea un borrador. Revise las dosis antes de activarlo.</p>
          {!options.length && <p>Debe registrar microinsumos activos antes de añadir dosis.</p>}
          {lines.map((line, index) => (
            <fieldset key={index} disabled={busy}>
              <legend>Microinsumo {index + 1}</legend>
              <Select
                label={`Microinsumo ${index + 1}`}
                value={line.micro_ingredient_id}
                onChange={(value) =>
                  setLines(lines.map((l, i) => (i === index ? { ...l, micro_ingredient_id: value } : l)))
                }
                options={options.map((m) => ({ id: m.id, name: `ID ${m.operational_id} · ${m.name}` }))}
                required
              />
              <Input
                label={`Dosis ${index + 1} (kg/núcleo)`}
                type="number"
                step="0.001"
                min="0.001"
                value={line.dose_kg}
                onChange={(value) =>
                  setLines(lines.map((l, i) => (i === index ? { ...l, dose_kg: value } : l)))
                }
                required
              />
              <button type="button" onClick={() => setLines(lines.filter((_, i) => i !== index))}>
                Retirar microinsumo {index + 1}
              </button>
            </fieldset>
          ))}
          <button
            type="button"
            disabled={busy || !options.length}
            onClick={() => setLines([...lines, { micro_ingredient_id: "", dose_kg: "" }])}
          >
            Añadir dosis
          </button>
          <Input label="Observación de la versión" value={notes} onChange={setNotes} />
          <div className="form-actions">
            <button type="button" disabled={busy} onClick={() => setEditing(null)}>
              Cancelar versión
            </button>
            <button disabled={busy}>Guardar borrador de fórmula</button>
          </div>
        </form>
      )}
    </section>
  );
}
