"use client";
import { useEffect } from "react";
import { useRef } from "react";
import { recordId } from "@/lib/domain-types";
import type { AppState } from "@/lib/domain-types";
import type { User } from "@/lib/domain-types";
import type { Sale } from "@/lib/domain-types";
import { X } from "lucide-react";
import { customerSummary } from "@/lib/domain.mjs";
import { Metrics } from "@/shared/ui";
import { money } from "@/shared/ui";
import { find } from "@/shared/ui";
import { SaleForm } from "@/features/ventas/components/SaleForm";
import { PaymentForm } from "@/features/cobranza/components/PaymentForm";
import { ReturnForm } from "@/features/ventas/components/ReturnForm";
import type { FormProps } from "@/shared/types/forms";
import { ProductionForm } from "@/features/produccion/components/ProductionForm";
import { ReconcileForm } from "@/features/produccion/components/ReconcileForm";
import { FormulaForm } from "@/features/produccion/components/FormulaForm";
import { ProductionCorrectionForm } from "@/features/produccion/components/ProductionCorrectionForm";
import SimpleForm from "@/app/ui/SimpleForm";
import Details from "@/app/ui/OperationDetails";
import type { OpenModal } from "@/lib/domain-types";
import type { Submit } from "@/lib/domain-types";
import type { ReactNode } from "react";
import type { Modal } from "@/shared/types/admin";
import { titles } from "./modal-configuration";
export default function ModalHost({
  s,
  actor,
  write,
  open,
  run,
  close,
  reload,
  busy,
  error,
  modal,
  saleTable,
}: {
  s: AppState;
  actor: User;
  write: boolean;
  open: OpenModal;
  run: Submit;
  close: () => void;
  reload: () => Promise<void>;
  busy: boolean;
  error: string;
  modal: Modal | null;
  saleTable: (rows: Sale[]) => ReactNode;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (modal && !dialog.current?.open) dialog.current?.showModal();
    if (!modal && dialog.current?.open) dialog.current.close();
  }, [modal]);
  return (
    <dialog
      ref={dialog}
      onCancel={(e) => {
        e.preventDefault();
        close();
      }}
      className="modal"
    >
      <div className="modal-head">
        <h2>{modal?.kind === "correct" ? "Rectificar venta" : (titles[modal?.type ?? ""] ?? "Detalle")}</h2>
        <button className="icon-button" aria-label="Cerrar" onClick={close} disabled={busy}>
          <X size={20} />
        </button>
      </div>
      <div className="modal-body">
        {error && (
          <div className="error" role="alert">
            {error}{" "}
            <button type="button" className="text-button" onClick={reload}>
              Recargar datos
            </button>
          </div>
        )}
        {modal &&
          (() => {
            const props: FormProps & { actor: User } = {
              s,
              actor,
              record: modal.record?.id
                ? (find(
                    s,
                    modal.type.includes("production") || modal.type === "reconcile"
                      ? "productions"
                      : modal.type.includes("sale") || modal.type === "return"
                        ? "sales"
                        : modal.type.includes("payment-detail")
                          ? "payments"
                          : modal.type.includes("customer")
                            ? "customers"
                            : modal.type === "site"
                              ? "sites"
                              : modal.type === "product"
                                ? "products"
                                : modal.type === "ingredient"
                                  ? "ingredients"
                                  : modal.type === "user"
                                    ? "users"
                                    : "audit",
                    recordId(modal.record),
                  ) ?? modal.record)
                : modal.record,
              kind: modal.kind,
              submit: run,
              close,
              busy,
            };
            if (modal.type === "sale") return <SaleForm {...props} />;
            if (modal.type === "production") return <ProductionForm {...props} />;
            if (modal.type === "credit")
              return <PaymentForm {...props} record={modal.record} kind="credit" />;
            if (modal.type === "payment") return <PaymentForm {...props} />;
            if (modal.type === "return") return <ReturnForm {...props} />;
            if (modal.type === "production-quantities") return <ProductionCorrectionForm {...props} />;
            if (modal.type === "reconcile") return <ReconcileForm {...props} />;
            if (modal.type === "formula") return <FormulaForm {...props} record={modal.record} />;
            if (modal.type === "customer-delete")
              return (
                <form
                  onSubmit={async (e) => {
                    e.preventDefault();
                    await run("CUSTOMER_DELETE", { id: recordId(modal.record) });
                  }}
                >
                  <h3>Eliminar {modal.record?.name} de la lista</h3>
                  <p className="notice">
                    El cliente dejará de aparecer en la lista y en nuevas ventas. Sus ventas, pagos, saldos e
                    historial se conservan.
                  </p>
                  <div className="form-footer">
                    <button type="button" onClick={close} disabled={busy}>
                      Cancelar
                    </button>
                    <button className="primary" disabled={busy}>
                      {busy ? "Guardando…" : "Eliminar de la lista"}
                    </button>
                  </div>
                </form>
              );
            if (["sale-detail", "production-detail", "payment-detail"].includes(modal.type))
              return (
                <Details
                  s={s}
                  actor={actor}
                  entity={modal.type.split("-")[0]}
                  id={recordId(modal.record)}
                  open={open}
                  run={run}
                />
              );
            if (modal.type === "customer-detail") {
              const c = props.record;
              if (!c) return null;
              return (
                <>
                  <h2>{c.name}</h2>
                  <Metrics
                    items={[
                      { label: "Deuda pendiente", value: money(customerSummary(s, recordId(c)).debt) },
                      { label: "Saldo a favor", value: money(customerSummary(s, recordId(c)).credit) },
                      {
                        label: "Saldo neto (deuda − a favor)",
                        value: money(customerSummary(s, recordId(c)).net),
                      },
                    ]}
                  />
                  <p>
                    {c.tax_id} · {c.contact_name} · {c.phone}
                  </p>
                  <p>{c.address}</p>
                  <p>{c.notes}</p>
                  {write && <button onClick={() => open("customer", c)}>Editar cliente</button>}
                  {saleTable(s.sales.filter((x) => x.customer_id === c.id))}
                </>
              );
            }
            return (
              <SimpleForm
                {...props}
                record={modal.type === "reason" ? modal.record : props.record}
                kind={modal.type}
              />
            );
          })()}
      </div>
    </dialog>
  );
}
