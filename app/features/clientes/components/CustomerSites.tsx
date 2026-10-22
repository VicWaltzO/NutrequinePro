import { useState } from "react";
import { Plus } from "lucide-react";
import type { AppState, Submit } from "@/lib/domain-types";
import { CustomerSiteFields, type SiteSelection } from "./CustomerSiteFields";

export function CustomerSites({
  state,
  customerId,
  write,
  run,
  busy,
}: {
  state: AppState;
  customerId: string;
  write: boolean;
  run: Submit;
  busy: boolean;
}) {
  const [edit, setEdit] = useState<SiteSelection | null>(null);
  const links = state.customerSites.filter((link) => link.customer_id === customerId && link.is_active);
  if (edit && write)
    return (
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          const saved = await run("CUSTOMER_SITES_SAVE", { id: customerId, ...edit, _keep_open: true });
          if (saved) setEdit(null);
        }}
      >
        <fieldset disabled={busy} className="customer-site-editor">
          <CustomerSiteFields state={state} value={edit} onChange={setEdit} />
          <div className="customer-site-actions">
            <button type="button" onClick={() => setEdit(null)}>
              Cancelar
            </button>
            <button className="primary" type="submit" disabled={busy}>
              {busy ? "Guardando…" : "Guardar sedes"}
            </button>
          </div>
        </fieldset>
      </form>
    );
  return (
    <section>
      <div className="customer-section-heading">
        <h3>Sedes vinculadas</h3>
        {write && (
          <button
            type="button"
            onClick={() =>
              setEdit({
                site_ids: links.map((link) => link.site_id),
                default_site_id: links.find((link) => link.is_default)?.site_id,
              })
            }
          >
            <Plus size={16} /> Agregar sede
          </button>
        )}
      </div>
      {links.length ? (
        <ul className="customer-site-list">
          {links.map((link) => {
            const site = state.sites.find((site) => site.id === link.site_id);
            return (
              <li key={link.id}>
                <span>
                  {site?.name}
                  {link.is_default ? " · Principal" : ""}
                  {site?.is_active === false ? " · Inactiva" : ""}
                </span>
                {write && (
                  <button
                    type="button"
                    className="text-button"
                    onClick={() =>
                      setEdit({ site_ids: links.map((row) => row.site_id), default_site_id: link.site_id })
                    }
                  >
                    Elegir como principal
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      ) : (
        <p>Este cliente aún no tiene sedes vinculadas.</p>
      )}
      <p className="muted">
        Una sede puede pertenecer a varios clientes. La principal se elige solo para este cliente.
      </p>
    </section>
  );
}
