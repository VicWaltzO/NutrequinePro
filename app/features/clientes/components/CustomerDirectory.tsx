"use client";
import { Search } from "lucide-react";
import type { AppState } from "@/lib/domain-types";
import type { OpenModal } from "@/lib/domain-types";
import { normalize } from "@/lib/domain.mjs";
import { customerSummary } from "@/lib/domain.mjs";
import { Empty } from "@/shared/ui";
import { Table } from "@/shared/ui";
import { find } from "@/shared/ui";
import { money } from "@/shared/ui";
export default function CustomerDirectory({
  s,
  tab,
  query,
  onQuery,
  write,
  open,
}: {
  s: AppState;
  tab: string;
  query: string;
  onQuery: (value: string) => void;
  write: boolean;
  open: OpenModal;
}) {
  const customers = s.customers.filter((x) => !x.deleted_at);
  const linkedCustomers = (siteId: string) =>
    customers.filter((c) =>
      s.customerSites.some((l) => l.customer_id === c.id && l.site_id === siteId && l.is_active),
    );
  const linkedSites = (customerId: string) =>
    s.customerSites
      .filter((l) => l.customer_id === customerId && l.is_active)
      .map((l) => ({ link: l, site: find(s, "sites", l.site_id) }));
  const customerRows = customers.filter((c) =>
    normalize(
      [c.name, c.contact_name, c.phone, c.tax_id, ...linkedSites(c.id).map((x) => x.site?.name)].join(" "),
    ).includes(normalize(query)),
  );
  const siteRows = s.sites.filter((x) =>
    normalize([x.name, ...linkedCustomers(x.id).map((c) => c.name)].join(" ")).includes(normalize(query)),
  );
  return (
    <>
      <div className="filters">
        <div className="search">
          <Search size={17} />
          <input
            aria-label="Buscar clientes o sedes"
            placeholder="Buscar cliente, contacto o sede"
            value={query}
            onChange={(e) => onQuery(e.target.value)}
          />
        </div>
      </div>
      <section className="panel flush">
        {tab === "sites" ? (
          <Table heads={["Sede", "Clientes asociados", "Estado", ""]}>
            {siteRows.map((x) => (
              <tr key={x.id}>
                <td>{x.name}</td>
                <td>
                  {linkedCustomers(x.id).map((c) => (
                    <button
                      className="row-link directory-link"
                      key={c.id}
                      onClick={() => open("customer-detail", c)}
                    >
                      {c.name}
                    </button>
                  ))}
                </td>
                <td>{x.is_active ? "Activo" : "Inactivo"}</td>
                <td>{write && <button onClick={() => open("site", x)}>Editar</button>}</td>
              </tr>
            ))}
          </Table>
        ) : (
          <Table heads={["Cliente", "Contacto", "Sedes", "Deuda", "Saldo a favor", "Estado", ""]}>
            {customerRows.map((x) => (
              <tr key={x.id}>
                <td>
                  <button className="row-link" onClick={() => open("customer-detail", x)}>
                    {x.name}
                  </button>
                  <small>{x.code}</small>
                </td>
                <td>
                  {x.contact_name || "-"}
                  <small>{x.phone}</small>
                </td>
                <td>
                  {linkedSites(x.id).map(({ link, site }) => (
                    <small key={link.id}>
                      {site?.name}
                      {link.is_default ? " (principal)" : ""}
                    </small>
                  ))}
                </td>
                <td>{money(customerSummary(s, x.id).debt)}</td>
                <td>{money(customerSummary(s, x.id).credit)}</td>
                <td>{x.is_active ? "Activo" : "Inactivo"}</td>
                <td>
                  {write && (
                    <>
                      <button onClick={() => open("customer", x)}>Editar</button>
                      <button className="text-button danger" onClick={() => open("customer-delete", x)}>
                        Eliminar
                      </button>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </Table>
        )}
        {!(tab === "sites" ? siteRows : customerRows).length && (
          <Empty text={tab === "sites" ? "No hay sedes en esta vista." : "No hay clientes en esta vista."} />
        )}
      </section>
    </>
  );
}
