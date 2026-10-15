import { useState } from "react";
import type { SaleFields, SaleLine, FormProps } from "@/shared/types/forms";
import type { SaleItem } from "@/lib/domain-types";
import { saleSummary } from "../domain/summary.mjs";
import { normalize } from "@/shared/domain/core.mjs";
import { saleFormPreview } from "./sale-form-preview";
import { day } from "@/shared/lib/format";
import { find } from "@/shared/lib/find";

export function useSaleFormState({ s: state, record, kind }: Pick<FormProps, "s" | "record" | "kind">) {
  const old: SaleItem[] = record?.id ? saleSummary(state, { id: record.id }).items : [];
  const edit = kind === "correct";
  const [values, setValues] = useState<SaleFields>({
    sale_date: record?.sale_date ?? day(),
    customer_id: record?.customer_id ?? "",
    site_id: record?.site_id ?? "",
    payment_condition: record?.payment_condition ?? state.config.default_payment_condition ?? "CREDIT",
    notes: record?.notes ?? "",
    mode: "immediate",
    payment_method: state.config.default_payment_method ?? "",
    reference: "",
    reason: "",
    production_id: "",
    id: record?.id,
  });
  const set = (k: string, x: string | boolean) => setValues((a) => ({ ...a, [k]: x }));
  const [rows, setRows] = useState<SaleLine[]>(
    old.length
      ? old.map((x) => ({
          original_item_id: x.id,
          product_id: x.product_id,
          quantity: x.quantity,
          unit_weight_kg: x.unit_weight_kg / 1000,
          unit_price: x.unit_price / 100,
        }))
      : [{ product_id: "", quantity: 1, unit_weight_kg: "", unit_price: "" }],
  );
  const [paidAmount, setPaidAmount] = useState<string | null>(null);
  const [quick, setQuick] = useState("");
  const [newName, setNewName] = useState("");
  const [duplicate, setDuplicate] = useState(false);
  const update = (i: number, k: keyof SaleLine, x: string) =>
    setRows((a) =>
      a.map((r, j) => {
        if (i !== j) return r;
        const n = { ...r, [k]: x };
        if (k === "product_id") {
          const p = find(state, "products", x);
          n.unit_price = (p?.default_sale_price ?? 0) / 100;
          n.unit_weight_kg = (p?.standard_bag_weight_kg ?? 0) / 1000;
        }
        return n;
      }),
    );
  const { missing, total } = saleFormPreview(
    state,
    rows,
    old,
    edit && record?.fulfillment_status === "DELIVERED",
  );
  const dup = state.customers.some((x) => normalize(x.name) === normalize(newName));
  const paid = paidAmount === null ? total : Math.round(Number(paidAmount || 0) * 100);
  return {
    edit,
    v: values,
    set,
    rows,
    setRows,
    paidAmount,
    setPaidAmount,
    quick,
    setQuick,
    newName,
    setNewName,
    duplicate,
    setDuplicate,
    update,
    missing,
    total,
    dup,
    paid,
  };
}
