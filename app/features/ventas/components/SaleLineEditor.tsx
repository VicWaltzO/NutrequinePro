import { useRef, useState } from "react";
import type { Dispatch, ReactNode, SetStateAction } from "react";
import { Check, Plus, ShoppingBag, Trash2 } from "lucide-react";
import type { AppState } from "@/lib/domain-types";
import type { SaleLine } from "@/shared/types/forms";
import { stock } from "../../inventario/domain/stock.mjs";
import { Input, ProductImage, money, kg, find, num } from "@/shared/ui";
import {
  addSaleProduct,
  createSaleLine,
  saleProductCandidates,
  canIncrementSaleLine,
  incrementSaleLine,
} from "../hooks/sale-lines";
import { ProductName } from "@/shared/ui/ProductMarker";
import { unitLabels, productPresentation } from "@/shared/domain/presentation.mjs";

export function SaleLineEditor({
  state,
  rows,
  setRows,
  update,
  total,
  children,
}: {
  state: AppState;
  rows: SaleLine[];
  setRows: Dispatch<SetStateAction<SaleLine[]>>;
  update: (index: number, field: keyof SaleLine, value: string) => void;
  total: number;
  children?: ReactNode;
}) {
  const [announcement, setAnnouncement] = useState("");
  const [choosing, setChoosing] = useState("");
  const cardButtons = useRef<Record<string, HTMLButtonElement | null>>({});
  const closeChoice = () => {
    cardButtons.current[choosing]?.focus({ preventScroll: true });
    setChoosing("");
  };
  const products = state.products.filter((product) => product.is_active && product.is_sellable);
  const choiceProduct = products.find((product) => product.id === choosing);
  const choices = choiceProduct ? saleProductCandidates(rows, choiceProduct) : [];
  const selectedLines = rows.filter((row) => row.product_id).length;
  return (
    <section className="sale-section sale-products" aria-labelledby="sale-products-title">
      <div className="sale-section-header">
        <h3 id="sale-products-title">
          <ShoppingBag size={20} aria-hidden="true" />
          Productos
        </h3>
        <span className="sale-section-meta">
          {selectedLines} {selectedLines === 1 ? "línea" : "líneas"} en la venta
        </span>
      </div>
      <div className="sale-section-body">
        <p className="sale-section-help">Elige una presentación para agregarla a la venta.</p>
        {products.length > 0 ? (
          <div className="sale-product-picker" aria-label="Presentaciones disponibles">
            {products.map((product) => {
              const available = stock(state, product.id);
              const quantity = rows
                .filter((row) => row.product_id === product.id)
                .reduce((sum, row) => sum + (Number(row.quantity) || 0), 0);
              return (
                <button
                  key={product.id}
                  ref={(element) => {
                    cardButtons.current[product.id] = element;
                  }}
                  type="button"
                  className={"sale-product-option " + (quantity > 0 ? "included" : "")}
                  aria-label={"Agregar " + product.name}
                  onClick={() => {
                    const candidates = saleProductCandidates(rows, product);
                    if (
                      candidates.length > 1 ||
                      candidates.some((index) => !canIncrementSaleLine(rows[index], product))
                    ) {
                      setChoosing(product.id);
                      return;
                    }
                    setChoosing("");
                    setRows((current) => addSaleProduct(current, product));
                    setAnnouncement(product.name + " agregado a la venta.");
                  }}
                >
                  <span className="sale-picker-photo" aria-hidden="true">
                    <ProductImage image={product.image} name={product.name} />
                  </span>
                  <span className="sale-picker-description">
                    <strong>
                      <ProductName name={product.name} />
                    </strong>
                    <span>
                      {product.default_sale_price == null
                        ? "Precio pendiente"
                        : money(product.default_sale_price)}{" "}
                      / {unitLabels(product).singular}
                    </span>
                    <small>
                      {num(available.quantity)} {unitLabels(product).plural} en stock
                    </small>
                    {quantity > 0 && (
                      <small className="sale-picker-selected">
                        <Check size={12} />
                        {num(quantity)} {unitLabels(product).plural} en la venta
                      </small>
                    )}
                  </span>
                  <Plus size={18} className="sale-picker-add" aria-hidden="true" />
                </button>
              );
            })}
          </div>
        ) : (
          <p className="notice">
            No hay productos activos disponibles para venta. Configúralos antes de continuar.
          </p>
        )}
        {choiceProduct && choices.length > 0 && (
          <fieldset className="sale-line-choice">
            <legend>Elige la línea de {choiceProduct.name}</legend>
            <p>Se conservarán el precio y el peso de la línea que elijas.</p>
            {choices.map((index) => (
              <button
                key={index}
                type="button"
                disabled={!canIncrementSaleLine(rows[index], choiceProduct)}
                aria-label={"Agregar a línea " + (index + 1) + " de " + choiceProduct.name}
                onClick={() => {
                  setRows((current) => incrementSaleLine(current, index, choiceProduct));
                  closeChoice();
                  setAnnouncement(choiceProduct.name + " agregado a la línea " + (index + 1) + ".");
                }}
              >
                Línea {index + 1} · {rows[index].unit_weight_kg} kg / {unitLabels(choiceProduct).singular}
                {" · "}
                {money(Math.round(Number(rows[index].unit_price) * 100))}
              </button>
            ))}
            {choices.some((index) => !canIncrementSaleLine(rows[index], choiceProduct)) && (
              <p role="alert">
                Revisa cantidad, precio y peso antes de añadir otra unidad. La cantidad máxima es 10 000 000.
              </p>
            )}
            <button type="button" className="text-button" onClick={closeChoice}>
              Cancelar selección de línea
            </button>
          </fieldset>
        )}
        <p className="sale-picker-mobile-hint">Desliza para ver las presentaciones.</p>
        <span className="sale-live-message" role="status">
          {announcement}
        </span>
        <p className="sale-weight-help">
          El contenido neto se toma del producto. Las presentaciones de peso fijo no se pueden modificar.
        </p>
        <ul className="sale-lines line-editor" aria-label="Productos de la venta">
          {rows.map((row, index) => {
            const product = find(state, "products", row.product_id);
            const available = product ? stock(state, product.id) : null;
            const unit = unitLabels(row.original_item_id ? row : product);
            const fixed = row.original_item_id
              ? row.weight_policy_snapshot === "FIXED"
              : product && productPresentation(product).weight_policy === "FIXED";
            return (
              <li className="sale-line" key={index}>
                <div className="sale-line-heading">
                  {product && (
                    <span className="sale-line-photo" aria-hidden="true">
                      <ProductImage image={product.image} name={product.name} />
                    </span>
                  )}
                  <label className="field sale-line-product">
                    <span>Producto</span>
                    <select
                      aria-label="Producto"
                      required
                      value={row.product_id}
                      onChange={(event) => update(index, "product_id", event.target.value)}
                    >
                      <option value="">Seleccionar producto</option>
                      {products.map((option) => (
                        <option key={option.id} value={option.id}>
                          {option.name}
                        </option>
                      ))}
                    </select>
                    {available && (
                      <small>
                        Stock: {num(available.quantity)} {unit.plural} · {kg(available.weight_kg)} kg
                      </small>
                    )}
                  </label>
                  <button
                    type="button"
                    className="icon-button danger"
                    aria-label="Quitar producto"
                    title={"Quitar " + (product?.name ?? "línea")}
                    disabled={rows.length === 1}
                    onClick={() => {
                      setRows((current) => current.filter((_, position) => position !== index));
                      setAnnouncement((product?.name ?? "Producto") + " quitado de la venta.");
                    }}
                  >
                    <Trash2 size={17} aria-hidden="true" />
                  </button>
                </div>
                <div className="sale-line-values">
                  <Input
                    label={unit.plural === "sacos" ? "Sacos" : "Cantidad de " + unit.plural}
                    aria-label={"Cantidad de " + unit.plural}
                    type="number"
                    min="1"
                    step="1"
                    required
                    value={row.quantity}
                    onChange={(value) => update(index, "quantity", value)}
                  />
                  <Input
                    label={"Kg / " + unit.singular}
                    aria-label={"Peso por " + unit.singular}
                    type="number"
                    min="0.001"
                    step="0.001"
                    required
                    value={row.unit_weight_kg}
                    readOnly={!!fixed}
                    onChange={(value) => update(index, "unit_weight_kg", value)}
                  />
                  <div>
                    <Input
                      label={"S/ por " + unit.singular}
                      aria-label={"Precio por " + unit.singular}
                      type="number"
                      min="0"
                      step="0.01"
                      required
                      value={row.unit_price}
                      onChange={(value) => update(index, "unit_price", value)}
                    />
                    {product &&
                      product.default_sale_price != null &&
                      Math.round(Number(row.unit_price) * 100) !== product.default_sale_price && (
                        <small className="price-change">Lista: {money(product.default_sale_price)}</small>
                      )}
                  </div>
                  <div className="sale-line-subtotal">
                    <span>Subtotal</span>
                    <strong>{money(Math.round(Number(row.quantity) * Number(row.unit_price) * 100))}</strong>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
        <button
          type="button"
          className="text-button sale-add-line"
          onClick={() => setRows((current) => [...current, createSaleLine()])}
        >
          <Plus size={16} aria-hidden="true" />
          Agregar producto
        </button>
        {children}
      </div>
      <div className="sale-total">
        <span>Total de venta</span>
        <strong>{money(total)}</strong>
      </div>
    </section>
  );
}
