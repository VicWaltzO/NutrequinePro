import SaleDetail from "@/features/ventas/components/SaleDetail";
import ProductionDetail from "@/features/produccion/components/ProductionDetail";
import PaymentDetail from "@/features/cobranza/components/PaymentDetail";
import type { DetailProps } from "@/shared/types/details";
export default function Details({ entity, ...props }: DetailProps & { entity: string }) {
  if (entity === "sale") return <SaleDetail {...props} />;
  if (entity === "production") return <ProductionDetail {...props} />;
  if (entity === "payment") return <PaymentDetail {...props} />;
  return null;
}
