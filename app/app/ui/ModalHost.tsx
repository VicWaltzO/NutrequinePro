"use client";
import { useEffect, useRef } from "react";
import type { AppState, User, Sale, OpenModal, Submit } from "@/lib/domain-types";
import type { ReactNode } from "react";
import type { Modal } from "@/shared/types/admin";
import { X } from "lucide-react";
import { titles } from "./modal-configuration";
import ModalContent from "./ModalContent";
export default function ModalHost({
  s: state,
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
        {modal && (
          <ModalContent
            state={state}
            actor={actor}
            write={write}
            open={open}
            run={run}
            close={close}
            busy={busy}
            modal={modal}
            saleTable={saleTable}
          />
        )}
      </div>
    </dialog>
  );
}
