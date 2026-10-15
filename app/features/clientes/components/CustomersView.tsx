import type { AppState, OpenModal } from "@/lib/domain-types";
import CustomerDirectory from "@/features/clientes/components/CustomerDirectory";
import type { ReactNode, Dispatch, SetStateAction } from "react";

export default function CustomersView({
  s: state,
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
      <CustomerDirectory s={state} tab={tab} query={q} onQuery={setQ} write={write} open={open} />
    </>
  );
}
