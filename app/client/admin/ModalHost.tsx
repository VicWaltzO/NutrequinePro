import { useEffect, useRef, useState } from "react";
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
  const [retainedModal, setRetainedModal] = useState(modal);
  if (modal && modal !== retainedModal) setRetainedModal(modal);
  const visibleModal = modal ?? retainedModal;
  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (modal) {
      if (!element.open) element.showModal();
      return;
    }
    if (!element.open) return;
    const finish = () => {
      element.close();
    };
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      finish();
      return;
    }
    element.dataset.closing = "true";
    const exit = element.animate(
      [
        { opacity: 1, translate: "0 0" },
        { opacity: 0, translate: "0 6px" },
      ],
      { duration: 120, easing: "ease-out" },
    );
    exit.onfinish = finish;
    return () => {
      exit.cancel();
      delete element.dataset.closing;
    };
  }, [modal]);
  return (
    <dialog
      ref={dialog}
      onClose={() => setRetainedModal(null)}
      onCancel={(e) => {
        e.preventDefault();
        close();
      }}
      className="modal"
      aria-labelledby="operation-dialog-title"
    >
      <div className="modal-head">
        <h2 id="operation-dialog-title">
          {visibleModal?.kind === "correct"
            ? "Rectificar venta"
            : (titles[visibleModal?.type ?? ""] ?? "Detalle")}
        </h2>
        <button
          className="icon-button"
          aria-label="Cerrar"
          onClick={close}
          disabled={busy || (!!visibleModal && !modal)}
        >
          <X size={20} />
        </button>
      </div>
      <div className="modal-body" inert={!!visibleModal && !modal ? true : undefined}>
        {error && (
          <div className="error" role="alert">
            {error}{" "}
            <button type="button" className="text-button" onClick={reload}>
              Recargar datos
            </button>
          </div>
        )}
        {visibleModal && (
          <ModalContent
            state={state}
            actor={actor}
            write={write}
            open={open}
            run={run}
            close={close}
            busy={busy}
            modal={visibleModal}
            saleTable={saleTable}
          />
        )}
      </div>
    </dialog>
  );
}
