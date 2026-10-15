export const money = (n: number | null | undefined) =>
  new Intl.NumberFormat("es-PE", { style: "currency", currency: "PEN" }).format((n ?? 0) / 100);
export const kg = (n: number | null | undefined) =>
  new Intl.NumberFormat("es-PE", { maximumFractionDigits: 3 }).format((n ?? 0) / 1000);
export const num = (n: number | null | undefined) => new Intl.NumberFormat("es-PE").format(n ?? 0);
export const day = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Lima" }).format(new Date());
export const stamp = (v: string | undefined) =>
  v
    ? new Intl.DateTimeFormat("es-PE", {
        timeZone: "America/Lima",
        dateStyle: "medium",
        timeStyle: "short",
      }).format(new Date(v))
    : "—";
export const names: Record<string, string> = {
  DRAFT: "Borrador",
  CONFIRMED: "Confirmada",
  CLOSED: "Cerrada",
  CANCELLED: "Anulada",
  RECTIFIED: "Rectificada",
  PENDING: "Pendiente",
  PARTIAL: "Pago parcial",
  PAID: "Pagada",
  DELIVERED: "Entregada",
  CASH: "Efectivo",
  CREDIT: "Crédito",
  TRANSFER: "Transferencia",
  CHECK: "Cheque",
  OTHER: "Otro",
  NUCLEUS: "Núcleos",
  PACKAGING: "Sacos / envases",
  FREIGHT: "Flete",
  HANDLING: "Carga / descarga",
  PERSONNEL: "Personal",
  SERVICE: "Servicio",
  INGREDIENT_EXTRA: "Extra por insumo",
  LOGISTICS: "Logística",
  OPERATING: "Operativo",
  ADMINISTRATIVE: "Administrativo",
  PRODUCTION_IN: "Entrada de producción",
  SALE_OUT: "Salida de venta",
  RETURN_IN: "Devolución",
  ADJUSTMENT_IN: "Ajuste de entrada",
  ADJUSTMENT_OUT: "Ajuste de salida",
  CANCELLATION_REVERSAL: "Reversión",
  CONSUMPTION_OUT: "Consumo de insumo",
  ADMIN: "Administrador",
  OPERATOR: "Operador",
  VIEWER: "Consulta",
};
export const label = (x: string) => names[x] ?? x;
