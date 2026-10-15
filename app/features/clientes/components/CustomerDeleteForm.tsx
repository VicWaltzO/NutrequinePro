"use client";
import { recordId } from "@/lib/domain-types";
import type { EditorRecord, Submit } from "@/lib/domain-types";

export function CustomerDeleteForm({
  record,
  submit,
  close,
  busy,
}: {
  record?: EditorRecord;
  submit: Submit;
  close: () => void;
  busy: boolean;
}) {
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        await submit("CUSTOMER_DELETE", { id: recordId(record) });
      }}
    >
      <h3>Eliminar {record?.name} de la lista</h3>
      <p className="notice">
        El cliente dejará de aparecer en la lista y en nuevas ventas. Sus ventas, pagos, saldos e historial se
        conservan.
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
}
