"use client";
import type { AppState } from "@/lib/domain-types";
import CustomerDirectory from "@/features/clientes/components/CustomerDirectory";
import type { OpenModal } from "@/lib/domain-types";
import type { ReactNode } from "react";
import type { Dispatch } from "react";
import type { SetStateAction } from "react";
export default function CustomersView({
  s,
  tab,
  write,
  open,
  q,
  setQ,
  tabs,
}: {
  s: AppState;
  tab: string;
  write: boolean;
  open: OpenModal;
  q: string;
  setQ: Dispatch<SetStateAction<string>>;
  tabs: (options: [string, string][]) => ReactNode;
}) {
  return (
    <>
      {tabs([
        ["all", "Clientes"],
        ["sites", "Sedes"],
      ])}
      <CustomerDirectory s={s} tab={tab} query={q} onQuery={setQ} write={write} open={open} />
    </>
  );
}
