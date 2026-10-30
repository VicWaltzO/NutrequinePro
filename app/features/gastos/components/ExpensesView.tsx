import type { AppState, OpenModal } from "@/lib/domain-types";
import { Badge, SortableTable, Empty, money, label, find } from "@/shared/ui";
import type { ReactNode } from "react";
import type { Searchable } from "@/shared/types/admin";
export default function ExpensesView({
  s: state,
  admin,
  open,
  match,
  filters,
}: {
  s: AppState;
  admin: boolean;
  open: OpenModal;
  match: (record: Searchable) => boolean;
  filters: ReactNode;
}) {
  return (
    <>
      {filters}
      <section className="panel flush">
        <SortableTable
          heads={["Fecha", "Categoría", "Descripción", "Monto", "Relación", "Estado", ""]}
          rows={state.expenses.filter(match).slice().reverse()}
          values={[
            (x) => x.date,
            (x) => label(x.category),
            (x) => [x.description, x.notes],
            (x) => x.amount,
            (x) =>
              x.production_cost_id
                ? "Costo de " + find(state, "productions", x.production_id)?.code
                : (find(state, "sales", x.sale_id)?.code ??
                  find(state, "sites", x.site_id)?.name ??
                  "General"),
            (x) => label(x.status),
            null,
          ]}
          tie={(x) => [x.date, x.description, x.id]}
        >
          {(x) => (
            <tr key={x.id}>
              <td>{x.date}</td>
              <td>{label(x.category)}</td>
              <td>
                {x.description}
                <small>{x.notes}</small>
              </td>
              <td>{money(x.amount)}</td>
              <td>
                {x.production_cost_id
                  ? "Costo de " + find(state, "productions", x.production_id)?.code
                  : (find(state, "sales", x.sale_id)?.code ??
                    find(state, "sites", x.site_id)?.name ??
                    "General")}
              </td>
              <td>
                <Badge value={x.status} />
              </td>
              <td>
                {admin && x.status !== "CANCELLED" && (
                  <button
                    className="danger"
                    onClick={() => open("reason", { ...x, _operation: "EXPENSE_CANCEL" }, "reason")}
                  >
                    Anular
                  </button>
                )}
              </td>
            </tr>
          )}
        </SortableTable>
        {!state.expenses.length && <Empty />}
      </section>
    </>
  );
}
