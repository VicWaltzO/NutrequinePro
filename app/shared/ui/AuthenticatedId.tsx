"use client";
import { useState } from "react";
import { Check, Copy } from "lucide-react";

export default function AuthenticatedId({ id }: { id: string }) {
  const [status, setStatus] = useState<"idle" | "copied" | "manual">("idle");
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(id);
      setStatus("copied");
    } catch {
      const field = document.createElement("textarea");
      field.value = id;
      field.readOnly = true;
      field.style.position = "fixed";
      field.style.opacity = "0";
      document.body.appendChild(field);
      const focused = document.activeElement;
      try {
        field.focus();
        field.select();
        field.setSelectionRange(0, id.length);
        setStatus(document.execCommand("copy") ? "copied" : "manual");
      } catch {
        setStatus("manual");
      } finally {
        field.remove();
        if (focused instanceof HTMLElement) focused.focus();
      }
    }
  };
  let copyMessage = "Copia este ID completo y envíalo al administrador para habilitar tu acceso.";
  if (status === "copied") copyMessage = "ID completo copiado. Puedes pegarlo y enviarlo al administrador.";
  else if (status === "manual")
    copyMessage =
      "El navegador bloqueó la copia. Mantén pulsado el ID o selecciona el campo siguiente para copiarlo manualmente.";
  return (
    <section className="authenticated-id" aria-label="Tu ID autenticado">
      <strong>ID autenticado</strong>
      <code className="authenticated-id-value">{id}</code>
      <button type="button" className="primary" onClick={copy}>
        {status === "copied" ? <Check size={17} /> : <Copy size={17} />}{" "}
        {status === "copied" ? "ID copiado" : "Copiar ID"}
      </button>
      <p role="status" aria-live="polite">
        {copyMessage}
      </p>
      {status === "manual" && (
        <textarea
          aria-label="ID para copiar manualmente"
          readOnly
          value={id}
          rows={2}
          onFocus={(e) => e.currentTarget.select()}
        />
      )}
    </section>
  );
}
