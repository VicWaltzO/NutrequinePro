import { requireValue, normalize, scaled, positiveInt, text, pick } from "../../../shared/domain/core.mjs";
import { saveCustomerSites } from "../../clientes/domain/sites.mjs";
import {
  productPresentation,
  validatePresentation,
  isNucleusProduct,
  validateNucleusWeight,
} from "../../../shared/domain/presentation.mjs";
export function customerSave(context) {
  const { s: state, type, p: payload, actor, clock, add, code, correction } = context;
  let result = null;
  const table = {
    CUSTOMER_SAVE: "customers",
    SITE_SAVE: "sites",
    PRODUCT_SAVE: "products",
    INGREDIENT_SAVE: "ingredients",
  }[type];
  if (["products", "ingredients"].includes(table))
    requireValue(actor.role === "ADMIN", "Requiere administrador.");
  const old = payload.id ? pick(state, table, payload.id) : null;
  const v = { name: text(payload.name, "Nombre"), is_active: payload.is_active !== false, updated_at: clock };
  if (table === "customers") {
    Object.assign(v, {
      tax_id: payload.tax_id ?? "",
      contact_name: payload.contact_name ?? "",
      phone: payload.phone ?? "",
      address: payload.address ?? "",
      notes: payload.notes ?? "",
    });
    const dup = state.customers.find((x) => x.id !== payload.id && normalize(x.name) === normalize(v.name));
    requireValue(
      !dup || payload.confirm_duplicate,
      "Posible cliente duplicado. Confirme explícitamente para continuar.",
    );
  }
  if (table === "products") {
    requireValue(
      old || payload.unit_weight_grams !== undefined || payload.standard_bag_weight_kg !== undefined,
      "Registre el contenido neto por unidad.",
    );
    requireValue(
      !state.products.some((x) => x.id !== payload.id && normalize(x.name) === normalize(v.name)),
      "Ya existe un producto con ese nombre; edite su ficha.",
    );
    const previousPresentation = productPresentation(old ?? {});
    let unitWeight = previousPresentation.unit_weight_grams;
    if (payload.unit_weight_grams !== undefined)
      unitWeight = positiveInt(payload.unit_weight_grams, "Contenido neto en gramos");
    else if (payload.standard_bag_weight_kg !== undefined)
      unitWeight = scaled(payload.standard_bag_weight_kg, 3);
    const presentation = {
      ...productPresentation(old ?? {}),
      ...Object.fromEntries(
        ["presentation_unit", "weight_policy", "stock_entry_mode"]
          .filter((key) => payload[key] !== undefined)
          .map((key) => [key, payload[key]]),
      ),
      unit_weight_grams: unitWeight,
    };
    validatePresentation(presentation);
    if (
      old &&
      (state.saleItems.some((x) => x.product_id === old.id) ||
        state.inventoryMovements.some((x) => x.item_type === "PRODUCT" && x.item_id === old.id) ||
        state.productionProducts.some((x) => x.product_id === old.id))
    ) {
      requireValue(
        JSON.stringify(productPresentation(old)) === JSON.stringify(presentation),
        "La presentación tiene historial. Cree otra presentación para cambiar unidad, peso o modalidad de ingreso.",
      );
    }
    const priceInput = payload.default_sale_price;
    const price = priceInput === "" || priceInput == null ? null : scaled(priceInput);
    requireValue(
      !payload.is_sellable || price !== null,
      "Registre el precio base antes de habilitar la venta.",
    );
    const image = payload.image === undefined ? (old?.image ?? null) : payload.image || null;
    requireValue(
      image === null ||
        (typeof image === "string" &&
          (["nutrelin", "hi-performance", "potripregnant"].includes(image) ||
            (image.length <= 200024 &&
              /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(image)))),
      "Use una fotografía JPEG, PNG o WebP de hasta 150 KB.",
    );
    Object.assign(v, {
      category: payload.category ?? "PREMIUM",
      ...presentation,
      default_sale_price: price,
      ...(presentation.presentation_unit === "BAG"
        ? { standard_bag_weight_kg: presentation.unit_weight_grams }
        : {}),
      is_sellable: !!payload.is_sellable,
      image,
    });
    if (isNucleusProduct(v)) {
      v.bags_per_nucleus = positiveInt(payload.bags_per_nucleus ?? old?.bags_per_nucleus, "Sacos por núcleo");
      v.commercial_weight_per_nucleus_kg =
        payload.commercial_weight_per_nucleus_kg === undefined && old
          ? old.commercial_weight_per_nucleus_kg
          : scaled(payload.commercial_weight_per_nucleus_kg, 3);
      requireValue(v.commercial_weight_per_nucleus_kg > 0, "Los pesos deben ser mayores que cero.");
      validateNucleusWeight(v);
    }
  }
  if (table === "ingredients") v.current_price_per_kg = scaled(payload.current_price_per_kg);
  if (old) {
    correction(table, old.id, structuredClone(old), { ...old, ...v }, "Actualización de maestro");
    Object.assign(old, v);
    result = old.id;
  } else result = add(table, { ...v, ...(table === "customers" ? { code: code(table, "CL") } : {}) }).id;
  if (table === "customers") saveCustomerSites(context, result);
  return result;
}
export function configSave(context) {
  const { s: state, p: payload, correction } = context;
  let result = null;
  const old = structuredClone(state.config);
  const categories = payload.expense_categories ?? state.config.expense_categories;
  requireValue(Array.isArray(categories) && categories.length > 0, "Agregue categorías.");
  const expense_categories = [...new Set(categories.map((x) => text(x, "Categoría")))];
  const condition = payload.default_payment_condition ?? state.config.default_payment_condition ?? "CREDIT";
  const method = payload.default_payment_method ?? state.config.default_payment_method ?? "";
  const category =
    payload.default_expense_category ??
    (expense_categories.includes(state.config.default_expense_category)
      ? state.config.default_expense_category
      : expense_categories[0]);
  requireValue(["CASH", "CREDIT"].includes(condition), "Condición de pago inválida.");
  requireValue(["", "CASH", "TRANSFER", "CHECK"].includes(method), "Método de pago predeterminado inválido.");
  requireValue(
    expense_categories.includes(category),
    "La categoría predeterminada debe pertenecer a las categorías de gastos.",
  );
  const contact = {};
  for (const key of ["tax_id", "address", "phone", "contact_email"]) {
    if (payload[key] !== undefined) {
      requireValue(
        typeof payload[key] === "string" && payload[key].length <= 2000,
        "Datos de empresa inválidos.",
      );
      contact[key] = payload[key].trim();
    }
  }
  if (contact.contact_email)
    requireValue(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact.contact_email), "Correo de contacto inválido.");
  state.config = {
    ...state.config,
    ...contact,
    company_name: text(payload.company_name, "Empresa"),
    default_nucleus_cost: scaled(payload.default_nucleus_cost),
    default_packaging_cost: scaled(payload.default_packaging_cost),
    expense_categories,
    default_payment_condition: condition,
    default_payment_method: method,
    default_expense_category: category,
  };
  correction("CONFIG", "company", old, state.config, "Actualización de configuración");
  return result;
}
export function userSave(context) {
  const { s: state, p: payload, clock, add, correction } = context;
  let result = null;
  requireValue(["ADMIN", "OPERATOR", "VIEWER"].includes(payload.role), "Rol inválido.");
  const old = state.users.find((x) => x.id === payload.id);
  const v = {
    id: text(payload.id, "ID autenticado"),
    name: text(payload.name, "Nombre"),
    role: payload.role,
    is_active: payload.is_active !== false,
    updated_at: clock,
  };
  if (old) {
    requireValue(
      !(
        old.role === "ADMIN" &&
        (!v.is_active || v.role !== "ADMIN") &&
        state.users.filter((x) => x.role === "ADMIN" && x.is_active).length === 1
      ),
      "Debe conservar al menos un administrador activo.",
    );
    correction("USER", old.id, structuredClone(old), v, "Actualización de permisos");
    Object.assign(old, v);
  } else add("users", v);
  result = v.id;
  return result;
}
