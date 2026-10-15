import { recordId } from "@/lib/domain-types";
import type { AppState, TableName } from "@/lib/domain-types";
import type { Modal } from "@/shared/types/admin";
import { find } from "@/shared/lib/find";

export function resolveModalRecord(state: AppState, modal: Modal) {
  let record = modal.record;
  if (record?.id) {
    let table: TableName = "audit";
    if (modal.type.includes("production") || modal.type === "reconcile") table = "productions";
    else if (modal.type.includes("sale") || modal.type === "return") table = "sales";
    else if (modal.type.includes("payment-detail")) table = "payments";
    else if (modal.type.includes("customer")) table = "customers";
    else if (modal.type === "site") table = "sites";
    else if (modal.type === "product") table = "products";
    else if (modal.type === "ingredient") table = "ingredients";
    else if (modal.type === "user") table = "users";
    record = find(state, table, recordId(record)) ?? record;
  }

  return record;
}
