"use client";
import type { AppState } from "@/lib/domain-types";
import { Badge } from "@/shared/ui";
import { Table } from "@/shared/ui";
import { Empty } from "@/shared/ui";
import { money } from "@/shared/ui";
import { label } from "@/shared/ui";
import { find } from "@/shared/ui";
import type { OpenModal } from "@/lib/domain-types";
import type { ReactNode } from "react";
import type { Searchable } from "@/shared/types/admin";
export default function ExpensesView({
  s,
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
        <Table heads={["Fecha", "Categoría", "Descripción", "Monto", "Relación", "Estado", ""]}>
          {s.expenses
            .filter(match)
            .slice()
            .reverse()
            .map((x) => (
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
                    ? "Costo de " + find(s, "productions", x.production_id)?.code
                    : (find(s, "sales", x.sale_id)?.code ?? find(s, "sites", x.site_id)?.name ?? "General")}
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
            ))}
        </Table>
        {!s.expenses.length && <Empty />}
      </section>
    </>
  );
}
