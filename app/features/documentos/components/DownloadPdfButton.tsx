import { useState } from "react";
import { Download } from "lucide-react";
import { adminFetch } from "@/client/session-api.ts";
import type { DocumentKind } from "../domain/common.ts";

export default function DownloadPdfButton({
  kind,
  id,
  from,
  to,
  children,
}: {
  kind: DocumentKind;
  id: string;
  from?: string;
  to?: string;
  children: string;
}) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);
  const invalid = !!from && !!to && from > to;
  async function download() {
    if (busy) return;
    setBusy(true);
    setMessage("");
    setFailed(false);
    try {
      const query = new URLSearchParams();
      if (kind === "customer") {
        if (from) query.set("from", from);
        if (to) query.set("to", to);
      }
      const response = await adminFetch(
        `/api/documents/${kind}/${encodeURIComponent(id)}.pdf${query.size ? "?" + query : ""}`,
      );
      if (!response.headers.get("Content-Type")?.includes("application/pdf"))
        throw new Error("El archivo recibido no es un PDF. Vuelva a intentar.");
      const blob = await response.blob();
      const filename =
        response.headers.get("Content-Disposition")?.match(/filename="([A-Za-z0-9_-]+\.pdf)"/)?.[1] ??
        "NUTREQUINE_Documento.pdf";
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = filename;
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setMessage("PDF descargado.");
    } catch (error) {
      setFailed(true);
      setMessage(error instanceof Error ? error.message : "No se pudo generar el PDF. Vuelva a intentar.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <span className="pdf-download">
      <button type="button" disabled={busy || invalid} aria-busy={busy} onClick={download}>
        <Download size={16} aria-hidden="true" />
        {busy ? "Generando PDF…" : children}
      </button>
      {invalid && <span className="field-error">Revise el intervalo de fechas.</span>}
      <span className={failed ? "field-error" : "metadata"} role={failed ? "alert" : "status"}>
        {message}
      </span>
    </span>
  );
}
