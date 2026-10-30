import { Check } from "@/shared/ui";
import type { Customer } from "@/lib/domain-types";

export default function CustomerNameWarning({
  id,
  matches,
  confirmed,
  onConfirm,
}: {
  id: string;
  matches: { customer: Customer; kind: string }[];
  confirmed: boolean;
  onConfirm: (value: boolean) => void;
}) {
  if (!matches.length) return null;
  return (
    <div className="customer-name-warning">
      <div id={id} role="status" aria-live="polite">
        <strong>Posible cliente duplicado</strong>
        <p>Revisa las fichas antes de guardar otro cliente.</p>
        <ul>
          {matches.map(({ customer, kind }) => (
            <li key={customer.id}>
              <span>
                {customer.name} · {kind === "exact" ? "Mismo nombre normalizado" : "Nombre similar"}
              </span>
              <details>
                <summary>
                  Consultar ficha de {customer.name} ({customer.code})
                </summary>
                <dl>
                  <dt>Código</dt>
                  <dd>{customer.code}</dd>
                  <dt>Estado</dt>
                  <dd>{customer.deleted_at ? "Retirado" : customer.is_active ? "Activo" : "Inactivo"}</dd>
                  <dt>RUC / identificación</dt>
                  <dd>{customer.tax_id || "Sin registro"}</dd>
                  <dt>Contacto</dt>
                  <dd>{customer.contact_name || "Sin registro"}</dd>
                </dl>
              </details>
            </li>
          ))}
        </ul>
      </div>
      <Check
        label="Confirmo que es un cliente diferente con nombre similar"
        value={confirmed}
        onChange={onConfirm}
      />
    </div>
  );
}
