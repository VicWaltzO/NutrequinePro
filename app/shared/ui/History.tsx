import type { AppState } from "@/lib/domain-types";
import { stamp } from "@/shared/lib/format";
import { find } from "@/shared/lib/find";
import { SortableTable } from "@/shared/ui/SortableTable";
export function History({ s: state, type, id }: { s: AppState; type: string; id: string }) {
  const rows = state.corrections.filter((x) => x.entity_type === type && x.entity_id === id);
  return rows.length > 0 ? (
    <section className="panel">
      <h3>Rectificaciones y valores anteriores</h3>
      {rows.map((x) => (
        <details key={x.id}>
          <summary>
            {x.code} · {x.reason} · {stamp(x.created_at)}
          </summary>
          <p>{find(state, "users", x.created_by)?.name ?? x.created_by}</p>
          <SortableTable
            heads={["Campo", "Valor anterior", "Valor nuevo"]}
            rows={state.correctionFields.filter((f) => f.correction_id === x.id)}
            values={[(f) => f.field_name, null, null]}
            tie={(f) => [f.field_name, f.id]}
          >
            {(f) => (
              <tr key={f.id}>
                <td>{f.field_name}</td>
                <td>
                  <pre>{f.old_value}</pre>
                </td>
                <td>
                  <pre>{f.new_value}</pre>
                </td>
              </tr>
            )}
          </SortableTable>
        </details>
      ))}
    </section>
  ) : null;
}
