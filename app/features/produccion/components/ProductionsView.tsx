import type { AppState, OpenModal } from "@/lib/domain-types";
import { SubtabContent } from "@/shared/ui/SubtabContent";
import { SortableTable, money, kg, find } from "@/shared/ui";
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
  tabs: (options: [string, string][]) => ReactNode;
}) {
  return (
    <>
      {tabs([
        ["all", "Historial"],
        ["draft", "Lotes a producir"],
        ["ingredients", "Insumos"],
        ["formulas", "Fórmulas"],
      ])}
      {filters}
      <SubtabContent tab={tab} order={["all", "draft", "ingredients", "formulas"]}>
        <section className="panel flush">
          {tab === "ingredients" ? (
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
            <div className="formula-list">
              {state.formulas
                .slice()
                .reverse()
                .map((f) => {
                  const rows = state.formulaIngredients.filter((x) => x.formula_id === f.id);
                  return (
                    <details key={f.id} open={f.is_active}>
                      <summary>
                        {find(state, "products", f.product_id)?.name} · v{f.version} ·{" "}
                        {f.is_active ? "Activa" : "Histórica"} · desde {f.valid_from}
                      </summary>
                      <SortableTable
                        heads={["Insumo", "Kg / núcleo"]}
                        rows={rows}
                        values={[
                          (x) => find(state, "ingredients", x.ingredient_id)?.name,
                          (x) => x.kg_per_nucleus,
                        ]}
                        tie={(x) => [find(state, "ingredients", x.ingredient_id)?.name, x.id]}
                      >
                        {(x) => (
                          <tr key={x.id}>
                            <td>{find(state, "ingredients", x.ingredient_id)?.name}</td>
                            <td>{kg(x.kg_per_nucleus)}</td>
                          </tr>
                        )}
                      </SortableTable>
                      {write && f.is_active && (
                        <button className="formula-edit" onClick={() => open("formula", f)}>
                          Editar fórmula
                        </button>
                      )}
                      <p className="formula-total">
                        Total fórmula: {kg(rows.reduce((n: number, x) => n + x.kg_per_nucleus, 0))} kg · Peso
                        comercial:{" "}
                        {kg(find(state, "products", f.product_id)?.commercial_weight_per_nucleus_kg)} kg
                      </p>
                    </details>
                  );
                })}
            </div>
          ) : (
            productionList
          )}
        </section>
      </SubtabContent>
    </>
  );
}
