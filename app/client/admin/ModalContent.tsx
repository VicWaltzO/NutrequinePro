import { recordId } from "@/lib/domain-types";
import type { AppState, User, Sale, OpenModal, Submit } from "@/lib/domain-types";
import { SaleDeliveryDateForm } from "@/features/ventas/components/SaleDeliveryDateForm";
import { SaleForm } from "@/features/ventas/components/SaleForm";
import { PaymentForm } from "@/features/cobranza/components/PaymentForm";
import { ReturnForm } from "@/features/ventas/components/ReturnForm";
import type { FormProps } from "@/shared/types/forms";
import { ProductionForm } from "@/features/produccion/components/ProductionForm";
import { ReconcileForm } from "@/features/produccion/components/ReconcileForm";
import { FormulaForm } from "@/features/produccion/components/FormulaForm";
import { ProductionCorrectionForm } from "@/features/produccion/components/ProductionCorrectionForm";
import SimpleForm from "@/client/admin/SimpleForm";
import Details from "@/client/admin/OperationDetails";
import type { ReactNode } from "react";
import type { Modal } from "@/shared/types/admin";

import { resolveModalRecord } from "./resolve-modal-record";
import { CustomerDetail } from "@/features/clientes/components/CustomerDetail";
import { CustomerDeleteForm } from "@/features/clientes/components/CustomerDeleteForm";

export type ModalContentProps = {
  state: AppState;
  actor: User;
  write: boolean;
  open: OpenModal;
  run: Submit;
  close: () => void;
  busy: boolean;
  modal: Modal;
  saleTable: (rows: Sale[]) => ReactNode;
};
export default function ModalContent({
  state,
  actor,
  write,
  open,
  run,
  close,
  busy,
  modal,
  saleTable,
}: ModalContentProps) {
  const record = resolveModalRecord(state, modal);
  const props: FormProps & { actor: User } = {
    s: state,
    actor,
    record,
    kind: modal.kind,
    submit: run,
    close,
    busy,
  };
  if (modal.type === "sale-delivery-date") return <SaleDeliveryDateForm {...props} />;
  if (modal.type === "sale") return <SaleForm {...props} />;
  if (modal.type === "production") return <ProductionForm {...props} />;
  if (modal.type === "credit") return <PaymentForm {...props} record={modal.record} kind="credit" />;
  if (modal.type === "payment") return <PaymentForm {...props} />;
  if (modal.type === "return") return <ReturnForm {...props} />;
  if (modal.type === "production-quantities") return <ProductionCorrectionForm {...props} />;
  if (modal.type === "reconcile") return <ReconcileForm {...props} />;
  if (modal.type === "formula") return <FormulaForm {...props} record={modal.record} />;
  if (modal.type === "customer-delete") return <CustomerDeleteForm {...props} record={modal.record} />;
  if (["sale-detail", "production-detail", "payment-detail"].includes(modal.type))
    return (
      <Details
        s={state}
        actor={actor}
        entity={modal.type.split("-")[0]}
        id={recordId(modal.record)}
        open={open}
        run={run}
      />
    );
  if (modal.type === "customer-detail") {
    if (!record) return null;
    return (
      <CustomerDetail
        key={record.id}
        state={state}
        customer={record}
        write={write}
        open={open}
        saleTable={saleTable}
        run={run}
        busy={busy}
      />
    );
  }
  return (
    <SimpleForm {...props} record={modal.type === "reason" ? modal.record : props.record} kind={modal.type} />
  );
}
