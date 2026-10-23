import { requireValue, scaled, positiveInt, pick, multiply } from "../../../shared/domain/core.mjs";
import { deliveryAvailability } from "../../inventario/domain/stock.mjs";
import {
  presentationSnapshot,
  productPresentation,
  assertUnitWeight,
  unitLabels,
} from "../../../shared/domain/presentation.mjs";
export function createSaleOperations(context) {
  const { movement, s: state, p: payload } = context;
  const saleItems = (sale_id, rows, old = []) => {
    requireValue(Array.isArray(rows) && rows.length > 0, "Agregue al menos un producto.");
    return rows.map((r) => {
      const product = pick(state, "products", r.product_id);
      requireValue(
        product.is_active && product.is_sellable,
        "El producto debe estar activo y habilitado para venta.",
      );
      const quantity = positiveInt(r.quantity);
      const prev = old.find((x) => x.id === r.original_item_id && x.product_id === product.id);
      const snapshot = presentationSnapshot(prev ?? product, !!prev);
      const weight = scaled(
        r.unit_weight_kg ?? (prev?.unit_weight_kg ?? productPresentation(product).unit_weight_grams) / 1000,
        3,
      );
      requireValue(weight > 0, "El peso debe ser mayor que cero.");
      assertUnitWeight(snapshot, weight);
      requireValue(
        prev || product.default_sale_price != null,
        "Configure el precio base del producto antes de vender.",
      );
      const price = scaled(r.unit_price ?? (prev?.unit_price ?? product.default_sale_price) / 100);
      return {
        ...snapshot,
        sale_id,
        product_id: product.id,
        quantity,
        unit_weight_kg: weight,
        total_weight_kg: multiply(quantity, weight),
        reference_unit_weight_kg:
          prev?.reference_unit_weight_kg ?? productPresentation(product).unit_weight_grams,
        reference_unit_price: prev?.reference_unit_price ?? product.default_sale_price,
        unit_price: price,
        subtotal: multiply(quantity, price),
        is_current: true,
      };
    });
  };
  const assertStock = (rows, allowOld = []) => {
    const missing = deliveryAvailability(state, rows, allowOld).filter(
      (x) => x.missing_quantity || x.missing_weight,
    );
    requireValue(
      !missing.length,
      "Stock físico insuficiente. " +
        missing
          .map(
            (x) =>
              pick(state, "products", x.product_id).name +
              ": disponibles " +
              x.quantity +
              " " +
              unitLabels(pick(state, "products", x.product_id)).plural +
              " / " +
              x.weight_kg / 1000 +
              " kg; venta " +
              x.requested +
              " " +
              unitLabels(pick(state, "products", x.product_id)).plural +
              " / " +
              x.weight / 1000 +
              " kg; faltan " +
              x.missing_quantity +
              " " +
              unitLabels(pick(state, "products", x.product_id)).plural +
              " / " +
              x.missing_weight / 1000 +
              " kg.",
          )
          .join(" "),
    );
  };
  const outputSale = (sale, rows, mult = 1, kind = "SALE_OUT") =>
    rows.forEach((x) =>
      movement({
        ...presentationSnapshot(x, true),
        item_type: "PRODUCT",
        item_id: x.product_id,
        movement_type: kind,
        quantity: -mult * x.quantity,
        weight_kg: -mult * x.total_weight_kg,
        source_type: "SALE",
        source_id: sale.id,
        notes: payload.reason ?? sale.code,
      }),
    );
  return { saleItems, assertStock, outputSale };
}
