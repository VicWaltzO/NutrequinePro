import { requireValue, normalize, scaled, positiveInt, text, pick } from "../../../shared/domain/core.mjs";
export function customerSave(context) {
  const { s, type, p, actor, clock, add, code, correction } = context;
  let result = null;
  const table = {
    CUSTOMER_SAVE: "customers",
    SITE_SAVE: "sites",
    PRODUCT_SAVE: "products",
    INGREDIENT_SAVE: "ingredients",
  }[type];
  if (["products", "ingredients"].includes(table))
    requireValue(actor.role === "ADMIN", "Requiere administrador.");
  const old = p.id ? pick(s, table, p.id) : null;
  const v = { name: text(p.name, "Nombre"), is_active: p.is_active !== false, updated_at: clock };
  if (table === "customers") {
    Object.assign(v, {
      tax_id: p.tax_id ?? "",
      contact_name: p.contact_name ?? "",
      phone: p.phone ?? "",
      address: p.address ?? "",
      notes: p.notes ?? "",
    });
    const dup = s.customers.find((x) => x.id !== p.id && normalize(x.name) === normalize(v.name));
    requireValue(
      !dup || p.confirm_duplicate,
      "Posible cliente duplicado. Confirme explícitamente para continuar.",
    );
  }
  if (table === "products") {
    Object.assign(v, {
      category: p.category ?? "PREMIUM",
      default_sale_price: scaled(p.default_sale_price),
      standard_bag_weight_kg: scaled(p.standard_bag_weight_kg, 3),
      bags_per_nucleus: positiveInt(p.bags_per_nucleus, "Sacos por núcleo"),
      commercial_weight_per_nucleus_kg: scaled(p.commercial_weight_per_nucleus_kg, 3),
      is_sellable: !!p.is_sellable,
      image: old?.image ?? null,
    });
    requireValue(
      v.standard_bag_weight_kg > 0 && v.commercial_weight_per_nucleus_kg > 0,
      "Los pesos deben ser mayores que cero.",
    );
  }
  if (table === "ingredients") v.current_price_per_kg = scaled(p.current_price_per_kg);
  if (old) {
    correction(table, old.id, structuredClone(old), { ...old, ...v }, "Actualización de maestro");
    Object.assign(old, v);
    result = old.id;
  } else result = add(table, { ...v, ...(table === "customers" ? { code: code(table, "CL") } : {}) }).id;
  if (table === "customers" && p.site_ids) {
    s.customerSites.filter((x) => x.customer_id === result).forEach((x) => (x.is_active = false));
    p.site_ids.forEach((id, i) => {
      pick(s, "sites", id);
      const link = s.customerSites.find((x) => x.customer_id === result && x.site_id === id);
      if (link) Object.assign(link, { is_active: true, is_default: i === 0 });
      else add("customerSites", { customer_id: result, site_id: id, is_default: i === 0, is_active: true });
    });
  }
  return result;
}
export function configSave(context) {
  const { s, p, correction } = context;
  let result = null;
  const old = structuredClone(s.config);
  const categories = p.expense_categories ?? s.config.expense_categories;
  requireValue(Array.isArray(categories) && categories.length > 0, "Agregue categorías.");
  const expense_categories = [...new Set(categories.map((x) => text(x, "Categoría")))];
  const condition = p.default_payment_condition ?? s.config.default_payment_condition ?? "CREDIT";
  const method = p.default_payment_method ?? s.config.default_payment_method ?? "";
  const category =
    p.default_expense_category ??
    (expense_categories.includes(s.config.default_expense_category)
      ? s.config.default_expense_category
      : expense_categories[0]);
  requireValue(["CASH", "CREDIT"].includes(condition), "Condición de pago inválida.");
  requireValue(["", "CASH", "TRANSFER", "CHECK"].includes(method), "Método de pago predeterminado inválido.");
  requireValue(
    expense_categories.includes(category),
    "La categoría predeterminada debe pertenecer a las categorías de gastos.",
  );
  const contact = {};
  for (const key of ["tax_id", "address", "phone", "contact_email"]) {
    if (p[key] !== undefined) {
      requireValue(typeof p[key] === "string" && p[key].length <= 2000, "Datos de empresa inválidos.");
      contact[key] = p[key].trim();
    }
  }
  if (contact.contact_email)
    requireValue(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact.contact_email), "Correo de contacto inválido.");
  s.config = {
    ...s.config,
    ...contact,
    company_name: text(p.company_name, "Empresa"),
    default_nucleus_cost: scaled(p.default_nucleus_cost),
    default_packaging_cost: scaled(p.default_packaging_cost),
    expense_categories,
    default_payment_condition: condition,
    default_payment_method: method,
    default_expense_category: category,
  };
  correction("CONFIG", "company", old, s.config, "Actualización de configuración");
  return result;
}
export function userSave(context) {
  const { s, p, clock, add, correction } = context;
  let result = null;
  requireValue(["ADMIN", "OPERATOR", "VIEWER"].includes(p.role), "Rol inválido.");
  const old = s.users.find((x) => x.id === p.id);
  const v = {
    id: text(p.id, "ID autenticado"),
    name: text(p.name, "Nombre"),
    role: p.role,
    is_active: p.is_active !== false,
    updated_at: clock,
  };
  if (old) {
    requireValue(
      !(
        old.role === "ADMIN" &&
        (!v.is_active || v.role !== "ADMIN") &&
        s.users.filter((x) => x.role === "ADMIN" && x.is_active).length === 1
      ),
      "Debe conservar al menos un administrador activo.",
    );
    correction("USER", old.id, structuredClone(old), v, "Actualización de permisos");
    Object.assign(old, v);
  } else add("users", v);
  result = v.id;
  return result;
}
