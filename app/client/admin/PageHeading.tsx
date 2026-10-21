import { Plus } from "lucide-react";
import type { OpenModal } from "@/lib/domain-types";
import { nav } from "./navigation";
export default function PageHeading({
  tab,
  view,
  admin,
  write,
  open,
  primary,
}: {
  tab: string;
  view: string;
  admin: boolean;
  write: boolean;
  open: OpenModal;
  primary: Record<string, [string, string]>;
}) {
  return (
    <div className="page-heading">
      <div>
        <h1>{nav.find((x) => x[0] === view)?.[1]}</h1>
        <p>
          {
            (
              {
                dashboard: "Una vista clara de tus operaciones.",
                sales: "Ventas registradas, entregas e historial comercial.",
                collections: "Saldos pendientes y dinero efectivamente recibido.",
                productions: "Del lote planificado al producto terminado.",
                inventory: "Stock físico y movimientos con origen trazable.",
                balance: "Ventas, cobros y costos, consolidados desde la operación.",
                products: "Parámetros comerciales y presentaciones reales.",
                customers: "Clientes y sedes de entrega.",
                sites: "Destinos de tus operaciones.",
                expenses: "Egresos y sus operaciones relacionadas.",
                config: "Empresa, valores predeterminados, productos y accesos.",
              } as Record<string, string>
            )[view]
          }
        </p>
      </div>
      <div className="heading-actions">
        {view === "dashboard" && write && (
          <>
            <button onClick={() => open("production")}>Registrar producción</button>
            <button className="primary" onClick={() => open("sale")}>
              <Plus size={17} />
              Nueva venta
            </button>
          </>
        )}
        {primary[view] &&
          write &&
          (!["config", "inventory"].includes(view) || admin) &&
          (!(view === "productions" && tab === "ingredients") || admin) && (
            <button className="primary" onClick={() => open(primary[view][0])}>
              <Plus size={17} />
              {primary[view][1]}
            </button>
          )}
      </div>
    </div>
  );
}
