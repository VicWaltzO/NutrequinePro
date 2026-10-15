export function Footer({
  busy,
  close,
  label = "Guardar",
  disabled = false,
}: {
  busy: boolean;
  close: () => void;
  label?: string;
  disabled?: boolean;
}) {
  return (
    <footer className="form-footer">
      <button type="button" className="secondary" onClick={close} disabled={busy}>
        Cancelar
      </button>
      <button className="primary" disabled={busy || disabled}>
        {busy ? "Guardando…" : label}
      </button>
    </footer>
  );
}
