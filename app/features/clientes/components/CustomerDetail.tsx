"use client";
import { recordId } from "@/lib/domain-types";
import type { AppState, EditorRecord, OpenModal, Sale } from "@/lib/domain-types";
import type { ReactNode } from "react";
import { customerSummary } from "../domain/summary.mjs";
import { Metrics, money } from "@/shared/ui";

export function CustomerDetail({
  state,
  customer,
  write,
  open,
  saleTable,
}: {
  state: AppState;
  customer: EditorRecord;
  write: boolean;
  open: OpenModal;
  saleTable: (rows: Sale[]) => ReactNode;
}) {
  return (
    <>
      <h2>{customer.name}</h2>
      <Metrics
        items={[
          { label: "Deuda pendiente", value: money(customerSummary(state, recordId(customer)).debt) },
          { label: "Saldo a favor", value: money(customerSummary(state, recordId(customer)).credit) },
          {
            label: "Saldo neto (deuda − a favor)",
            value: money(customerSummary(state, recordId(customer)).net),
          },
        ]}
      />
      <p>
        {customer.tax_id} · {customer.contact_name} · {customer.phone}
      </p>
      <p>{customer.address}</p>
      <p>{customer.notes}</p>
      {write && <button onClick={() => open("customer", customer)}>Editar cliente</button>}
      {saleTable(state.sales.filter((x) => x.customer_id === customer.id))}
    </>
  );
}
