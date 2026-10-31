import { useState, type ReactNode } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { nextSort, sortRows, type SortSelection, type SortValue } from "../lib/table-sort";

type Props<T> = {
  heads: string[];
  rows: readonly T[] | undefined;
  values: readonly (((row: T, originalIndex: number) => SortValue) | null)[];
  tie: (row: T, originalIndex: number) => SortValue;
  children: (row: T, originalIndex: number) => ReactNode;
  context?: string;
};

export function SortableTable<T>(props: Props<T>) {
  return <SortedTable key={(props.context ?? "") + ":" + props.heads.join("|")} {...props} />;
}

function SortedTable<T>({ heads, rows, values, tie, children, context = "" }: Props<T>) {
  const [stored, setStored] = useState<{ context: string; selection: SortSelection }>({
    context,
    selection: null,
  });
  const selection = stored.context === context ? stored.selection : null;
  const shown = sortRows(rows ?? [], selection ? values[selection.column] : null, selection, tie);
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            {heads.map((head, column) => {
              const active = selection?.column === column;
              const direction = active ? selection.direction : null;
              const Icon = direction === "asc" ? ArrowUp : direction === "desc" ? ArrowDown : ArrowUpDown;
              const action =
                direction === "asc"
                  ? "Ordenar descendente"
                  : direction === "desc"
                    ? "Restablecer orden inicial"
                    : "Ordenar ascendente";
              return (
                <th
                  key={column}
                  scope="col"
                  aria-sort={
                    direction === "asc" ? "ascending" : direction === "desc" ? "descending" : undefined
                  }
                >
                  {values[column] ? (
                    <button
                      type="button"
                      className="table-sort"
                      aria-label={`${head}: ${action}`}
                      onClick={() => setStored({ context, selection: nextSort(selection, column) })}
                    >
                      <span>{head}</span>
                      <Icon size={14} aria-hidden="true" />
                    </button>
                  ) : (
                    head
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>{shown.map(({ row, originalIndex }) => children(row, originalIndex))}</tbody>
      </table>
    </div>
  );
}
