import Image from "@/shared/ui/LocalImage";
import { Moon, Sun } from "lucide-react";
import type { AppState, OpenModal, User } from "@/lib/domain-types";
import { changeTheme } from "@/lib/browser-preferences.mjs";
import { Table, kg, label, money, stamp } from "@/shared/ui";
import AuthenticatedId from "@/shared/ui/AuthenticatedId";
export default function Configuration({
  s: state,
  actor,
  tab,
  open,
  theme,
}: {
  s: AppState;
  actor: User;
  tab: string;
  open: OpenModal;
  theme: "light" | "dark";
}) {
  const admin = actor.role === "ADMIN";
  const c = state.config;
  if (tab === "products")
    return (
      <>
        <section className="settings-section">
          <h2>Parámetros comerciales</h2>
          <Table
            heads={[
              "Producto",
              "Precio base",
              "Kg / saco",
              "Sacos / núcleo",
              "Kg / núcleo",
              "Venta",
              "Estado",
              "",
            ]}
          >
            {state.products.map((p) => (
              <tr key={p.id}>
                <td>{p.name}</td>
                <td>{money(p.default_sale_price)}</td>
                <td>{kg(p.standard_bag_weight_kg)}</td>
                <td>{p.bags_per_nucleus}</td>
                <td>{kg(p.commercial_weight_per_nucleus_kg)}</td>
                <td>{p.is_sellable ? "Habilitada" : "Consumo interno"}</td>
                <td>{p.is_active ? "Activo" : "Inactivo"}</td>
                <td>{admin && <button onClick={() => open("product", p)}>Editar</button>}</td>
              </tr>
            ))}
          </Table>
        </section>
        <details className="settings-section">
          <summary>Presentación original de productos</summary>
          <Image
            width={1440}
            height={1728}
            unoptimized
            className="catalog-image"
            src="/brand/productos.jpg"
            alt="Presentación real de Nutrelin, Hi-Performance y Potripregnant"
          />
        </details>
      </>
    );
  if (tab === "users")
    return (
      <section className="settings-section">
        <div className="section-heading">
          <h2>Accesos</h2>
          {admin && <button onClick={() => open("user")}>Agregar usuario</button>}
        </div>
        <p className="notice">El acceso requiere una identidad autenticada y permiso de acceso al sitio.</p>
        <AuthenticatedId id={actor.id} />
        <Table heads={["Usuario", "ID autenticado", "Rol", "Estado", ""]}>
          {state.users.map((x) => (
            <tr key={x.id}>
              <td>{x.name}</td>
              <td>
                <code>{x.id}</code>
              </td>
              <td>{label(x.role)}</td>
              <td>{x.is_active ? "Activo" : "Inactivo"}</td>
              <td>{admin && <button onClick={() => open("user", x)}>Editar</button>}</td>
            </tr>
          ))}
        </Table>
      </section>
    );
  if (tab === "audit")
    return (
      <section className="settings-section">
        <h2>Historial de acciones</h2>
        <Table heads={["Fecha", "Usuario", "Acción", "Detalle"]}>
          {state.audit
            .slice()
            .reverse()
            .map((x) => (
              <tr key={x.id}>
                <td>{stamp(x.created_at)}</td>
                <td>{x.actor_name}</td>
                <td>{x.action}</td>
                <td>
                  <details>
                    <summary>Ver registro</summary>
                    <pre>{JSON.stringify(x.payload, null, 2)}</pre>
                  </details>
                </td>
              </tr>
            ))}
        </Table>
      </section>
    );
  if (tab === "appearance")
    return (
      <section className="settings-section">
        <h2>Apariencia</h2>
        <div className="tabs theme-options" aria-label="Tema">
          <button
            aria-pressed={theme === "light"}
            className={theme === "light" ? "selected" : ""}
            onClick={() => changeTheme("light")}
          >
            <Sun size={18} />
            Claro
          </button>
          <button
            aria-pressed={theme === "dark"}
            className={theme === "dark" ? "selected" : ""}
            onClick={() => changeTheme("dark")}
          >
            <Moon size={18} />
            Oscuro
          </button>
        </div>
      </section>
    );
  return (
    <>
      <section className="settings-section">
        <div className="section-heading">
          <h2>{c.company_name}</h2>
          {admin && <button onClick={() => open("config")}>Editar configuración</button>}
        </div>
        <dl className="settings-lines">
          <div>
            <dt>RUC / identificación</dt>
            <dd>{c.tax_id || "-"}</dd>
          </div>
          <div>
            <dt>Dirección</dt>
            <dd>{c.address || "-"}</dd>
          </div>
          <div>
            <dt>Teléfono</dt>
            <dd>{c.phone || "-"}</dd>
          </div>
          <div>
            <dt>Correo de contacto</dt>
            <dd>{c.contact_email || "-"}</dd>
          </div>
          <div>
            <dt>Moneda</dt>
            <dd>{c.currency}</dd>
          </div>
          <div>
            <dt>Zona horaria</dt>
            <dd>{c.timezone}</dd>
          </div>
        </dl>
      </section>
      <section className="settings-section">
        <h2>Valores predeterminados</h2>
        <dl className="settings-lines">
          <div>
            <dt>Condición de pago en nuevas ventas</dt>
            <dd>{c.default_payment_condition === "CASH" ? "Contado" : "Crédito"}</dd>
          </div>
          <div>
            <dt>Método de pago</dt>
            <dd>{c.default_payment_method ? label(c.default_payment_method) : "Elegir en cada operación"}</dd>
          </div>
          <div>
            <dt>Costo por núcleo</dt>
            <dd>{money(c.default_nucleus_cost)}</dd>
          </div>
          <div>
            <dt>Costo por saco</dt>
            <dd>{money(c.default_packaging_cost)}</dd>
          </div>
          <div>
            <dt>Categorías de gastos</dt>
            <dd>{c.expense_categories.map(label).join(", ")}</dd>
          </div>
          <div>
            <dt>Categoría predeterminada</dt>
            <dd>{label(c.default_expense_category ?? c.expense_categories[0])}</dd>
          </div>
        </dl>
      </section>
    </>
  );
}
