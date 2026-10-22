import { useState } from "react";
import { Plus } from "lucide-react";
import { normalize } from "@/lib/domain-preview.mjs";
import type { AppState } from "@/lib/domain-types";
import type { SimpleFields } from "@/shared/types/forms";
import { Check, Input, Select } from "@/shared/ui";

export type SiteSelection = Pick<SimpleFields, "site_ids" | "new_sites" | "default_site_id">;

export function CustomerSiteFields({
  state,
  value,
  onChange,
}: {
  state: AppState;
  value: SiteSelection;
  onChange: (value: SiteSelection) => void;
}) {
  const [mode, setMode] = useState<"" | "link" | "create">("");
  const [query, setQuery] = useState("");
  const [name, setName] = useState("");
  const ids = value.site_ids ?? [];
  const names = value.new_sites ?? [];
  const choices = [
    ...ids.map((id) => ({ id, name: state.sites.find((site) => site.id === id)?.name ?? id })),
    ...names.map((name, index) => ({ id: `new:${index}`, name: `${name} (nueva)` })),
  ];
  const principal = value.default_site_id ?? choices[0]?.id ?? "";
  const duplicate = state.sites.find((site) => normalize(site.name) === normalize(name));
  const stagedDuplicate = names.some((site) => normalize(site) === normalize(name));
  const link = (id: string, yes: boolean) => {
    const next = yes ? [...ids, id] : ids.filter((site) => site !== id);
    onChange({
      ...value,
      site_ids: next,
      default_site_id:
        principal === id && !yes ? (next[0] ?? (names.length ? "new:0" : "")) : principal || id,
    });
  };
  return (
    <fieldset className="customer-site-fields">
      <legend>Sedes del cliente</legend>
      <p className="muted">
        Vincular o retirar una sede solo afecta a este cliente. La sede y sus ventas se conservan.
      </p>
      {choices.length ? (
        <ul className="customer-site-list">
          {choices.map((site) => (
            <li key={site.id}>
              <span>
                {site.name}
                {site.id === principal ? " · Principal" : ""}
              </span>
              <button
                type="button"
                className="text-button"
                aria-label={`Retirar vínculo con ${site.name}`}
                onClick={() => {
                  if (!site.id.startsWith("new:")) return link(site.id, false);
                  const index = Number(site.id.slice(4));
                  const next = names.filter((_, i) => i !== index);
                  // Pending indexes change when a row is removed; preserve the selected name.
                  const selectedIndex = principal.startsWith("new:") ? Number(principal.slice(4)) : -1;
                  const newDefault =
                    selectedIndex === index
                      ? (ids[0] ?? (next.length ? "new:0" : ""))
                      : selectedIndex > index
                        ? `new:${selectedIndex - 1}`
                        : principal;
                  onChange({ ...value, new_sites: next, default_site_id: newDefault });
                }}
              >
                Retirar vínculo
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p>No hay sedes vinculadas. Agregue una para facilitar las próximas ventas.</p>
      )}
      {choices.length > 0 && (
        <Select
          label="Sede principal"
          options={choices}
          empty={false}
          value={principal}
          onChange={(id) => onChange({ ...value, default_site_id: id })}
        />
      )}
      <div className="customer-site-actions">
        <button
          type="button"
          aria-pressed={mode === "link"}
          onClick={() => setMode(mode === "link" ? "" : "link")}
        >
          <Plus size={16} /> Vincular sede existente
        </button>
        <button
          type="button"
          aria-pressed={mode === "create"}
          onClick={() => setMode(mode === "create" ? "" : "create")}
        >
          <Plus size={16} /> Crear sede nueva
        </button>
      </div>
      {mode === "link" && (
        <div className="customer-site-options">
          <Input label="Buscar sede existente" value={query} onChange={setQuery} />
          {state.sites
            .filter((site) => site.is_active && normalize(site.name).includes(normalize(query)))
            .map((site) => (
              <Check
                key={site.id}
                label={site.name}
                value={ids.includes(site.id)}
                onChange={(yes) => link(site.id, yes)}
              />
            ))}
          {!state.sites.some((site) => site.is_active && normalize(site.name).includes(normalize(query))) && (
            <p>No hay sedes activas que coincidan.</p>
          )}
        </div>
      )}
      {mode === "create" && (
        <div className="customer-site-options">
          <Input label="Nombre de la nueva sede" value={name} onChange={setName} maxLength={200} />
          {duplicate && (
            <p role="status">
              Ya existe «{duplicate.name}».{" "}
              {duplicate.is_active
                ? "Vincule la sede existente."
                : "Solicite su activación desde Clientes → Sedes."}
            </p>
          )}
          {stagedDuplicate && <p role="status">Esta sede ya está preparada para guardar.</p>}
          {duplicate?.is_active && !ids.includes(duplicate.id) && (
            <button
              type="button"
              onClick={() => {
                link(duplicate.id, true);
                setName("");
                setMode("");
              }}
            >
              Vincular {duplicate.name}
            </button>
          )}
          <button
            type="button"
            disabled={!name.trim() || !!duplicate || stagedDuplicate}
            onClick={() => {
              onChange({
                ...value,
                new_sites: [...names, name.trim()],
                default_site_id: principal || `new:${names.length}`,
              });
              setName("");
              setMode("");
            }}
          >
            Preparar sede para guardar
          </button>
          <p className="muted">Se creará y vinculará al guardar. Cancelar descarta esta sede.</p>
        </div>
      )}
    </fieldset>
  );
}
