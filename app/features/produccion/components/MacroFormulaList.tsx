import type { AppState, OpenModal } from "@/lib/domain-types";
import { SortableTable, weight, find } from "@/shared/ui";

export default function MacroFormulaList({
  state,
  write,
  open,
}: {
  state: AppState;
  write: boolean;
  open: OpenModal;
}) {
  const formulas = state.formulas.slice().reverse();
  const active = formulas.filter((formula) => formula.is_active);
  const historical = formulas.filter((formula) => !formula.is_active);
  const renderFormula = (formula: AppState["formulas"][number]) => {
    const product = find(state, "products", formula.product_id);
    const rows = state.formulaIngredients.filter((row) => row.formula_id === formula.id);
    return (
      <details key={formula.id} open={formula.is_active}>
        <summary>
          {product?.name ?? "Producto no disponible"} · v{formula.version} ·{" "}
          {formula.is_active ? "Activa" : "Histórica"} · desde {formula.valid_from}
          {formula.valid_to ? ` · hasta ${formula.valid_to}` : ""}
        </summary>
        <SortableTable
          heads={["Insumo", "Peso / núcleo"]}
          rows={rows}
          values={[(row) => find(state, "ingredients", row.ingredient_id)?.name, (row) => row.kg_per_nucleus]}
          tie={(row) => [find(state, "ingredients", row.ingredient_id)?.name, row.id]}
        >
          {(row) => (
            <tr key={row.id}>
              <td>{find(state, "ingredients", row.ingredient_id)?.name ?? "Insumo no disponible"}</td>
              <td>{weight(row.kg_per_nucleus)}</td>
            </tr>
          )}
        </SortableTable>
        {rows.length === 0 && <p className="formula-total">Sin ingredientes registrados.</p>}
        {write && formula.is_active && (
          <button className="formula-edit" onClick={() => open("formula", formula)}>
            Editar fórmula
          </button>
        )}
        <p className="formula-total">
          Total fórmula: {weight(rows.reduce((total, row) => total + row.kg_per_nucleus, 0))} · Peso
          comercial: {weight(product?.commercial_weight_per_nucleus_kg)}
        </p>
      </details>
    );
  };
  return (
    <div className="formula-list">
      <section aria-label="Fórmulas macro activas">
        <h2>Fórmulas activas</h2>
        {active.length ? active.map(renderFormula) : <p>No hay fórmulas macro activas.</p>}
      </section>
      <details className="formula-history">
        <summary>Historial de fórmulas macro ({historical.length})</summary>
        <section aria-label="Historial de fórmulas macro">
          <p>Versiones anteriores · Solo lectura</p>
          {historical.length ? historical.map(renderFormula) : <p>No hay versiones históricas.</p>}
        </section>
      </details>
    </div>
  );
}
