import type { AppState, OpenModal } from "@/lib/domain-types";
import { SortableTable, ProductImage, kg, money } from "@/shared/ui";
import { unitLabels, productPresentation, isNucleusProduct } from "@/shared/domain/presentation.mjs";
import { frontendPath } from "@/client/paths";

export default function ProductCatalog({
  s: state,
  admin,
  open,
}: {
  s: AppState;
  admin: boolean;
  open: OpenModal;
}) {
  return (
    <>
      <section className="settings-section">
        <h2>Parámetros comerciales</h2>
        <SortableTable
          heads={[
            "Producto",
            "Precio base",
            "Presentación",
            "Sacos / núcleo",
            "Kg / núcleo",
            "Ingreso al inventario",
            "Venta",
            "Estado",
            "Imagen",
            "",
          ]}
          rows={state.products}
          values={[
            (p) => p.name,
            (p) => [p.default_sale_price, unitLabels(p).singular],
            (p) => [
              unitLabels(p).singular,
              productPresentation(p).unit_weight_grams,
              productPresentation(p).weight_policy,
            ],
            (p) => (isNucleusProduct(p) ? p.bags_per_nucleus : null),
            (p) => (isNucleusProduct(p) ? (p.commercial_weight_per_nucleus_kg ?? 0) : null),
            (p) => (isNucleusProduct(p) ? "Fabricación por núcleos" : "Ingreso directo"),
            (p) => p.is_sellable,
            (p) => p.is_active,
            null,
            null,
          ]}
          tie={(p) => [p.name, p.id]}
        >
          {(p) => (
            <tr key={p.id}>
              <td>{p.name}</td>
              <td>
                {p.default_sale_price == null
                  ? "Pendiente de configurar"
                  : money(p.default_sale_price) + " / " + unitLabels(p).singular}
              </td>
              <td>
                {unitLabels(p).singular} · {kg(productPresentation(p).unit_weight_grams)} kg ·{" "}
                {productPresentation(p).weight_policy === "FIXED" ? "Fijo" : "Variable"}
              </td>
              <td>{isNucleusProduct(p) ? p.bags_per_nucleus : "Ingreso directo"}</td>
              <td>{isNucleusProduct(p) ? kg(p.commercial_weight_per_nucleus_kg ?? 0) : "—"}</td>
              <td>{isNucleusProduct(p) ? "Fabricación por núcleos" : "Ingreso directo"}</td>
              <td>{p.is_sellable ? "Habilitada" : "Consumo interno"}</td>
              <td>{p.is_active ? "Activo" : "Inactivo"}</td>
              <td>
                <ProductImage image={p.image} name={p.name} />
              </td>
              <td>{admin && <button onClick={() => open("product", p)}>Editar</button>}</td>
            </tr>
          )}
        </SortableTable>
      </section>
      <details className="settings-section">
        <summary>Presentación original de productos</summary>
        <img
          width={1440}
          height={1728}
          className="catalog-image"
          src={frontendPath("/brand/productos.jpg")}
          alt="Presentación real de Nutrelin, Hi-Performance y Potripregnant"
        />
      </details>
    </>
  );
}
