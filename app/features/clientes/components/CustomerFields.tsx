"use client";
import { normalize } from "@/lib/domain.mjs";
import { Field } from "@/shared/ui";
import { Check } from "@/shared/ui";
import type { SimpleFieldProps } from "@/shared/types/simple-fields";
export default function CustomerFields({
  s,
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
      <Field label="Sedes del cliente (primera = predeterminada)">
        {s.sites.map((x) => (
          <Check
            key={x.id}
            label={x.name}
            value={v.site_ids?.includes(x.id)}
            onChange={(yes) =>
              set(
                "site_ids",
                yes ? [...(v.site_ids ?? []), x.id] : (v.site_ids ?? []).filter((id: string) => id !== x.id),
              )
            }
          />
        ))}
      </Field>
      {s.customers.some((x) => x.id !== v.id && normalize(x.name) === normalize(v.name)) && (
        <Check
          label="Confirmo un cliente diferente con nombre similar"
          value={v.confirm_duplicate}
          onChange={(x) => set("confirm_duplicate", x)}
        />
      )}
    </>
  );
}
