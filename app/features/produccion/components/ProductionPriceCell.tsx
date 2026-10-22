import { useEffect, useRef, useState } from "react";
import { Pencil, SlidersHorizontal } from "lucide-react";
import { money } from "@/shared/ui";
import { scaled } from "@/shared/domain/core.mjs";

export function ProductionPriceCell({
  name,
  price,
  masterPrice,
  apply,
}: {
  name: string;
  price: number;
  masterPrice: number;
  apply: (value: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const pencil = useRef<HTMLButtonElement>(null);
  const restoreFocus = useRef(false);
  useEffect(() => {
    if (editing) input.current?.focus();
    else if (restoreFocus.current) {
      pencil.current?.focus();
      restoreFocus.current = false;
    }
  }, [editing]);
  const accept = () => {
    try {
      scaled(draft);
      apply(draft);
      setEditing(false);
    } catch {
      setError("Usa un precio válido, mayor o igual a cero, con hasta 2 decimales.");
      input.current?.focus();
    }
  };
  return editing ? (
    <div className="production-price-editor">
      <input
        ref={input}
        aria-label={"Precio por kg de " + name}
        type="number"
        min="0"
        step="0.01"
        value={draft}
        aria-invalid={!!error}
        onChange={(event) => {
          setDraft(event.target.value);
          setError("");
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            accept();
          }
          if (event.key === "Escape") {
            event.preventDefault();
            event.stopPropagation();
            setEditing(false);
          }
        }}
      />
      <div className="production-cell-actions">
        <button type="button" className="text-button" onClick={accept}>
          Aplicar
        </button>
        <button type="button" className="text-button" onClick={() => setEditing(false)}>
          Cancelar
        </button>
      </div>
      {error && (
        <small className="production-cell-error" role="alert">
          {error}
        </small>
      )}
    </div>
  ) : (
    <div>
      <span className="production-price-value">
        {money(price)}
        <button
          ref={pencil}
          type="button"
          className="icon-button production-edit-price"
          aria-label={"Editar precio por kg de " + name}
          title="Editar precio solo para este lote"
          onClick={() => {
            setDraft((price / 100).toFixed(2));
            setError("");
            restoreFocus.current = true;
            setEditing(true);
          }}
        >
          <Pencil size={14} />
        </button>
      </span>
      {price !== masterPrice && (
        <small className="production-cell-hint">
          <SlidersHorizontal size={12} aria-hidden="true" /> Precio de lote
        </small>
      )}
    </div>
  );
}
