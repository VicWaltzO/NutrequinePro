import JourneysView from "./JourneysView";
import type { AppState, OpenModal } from "@/lib/domain-types";
import { SubtabContent } from "@/shared/ui/SubtabContent";
import { SortableTable, money } from "@/shared/ui";
import MacroFormulaList from "./MacroFormulaList";
import type { ReactNode } from "react";
import type { Searchable } from "@/shared/types/admin";
export default function ProductionsView({
  s: state,
  tab,
  admin,
  write,
  open,
  match,
  filters,
  productionList,
  filter = "",
  tabs,
}: {
  s: AppState;
  tab: string;
  admin: boolean;
  write: boolean;
  open: OpenModal;
  match: (record: Searchable) => boolean;
  filters: ReactNode;
  productionList: ReactNode;
  filter?: string;
  tabs: (options: [string, string][]) => ReactNode;
}) {
  return (
    <>
      {tabs([
        ["all", "Historial"],
        ["journeys", "Jornadas"],
        ["draft", "Lotes a producir"],
        ["ingredients", "Insumos"],
        ["formulas", "Fórmulas"],
      ])}
      {filters}
      <SubtabContent tab={tab} order={["all", "draft", "journeys", "ingredients", "formulas"]}>
        <section className="panel flush">
          {tab === "journeys" ? (
            <JourneysView s={state} write={write} open={open} match={match} filter={filter} />
          ) : tab === "ingredients" ? (
            <SortableTable
              heads={["Insumo", "Precio actual S/ por kg", "Estado", ""]}
              rows={state.ingredients.filter(match)}
              values={[(x) => x.name, (x) => x.current_price_per_kg, (x) => x.is_active, null]}
              tie={(x) => [x.name, x.id]}
            >
              {(x) => (
                <tr key={x.id}>
                  <td>{x.name}</td>
                  <td>{money(x.current_price_per_kg)}</td>
                  <td>{x.is_active ? "Activo" : "Inactivo"}</td>
                  <td>{admin && <button onClick={() => open("ingredient", x)}>Editar</button>}</td>
                </tr>
              )}
            </SortableTable>
          ) : tab === "formulas" ? (
            <MacroFormulaList state={state} write={write} open={open} />
          ) : (
            productionList
          )}
        </section>
      </SubtabContent>
    </>
  );
}
