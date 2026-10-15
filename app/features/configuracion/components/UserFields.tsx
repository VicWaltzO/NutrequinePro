import { Select } from "@/shared/ui";
import type { SimpleFieldProps } from "@/shared/types/simple-fields";
export default function UserFields({ v, set, input }: Pick<SimpleFieldProps, "v" | "set" | "input">) {
  return (
    <>
      {input("id", "ID de usuario autenticado")}
      <Select
        label="Rol"
        required
        empty={false}
        value={v.role}
        onChange={(x) => set("role", x)}
        options={["ADMIN", "OPERATOR", "VIEWER"]}
      />
    </>
  );
}
