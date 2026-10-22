import { normalize } from "@/lib/domain-preview.mjs";
import { Check } from "@/shared/ui";
import { CustomerSiteFields } from "./CustomerSiteFields";
import type { SimpleFieldProps } from "@/shared/types/simple-fields";
export default function CustomerFields({
  s: state,
  v,
  set,
  input,
}: Pick<SimpleFieldProps, "s" | "v" | "set" | "input">) {
  return (
    <>
      {input("tax_id", "RUC / identificación", "text", false)}
      {input("contact_name", "Contacto", "text", false)}
      {input("phone", "Teléfono", "text", false)}
      {input("address", "Dirección", "text", false)}
      {input("notes", "Notas", "text", false)}
      <CustomerSiteFields
        state={state}
        value={v}
        onChange={(next) => {
          set("site_ids", next.site_ids);
          set("new_sites", next.new_sites);
          set("default_site_id", next.default_site_id);
        }}
      />
      {state.customers.some((x) => x.id !== v.id && normalize(x.name) === normalize(v.name)) && (
        <Check
          label="Confirmo un cliente diferente con nombre similar"
          value={v.confirm_duplicate}
          onChange={(x) => set("confirm_duplicate", x)}
        />
      )}
    </>
  );
}
