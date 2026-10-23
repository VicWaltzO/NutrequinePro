import { requireValue, pick, scaled, positiveInt, normalize } from "../shared/domain/core.mjs";

const common = ["id", "name", "is_active"];
const siteFields = ["site_ids", "new_sites", "default_site_id"];
const contact = ["tax_id", "contact_name", "phone", "address", "notes"];
const immutable = ["created_at", "created_by", "updated_at"];
const contracts = {
  CUSTOMER_SAVE: [
    ...common,
    ...contact,
    ...siteFields,
    "confirm_duplicate",
    "code",
    ...immutable,
    "deleted_at",
    "deleted_by",
  ],
  CUSTOMER_SITES_SAVE: ["id", ...siteFields],
  SITE_SAVE: [...common, ...immutable],
  PRODUCT_SAVE: [
    ...common,
    "category",
    "default_sale_price",
    "standard_bag_weight_kg",
    "bags_per_nucleus",
    "commercial_weight_per_nucleus_kg",
    "unit_weight_grams",
    "presentation_unit",
    "weight_policy",
    "stock_entry_mode",
    "is_sellable",
    "image",
    ...immutable,
  ],
  INGREDIENT_SAVE: [...common, "current_price_per_kg", ...immutable],
  CUSTOMER_DELETE: ["id"],
  CONFIG_SAVE: [
    "company_name",
    "tax_id",
    "address",
    "phone",
    "contact_email",
    "default_nucleus_cost",
    "default_packaging_cost",
    "expense_categories",
    "default_payment_condition",
    "default_payment_method",
    "default_expense_category",
    "currency",
    "timezone",
    "categories_text",
  ],
  USER_SAVE: [...common, "role", ...immutable],
};
const tables = {
  CUSTOMER_SAVE: "customers",
  CUSTOMER_SITES_SAVE: "customers",
  CUSTOMER_DELETE: "customers",
  SITE_SAVE: "sites",
  PRODUCT_SAVE: "products",
  INGREDIENT_SAVE: "ingredients",
  USER_SAVE: "users",
};
function string(value, field, { required = false, max = 2000 } = {}) {
  requireValue(
    typeof value === "string" && value.length <= max && (!required || value.trim().length > 0),
    "Texto inválido: " + field + ".",
  );
}
function identifier(value, field = "id") {
  string(value, field, { required: true });
  const hasControl = [...value].some((character) => {
    const code = character.codePointAt(0);
    return code < 32 || code === 127;
  });
  requireValue(!/\s/u.test(value) && !hasControl, "Identificador inválido: " + field + ".");
}
function boolean(value, field) {
  requireValue(typeof value === "boolean", "Indicador inválido: " + field + ".");
}
function decimal(value, field, digits = 2) {
  requireValue(typeof value === "string" || typeof value === "number", "Número inválido: " + field + ".");
  scaled(value, digits);
}
function integer(value, field) {
  requireValue(
    (typeof value === "number" && Number.isInteger(value)) ||
      (typeof value === "string" && /^\d+$/.test(value)),
    "Entero inválido: " + field + ".",
  );
  positiveInt(value, field);
}
function enumeration(value, field, values) {
  requireValue(values.includes(value), "Valor inválido: " + field + ".");
}
function list(value, field) {
  requireValue(
    Array.isArray(value) && value.length <= 100,
    "Lista inválida de sedes/categorías: " + field + ".",
  );
}
function sites(state, payload) {
  if (payload.site_ids !== undefined) {
    list(payload.site_ids, "site_ids");
    for (const id of payload.site_ids) {
      identifier(id, "site_ids");
      pick(state, "sites", id);
    }
    requireValue(new Set(payload.site_ids).size === payload.site_ids.length, "No repita sedes vinculadas.");
  }
  if (payload.new_sites !== undefined) {
    list(payload.new_sites, "new_sites");
    for (const name of payload.new_sites) string(name, "new_sites", { required: true });
    requireValue(
      new Set(payload.new_sites.map(normalize)).size === payload.new_sites.length,
      "No repita nombres de sedes nuevas.",
    );
  }
  if (payload.default_site_id !== undefined) {
    string(payload.default_site_id, "default_site_id");
    if (payload.default_site_id) {
      identifier(payload.default_site_id, "default_site_id");
      const selected = payload.default_site_id;
      const valid = /^new:\d+$/.test(selected)
        ? Number(selected.slice(4)) < (payload.new_sites?.length ?? 0)
        : (payload.site_ids ?? []).includes(selected);
      requireValue(valid, "La sede principal debe estar vinculada al cliente.");
    }
  }
}

/** Validate commands before context creation, mutation or a persistence write plan.
 * Unchanged read-only echoes keep legacy edit clients compatible; they grant no write access.
 */
