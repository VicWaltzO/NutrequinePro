import { useState } from "react";
import { Input } from "@/shared/ui";
import { Footer } from "@/shared/ui/FormFooter";
import type { FormProps } from "@/shared/types/forms";

export function SaleDeliveryDateForm({ record, submit, close, busy }: FormProps) {
  const [deliveryDate, setDeliveryDate] = useState(record?.delivery_date ?? record?.sale_date ?? "");
  const [reason, setReason] = useState("");
  return (
    <form
      onSubmit={async (event) => {
        event.preventDefault();
        await submit("SALE_DELIVERY_DATE_UPDATE", { id: record?.id, delivery_date: deliveryDate, reason });
      }}
    >
      <div className="sale-dates">
        <Input label="Fecha de venta" type="date" value={record?.sale_date} readOnly onChange={() => {}} />
        <Input
          label="Fecha de entrega"
          type="date"
          value={deliveryDate}
          required
          disabled={busy}
          onChange={setDeliveryDate}
        />
      </div>
      <p className="notice">
        Cambia la fecha prevista. Las reservas, los pagos y la entrega física se conservan.
      </p>
      {deliveryDate < (record?.sale_date ?? "") && (
        <p className="warning" role="status">
          La entrega es anterior a la venta. El motivo dejará constancia de esta regularización.
        </p>
      )}
      <Input label="Motivo del cambio" value={reason} required disabled={busy} onChange={setReason} />
      <Footer busy={busy} close={close} label="Guardar fecha de entrega" />
    </form>
  );
}
