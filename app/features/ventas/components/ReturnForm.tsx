import { useState } from "react";
import { recordId } from "@/lib/domain-types";
import type { ReturnValues, FormProps } from "@/shared/types/forms";
import { saleSummary } from "@/lib/domain-preview.mjs";
import { Input, Table, day, find } from "@/shared/ui";
import { Footer } from "@/shared/ui/FormFooter";

export function ReturnForm({ s: state, record, submit, close, busy }: FormProps) {
  const id = recordId(record);
  const a = saleSummary(state, { id });
  const [q, setQ] = useState<Record<string, string>>({});
  const [v, setV] = useState<ReturnValues>({
    return_date: day(),
    reason: "",
    economic_amount: "0",
    notes: "",
  });
  const set = (k: string, x: string | boolean) => setV((a) => ({ ...a, [k]: x }));
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        await submit("RETURN_CREATE", {
          ...v,
          sale_id: id,
          items: Object.entries(q)
            .filter(([, x]) => Number(x) > 0)
            .map(([sale_item_id, quantity]) => ({ sale_item_id, quantity })),
        });
      }}
    >
      <p className="notice">
        La devolución registra el retorno físico. La reducción económica se ingresa explícitamente; no se
        calcula como descuento automático.
      </p>
      <Input
        label="Fecha de devolución"
        type="date"
        value={v.return_date}
        onChange={(x) => set("return_date", x)}
      />
      <Table heads={["Producto", "Entregado", "Ya devuelto", "Devolver sacos"]}>
        {a.items.map((x) => {
          const returned = state.returnItems
            .filter((r) => r.sale_item_id === x.id)
            .reduce((n: number, r) => n + r.quantity, 0);
          return (
            <tr key={x.id}>
              <td>{find(state, "products", x.product_id)?.name}</td>
              <td>{x.quantity}</td>
              <td>{returned}</td>
              <td>
                <input
                  aria-label="Sacos a devolver"
                  type="number"
                  min="0"
                  step="1"
                  max={x.quantity - returned}
                  value={q[x.id] ?? 0}
                  onChange={(e) => setQ((a) => ({ ...a, [x.id]: e.target.value }))}
                />
              </td>
            </tr>
          );
        })}
      </Table>
      <Input
        label="Reducción económica S/ (0 si no aplica)"
        type="number"
        min="0"
        step="0.01"
        value={v.economic_amount}
        onChange={(x) => set("economic_amount", x)}
      />
      <Input label="Motivo de devolución" required value={v.reason} onChange={(x) => set("reason", x)} />
      <Footer busy={busy} close={close} label="Confirmar devolución" />
    </form>
  );
}
