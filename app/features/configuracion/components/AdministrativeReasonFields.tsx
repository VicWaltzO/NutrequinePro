"use client";
import type { SimpleFieldProps } from "@/shared/types/simple-fields";
export default function AdministrativeReasonFields({
  record,
  input,
}: Pick<SimpleFieldProps, "record" | "input">) {
  return (
    <>
      {input("reason", "Motivo obligatorio")}
      {record?._operation === "PAYMENT_REVERSE" && (
        <>
          {input("date", "Fecha de reversión", "date")}
          <p className="warning">
            Se registra una reversión total del pago y se liberan todas sus aplicaciones. El pago original
            permanece en el historial.
          </p>
        </>
      )}
    </>
  );
}
