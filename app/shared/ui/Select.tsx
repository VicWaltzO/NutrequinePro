import { orderNominal } from "@/shared/lib/nominal-order.mjs";
import { label } from "@/shared/lib/format";
import { Field } from "@/shared/ui/Field";
type SelectProps = {
  label: string;
  value?: string | null;
  onChange: (value: string) => void;
  options: (string | { id: string; name: string })[];
  order?: "nominal" | "preserve";
  fixedLast?: readonly string[];
  empty?: string | false;
  required?: boolean;
};
export function Select({
  label: caption,
  value,
  onChange,
  options,
  order = "preserve",
  fixedLast = [],
  empty = "Seleccionar",
  required = false,
}: SelectProps) {
  const visibleOptions =
    order === "nominal"
      ? orderNominal(
          options,
          (x) => (typeof x === "string" ? label(x) : x.name),
          (x) => (typeof x === "string" ? x : x.id),
          fixedLast,
        )
      : options;
  return (
    <Field label={caption}>
      <select
        aria-label={caption}
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        required={required}
      >
        {empty !== false && <option value="">{empty}</option>}
        {visibleOptions.map((x) => {
          const id = typeof x === "string" ? x : x.id;
          return (
            <option value={id} key={id}>
              {typeof x === "string" ? label(x) : x.name}
            </option>
          );
        })}
      </select>
    </Field>
  );
}
