"use client";
import { useState } from "react";
import type { SaleFields } from "@/shared/types/forms";
import type { SaleLine } from "@/shared/types/forms";
import { stock } from "@/lib/domain.mjs";
import { saleSummary } from "@/lib/domain.mjs";
import { normalize } from "@/lib/domain.mjs";
import { day } from "@/shared/ui";
import { find } from "@/shared/ui";
import type { FormProps } from "@/shared/types/forms";
export function useSaleFormState({ s, record, kind }: Pick<FormProps, "s" | "record" | "kind">) {
  const old = record?.id ? saleSummary(s, { id: record.id }).items : [],
    edit = kind === "correct";
  const [v, setV] = useState<SaleFields>({
    sale_date: record?.sale_date ?? day(),
    customer_id: record?.customer_id ?? "",
    site_id: record?.site_id ?? "",
    payment_condition: record?.payment_condition ?? s.config.default_payment_condition ?? "CREDIT",
    notes: record?.notes ?? "",
    mode: "immediate",
    payment_method: s.config.default_payment_method ?? "",
    reference: "",
    reason: "",
    production_id: "",
    id: record?.id,
  });
  const set = (k: string, x: string | boolean) => setV((a) => ({ ...a, [k]: x }));
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
  const [quick, setQuick] = useState(""),
    [newName, setNewName] = useState(""),
    [duplicate, setDuplicate] = useState(false);
  const update = (i: number, k: keyof SaleLine, x: string) =>
    setRows((a) =>
      a.map((r, j) => {
        if (i !== j) return r;
        const n = { ...r, [k]: x };
        if (k === "product_id") {
          const p = find(s, "products", x);
          n.unit_price = (p?.default_sale_price ?? 0) / 100;
          n.unit_weight_kg = (p?.standard_bag_weight_kg ?? 0) / 1000;
        }
        return n;
      }),
    );
  const grouped: Record<string, { q: number; w: number }> = {};
  rows.forEach((r) => {
    grouped[r.product_id] ??= { q: 0, w: 0 };
    grouped[r.product_id].q += Number(r.quantity) || 0;
    grouped[r.product_id].w += (Number(r.quantity) || 0) * (Number(r.unit_weight_kg) || 0) * 1000;
  });
  const missing = Object.entries(grouped).filter(
    ([id, a]) =>
      id &&
      (a.q >
        stock(s, id).quantity +
          (edit && record?.fulfillment_status === "DELIVERED"
            ? old.filter((x) => x.product_id === id).reduce((n: number, x) => n + x.quantity, 0)
            : 0) ||
        a.w >
          stock(s, id).weight_kg +
            (edit && record?.fulfillment_status === "DELIVERED"
              ? old.filter((x) => x.product_id === id).reduce((n: number, x) => n + x.total_weight_kg, 0)
              : 0)),
  );
  const total = rows.reduce((a, r) => a + Math.round(Number(r.quantity) * Number(r.unit_price) * 100), 0),
    dup = s.customers.some((x) => normalize(x.name) === normalize(newName));
  const paid = paidAmount === null ? total : Math.round(Number(paidAmount || 0) * 100);
  return {
    edit,
    v,
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
