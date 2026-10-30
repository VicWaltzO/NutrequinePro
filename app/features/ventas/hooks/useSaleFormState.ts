import { initialSaleDates, changeSaleDateFields } from "./sale-dates.mjs";
import { useState } from "react";
import type { SaleFields, SaleLine, FormProps } from "@/shared/types/forms";
import type { SaleItem } from "@/lib/domain-types";
import { saleSummary } from "../domain/summary.mjs";
import { customerNameMatches, customerDuplicateReview } from "@/features/clientes/domain/name-matches.mjs";
import { saleFormPreview } from "./sale-form-preview";
import { day } from "@/shared/lib/format";
import { find } from "@/shared/lib/find";
import { createSaleLine, selectSaleProduct } from "./sale-lines";

export function useSaleFormState({ s: state, record, kind }: Pick<FormProps, "s" | "record" | "kind">) {
  const old: SaleItem[] = record?.id ? saleSummary(state, { id: record.id }).items : [];
  const edit = kind === "correct";
  const [values, setValues] = useState<SaleFields>({
    ...initialSaleDates(record, day()),
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
  const set = (k: string, x: string | boolean) => setValues((a) => changeSaleDateFields(a, k, x));
  const [rows, setRows] = useState<SaleLine[]>(
    old.length
      ? old.map((x) => ({
          original_item_id: x.id,
          presentation_unit_snapshot: x.presentation_unit_snapshot ?? "BAG",
          weight_policy_snapshot: x.weight_policy_snapshot ?? "VARIABLE",
          unit_weight_grams_snapshot: x.unit_weight_grams_snapshot ?? x.unit_weight_kg,
          product_id: x.product_id,
          quantity: x.quantity,
          unit_weight_kg: x.unit_weight_kg / 1000,
          unit_price: x.unit_price / 100,
        }))
      : [createSaleLine()],
  );
  const [paidAmount, setPaidAmount] = useState<string | null>(null);
  const [quick, setQuick] = useState("");
  const [newName, setName] = useState("");
  const [reviewed, setReviewed] = useState("");
  const matches = customerNameMatches(state.customers, newName);
  const review = customerDuplicateReview(state.customers, newName);
  if (reviewed && reviewed !== review) setReviewed("");
  const duplicate = reviewed === review;
  const setNewName = (name: string) => {
    setName(name);
    setReviewed("");
  };
  const setDuplicate = (value: boolean) => setReviewed(value ? review : "");
  const update = (i: number, k: keyof SaleLine, x: string) =>
    setRows((a) =>
      a.map((r, j) => {
        if (i !== j) return r;
        if (k === "product_id") {
          const p = find(state, "products", x);
          return selectSaleProduct(r, x, p);
        }
        return { ...r, [k]: x };
      }),
    );
  const { missing, total } = saleFormPreview(
    state,
    rows,
    old,
    edit && record?.fulfillment_status === "DELIVERED",
  );
  const dup = matches.length > 0;
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
    matches,
    review,
    paid,
  };
}
