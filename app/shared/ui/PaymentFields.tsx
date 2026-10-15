import { Input } from "@/shared/ui/Input";
import { Select } from "@/shared/ui/Select";
export function PaymentFields({
  v,
  set,
}: {
  v: { payment_method: string; other_method?: string; reference: string };
  set: (k: string, v: string) => void;
}) {
  return (
    <>
      <Select
        label="Método de pago"
        required
        value={v.payment_method}
        onChange={(x) => set("payment_method", x)}
        options={["CASH", "TRANSFER", "CHECK", "OTHER"]}
      />
      {v.payment_method === "OTHER" && (
        <Input label="Otro método" required value={v.other_method} onChange={(x) => set("other_method", x)} />
      )}
      <Input label="Referencia (opcional)" value={v.reference} onChange={(x) => set("reference", x)} />
    </>
  );
}