export function validateMasterCommand(state, type, payload) {
  if (!Object.hasOwn(contracts, type)) return;
  requireValue(
    payload !== null &&
      typeof payload === "object" &&
      !Array.isArray(payload) &&
      [Object.prototype, null].includes(Object.getPrototypeOf(payload)),
    "Datos de maestro inválidos.",
  );
  for (const field of Object.keys(payload))
    requireValue(contracts[type].includes(field), "Campo no permitido: " + field + ".");
  if (payload.id !== undefined) identifier(payload.id);
  let old;
  if (tables[type] && payload.id !== undefined) {
    old =
      type === "USER_SAVE"
        ? state.users.find((row) => row.id === payload.id)
        : pick(state, tables[type], payload.id);
  }
  if (["CUSTOMER_SITES_SAVE", "CUSTOMER_DELETE", "USER_SAVE"].includes(type)) identifier(payload.id);
  for (const field of [...immutable, "code", "deleted_at", "deleted_by"]) {
    if (Object.hasOwn(payload, field))
      requireValue(
        old && Object.hasOwn(old, field) && payload[field] === old[field],
        "Campo de solo lectura: " + field + ".",
      );
  }
  if (tables[type] && !["CUSTOMER_SITES_SAVE", "CUSTOMER_DELETE"].includes(type))
    string(payload.name, "name", { required: true });
  if (payload.is_active !== undefined) boolean(payload.is_active, "is_active");
  if (type === "CUSTOMER_SAVE") {
    for (const field of contact) if (payload[field] !== undefined) string(payload[field], field);
    if (payload.confirm_duplicate !== undefined) boolean(payload.confirm_duplicate, "confirm_duplicate");
  }
  if (["CUSTOMER_SAVE", "CUSTOMER_SITES_SAVE"].includes(type)) sites(state, payload);
  if (type === "INGREDIENT_SAVE") decimal(payload.current_price_per_kg, "current_price_per_kg");
  if (type === "PRODUCT_SAVE") {
    if (payload.category !== undefined) string(payload.category, "category", { required: true });
    if (payload.is_sellable !== undefined) boolean(payload.is_sellable, "is_sellable");
    if (
      payload.default_sale_price !== undefined &&
      payload.default_sale_price !== null &&
      payload.default_sale_price !== ""
    )
      decimal(payload.default_sale_price, "default_sale_price");
    for (const field of ["standard_bag_weight_kg", "commercial_weight_per_nucleus_kg"])
      if (payload[field] !== undefined) decimal(payload[field], field, 3);
    for (const field of ["unit_weight_grams", "bags_per_nucleus"])
      if (payload[field] !== undefined) integer(payload[field], field);
    if (payload.presentation_unit !== undefined)
      enumeration(payload.presentation_unit, "presentation_unit", ["BAG", "BOTTLE", "UNIT"]);
    if (payload.weight_policy !== undefined)
      enumeration(payload.weight_policy, "weight_policy", ["FIXED", "VARIABLE"]);
    if (payload.stock_entry_mode !== undefined)
      enumeration(payload.stock_entry_mode, "stock_entry_mode", ["NUCLEUS_PRODUCTION", "DIRECT_STOCK"]);
    if (payload.image !== undefined && payload.image !== null) {
      string(payload.image, "image", { max: 200024 });
      requireValue(
        payload.image === "" ||
          ["nutrelin", "hi-performance", "potripregnant"].includes(payload.image) ||
          /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(payload.image),
        "Fotografía inválida.",
      );
    }
  }
  if (type === "USER_SAVE") enumeration(payload.role, "role", ["ADMIN", "OPERATOR", "VIEWER"]);
  if (type === "CONFIG_SAVE") {
    string(payload.company_name, "company_name", { required: true });
    for (const field of ["tax_id", "address", "phone", "contact_email"])
      if (payload[field] !== undefined) string(payload[field], field);
    decimal(payload.default_nucleus_cost, "default_nucleus_cost");
    decimal(payload.default_packaging_cost, "default_packaging_cost");
    if (payload.expense_categories !== undefined) {
      list(payload.expense_categories, "expense_categories");
      requireValue(payload.expense_categories.length > 0, "Agregue categorías.");
      for (const category of payload.expense_categories)
        string(category, "expense_categories", { required: true });
    }
    if (payload.default_payment_condition !== undefined)
      enumeration(payload.default_payment_condition, "default_payment_condition", ["CASH", "CREDIT"]);
    if (payload.default_payment_method !== undefined)
      enumeration(payload.default_payment_method, "default_payment_method", [
        "",
        "CASH",
        "TRANSFER",
        "CHECK",
      ]);
    if (payload.default_expense_category !== undefined)
      string(payload.default_expense_category, "default_expense_category", { required: true });
    // Existing forms send these fields, but currency/timezone remain immutable.
    for (const field of ["currency", "timezone"])
      if (Object.hasOwn(payload, field)) {
        string(payload[field], field, { required: true });
        requireValue(payload[field] === state.config[field], "Campo de solo lectura: " + field + ".");
      }
    // UI-only text is explicitly typed and ignored by configSave.
    if (payload.categories_text !== undefined)
      string(payload.categories_text, "categories_text", { max: 202000 });
  }
}
