"use client";
import type { AppState } from "@/lib/domain-types";
import { stamp } from "@/shared/lib/format";
import { find } from "@/shared/lib/find";
import { Table } from "@/shared/ui/Table";
export function History({ s, type, id }: { s: AppState; type: string; id: string }) {
  const rows = s.corrections.filter((x) => x.entity_type === type && x.entity_id === id);
  return rows.length > 0 ? (
    <section className="panel">
      <h3>Rectificaciones y valores anteriores</h3>
      {rows.map((x) => (
        <details key={x.id}>
          <summary>
            {x.code} · {x.reason} · {stamp(x.created_at)}
          </summary>
          <p>{find(s, "users", x.created_by)?.name ?? x.created_by}</p>
          <Table heads={["Campo", "Valor anterior", "Valor nuevo"]}>
            {s.correctionFields
              .filter((f) => f.correction_id === x.id)
              .map((f) => (
                <tr key={f.id}>
                  <td>{f.field_name}</td>
                  <td>
                    <pre>{f.old_value}</pre>
                  </td>
                  <td>
                    <pre>{f.new_value}</pre>
                  </td>
                </tr>
              ))}
          </Table>
        </details>
      ))}
    </section>
  ) : null;
}
