import { useState } from "react";
import { recordId } from "@/lib/domain-types";
import type { NumericInput } from "@/lib/domain-types";
import type { EditableCost, FormProps } from "@/shared/types/forms";
import { productionSummary } from "@/lib/domain-preview.mjs";
import { Input, Table, find } from "@/shared/ui";
import { Footer } from "@/shared/ui/FormFooter";

export function ProductionCorrectionForm({ s: state, record, submit, close, busy }: FormProps) {
  const id = recordId(record);
  const a = productionSummary(state, { id });
  const [products, setProducts] = useState<{ product_id: string; nuclei_count: NumericInput }[]>(
    a.products.map((x) => ({ product_id: x.product_id, nuclei_count: x.nuclei_count })),
  );
  const [costs, setCosts] = useState<EditableCost[]>(
    a.costs.map((x) => ({ id: x.id, description: x.description, amount: x.amount / 100 })),
  );
  const [reason, setReason] = useState("");
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        await submit("PRODUCTION_CORRECT_QUANTITIES", { id, products, costs, reason });
      }}
    >
      <p className="notice">
        La rectificación usa las fórmulas y precios históricos. Ajusta stock y consumo con movimientos
        compensatorios. Los cobros reales de insumos se conservan; los costos adicionales deben confirmarse
        explícitamente abajo.
      </p>
      <Table heads={["Producto", "Núcleos originales", "Núcleos corregidos"]}>
        {products.map((x, i) => (
          <tr key={x.product_id}>
            <td>{find(state, "products", x.product_id)?.name}</td>
            <td>{a.products[i].nuclei_count}</td>
            <td>
              <input
                aria-label={"Núcleos corregidos " + find(state, "products", x.product_id)?.name}
                required
                type="number"
                min="0"
                step="1"
                value={x.nuclei_count}
                onChange={(e) =>
                  setProducts((r) => r.map((v, j) => (i === j ? { ...v, nuclei_count: e.target.value } : v)))
                }
              />
            </td>
          </tr>
        ))}
      </Table>
      <h3>Importes de costos adicionales</h3>
      {costs.map((x, i) => (
        <Input
          key={x.id}
          label={x.description + " S/"}
          type="number"
          min="0"
          step="0.01"
          required
          value={x.amount}
          onChange={(v) => setCosts((r) => r.map((c, j) => (i === j ? { ...c, amount: v } : c)))}
        />
      ))}
      <Input label="Motivo obligatorio" required value={reason} onChange={setReason} />
      <Footer busy={busy} close={close} label="Registrar rectificación" />
    </form>
  );
}
