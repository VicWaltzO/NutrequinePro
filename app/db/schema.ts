import { sqliteTable, text, integer, index, uniqueIndex, check } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

// Amounts inside data are integer céntimos; micro fields named hundredths use 0.01 g.
// JSON keeps historical snapshots intact; foreign keys enforce entity links.
const base = () => ({ id: text("id").primaryKey(), data: text("data").notNull() });
export const settings = sqliteTable("settings", {
  id: text("id").primaryKey(),
  data: text("data").notNull(),
  revision: integer("revision").notNull().default(0),
});
export const transactionGuards = sqliteTable(
  "transaction_guards",
  { id: text("id").primaryKey(), accepted: integer("accepted").notNull() },
  (t) => [check("guard_accepted", sql`${t.accepted} = 1`)],
);
export const users = sqliteTable("users", base());
export const customers = sqliteTable("customers", base());
export const sites = sqliteTable("sites", base());
export const customerSites = sqliteTable("customer_sites", {
  ...base(),
  customer_id: text("customer_id")
    .notNull()
    .references(() => customers.id),
  site_id: text("site_id")
    .notNull()
    .references(() => sites.id),
});
export const products = sqliteTable("products", base());
export const ingredients = sqliteTable("ingredients", base());
export const microIngredients = sqliteTable(
  "micro_ingredients",
  {
    ...base(),
    operational_id: integer("operational_id").notNull().unique(),
  },
  (t) => [check("micro_operational_allowed", sql`${t.operational_id} > 0 AND ${t.operational_id} != 14`)],
);
export const microOpenings = sqliteTable("micro_openings", {
  ...base(),
  micro_ingredient_id: text("micro_ingredient_id")
    .notNull()
    .unique()
    .references(() => microIngredients.id),
});
export const formulas = sqliteTable("formulas", {
  ...base(),
  product_id: text("product_id")
    .notNull()
    .references(() => products.id),
});
export const formulaIngredients = sqliteTable("formula_ingredients", {
  ...base(),
  formula_id: text("formula_id")
    .notNull()
    .references(() => formulas.id),
  ingredient_id: text("ingredient_id")
    .notNull()
    .references(() => ingredients.id),
});
export const productions = sqliteTable("productions", base());
export const productionProducts = sqliteTable("production_products", {
  ...base(),
  production_id: text("production_id")
    .notNull()
    .references(() => productions.id),
  product_id: text("product_id")
    .notNull()
    .references(() => products.id),
  formula_id: text("formula_id")
    .notNull()
    .references(() => formulas.id),
});
export const productionIngredients = sqliteTable("production_ingredients", {
  ...base(),
  production_id: text("production_id")
    .notNull()
    .references(() => productions.id),
  ingredient_id: text("ingredient_id")
    .notNull()
    .references(() => ingredients.id),
});
export const productionCosts = sqliteTable("production_costs", {
  ...base(),
  production_id: text("production_id")
    .notNull()
    .references(() => productions.id),
  ingredient_id: text("ingredient_id").references(() => ingredients.id),
});
export const sales = sqliteTable(
  "sales",
  {
    ...base(),
    customer_id: text("customer_id")
      .notNull()
      .references(() => customers.id),
    site_id: text("site_id")
      .notNull()
      .references(() => sites.id),
  },
  (t) => [index("idx_sales_customer").on(t.customer_id)],
);
export const saleItems = sqliteTable("sale_items", {
  ...base(),
  sale_id: text("sale_id")
    .notNull()
    .references(() => sales.id),
  product_id: text("product_id")
    .notNull()
    .references(() => products.id),
});
export const saleProductionLinks = sqliteTable("sale_production_links", {
  ...base(),
  sale_id: text("sale_id")
    .notNull()
    .references(() => sales.id),
  production_id: text("production_id")
    .notNull()
    .references(() => productions.id),
});
export const payments = sqliteTable("payments", {
  ...base(),
  customer_id: text("customer_id")
    .notNull()
    .references(() => customers.id),
});
export const paymentApplications = sqliteTable("payment_applications", {
  ...base(),
  payment_id: text("payment_id")
    .notNull()
    .references(() => payments.id),
  sale_id: text("sale_id")
    .notNull()
    .references(() => sales.id),
});
export const paymentReversals = sqliteTable("payment_reversals", {
  ...base(),
  payment_id: text("payment_id")
    .notNull()
    .references(() => payments.id),
});
export const returns = sqliteTable("returns", {
  ...base(),
  sale_id: text("sale_id")
    .notNull()
    .references(() => sales.id),
});
export const returnItems = sqliteTable("return_items", {
  ...base(),
  return_id: text("return_id")
    .notNull()
    .references(() => returns.id),
  sale_item_id: text("sale_item_id")
    .notNull()
    .references(() => saleItems.id),
});
export const corrections = sqliteTable("corrections", base());
export const correctionFields = sqliteTable("correction_fields", {
  ...base(),
  correction_id: text("correction_id")
    .notNull()
    .references(() => corrections.id),
});
export const expenses = sqliteTable("expenses", {
  ...base(),
  production_id: text("production_id").references(() => productions.id),
  sale_id: text("sale_id").references(() => sales.id),
  site_id: text("site_id").references(() => sites.id),
  ingredient_id: text("ingredient_id").references(() => ingredients.id),
});
export const inventoryMovements = sqliteTable("inventory_movements", base());
export const audit = sqliteTable("audit", base());

export const microPurchases = sqliteTable("micro_purchases", {
  ...base(),
  document_key: text("document_key").notNull().unique(),
  expense_id: text("expense_id")
    .unique()
    .references(() => expenses.id),
});
export const microPurchaseLines = sqliteTable("micro_purchase_lines", {
  ...base(),
  purchase_id: text("purchase_id")
    .notNull()
    .references(() => microPurchases.id),
  micro_ingredient_id: text("micro_ingredient_id")
    .notNull()
    .references(() => microIngredients.id),
});

export const microReceipts = sqliteTable("micro_receipts", {
  ...base(),
  document_key: text("document_key").notNull().unique(),
  expense_id: text("expense_id")
    .unique()
    .references(() => expenses.id),
  request_id: text("request_id").notNull().unique(),
});
export const microReceiptLines = sqliteTable("micro_receipt_lines", {
  ...base(),
  receipt_id: text("receipt_id")
    .notNull()
    .references(() => microReceipts.id),
  micro_ingredient_id: text("micro_ingredient_id")
    .notNull()
    .references(() => microIngredients.id),
});
export const microLedgers = sqliteTable("micro_ledgers", {
  ...base(),
  micro_ingredient_id: text("micro_ingredient_id")
    .notNull()
    .unique()
    .references(() => microIngredients.id),
  opening_id: text("opening_id")
    .notNull()
    .unique()
    .references(() => microOpenings.id),
});
export const microValuationEvents = sqliteTable(
  "micro_valuation_events",
  {
    ...base(),
    ledger_id: text("ledger_id")
      .notNull()
      .references(() => microLedgers.id),
    receipt_line_id: text("receipt_line_id")
      .notNull()
      .unique()
      .references(() => microReceiptLines.id),
    request_id: text("request_id").notNull(),
    revision: integer("revision").notNull(),
  },
  (t) => [
    uniqueIndex("micro_event_ledger_revision").on(t.ledger_id, t.revision),
    uniqueIndex("micro_event_ledger_request").on(t.ledger_id, t.request_id),
  ],
);

export const microFormulas = sqliteTable(
  "micro_formulas",
  {
    ...base(),
    family: text("family").notNull(),
    version: integer("version").notNull(),
  },
  (t) => [
    uniqueIndex("micro_formula_family_version").on(t.family, t.version),
    check("micro_formula_family", sql`${t.family} IN ('ROSADO','VERDE_AMARILLO')`),
    check("micro_formula_version", sql`typeof(${t.version}) = 'integer' AND ${t.version} > 0`),
  ],
);
export const microFormulaLines = sqliteTable(
  "micro_formula_lines",
  {
    ...base(),
    formula_id: text("formula_id")
      .notNull()
      .references(() => microFormulas.id),
    micro_ingredient_id: text("micro_ingredient_id")
      .notNull()
      .references(() => microIngredients.id),
    dose_grams: integer("dose_grams").notNull(),
  },
  (t) => [
    uniqueIndex("micro_formula_line_identity").on(t.formula_id, t.micro_ingredient_id),
    check(
      "micro_formula_positive_dose",
      sql`typeof(${t.dose_grams}) = 'integer' AND ${t.dose_grams} > 0 AND ${t.dose_grams} <= 1000000000000`,
    ),
  ],
);
export const microFormulaHeads = sqliteTable(
  "micro_formula_heads",
  {
    ...base(),
    family: text("family").notNull().unique(),
    active_formula_id: text("active_formula_id")
      .unique()
      .references(() => microFormulas.id),
    version: integer("version").notNull(),
  },
  (t) => [
    check("micro_head_family", sql`${t.family} IN ('ROSADO','VERDE_AMARILLO')`),
    check("micro_head_version", sql`typeof(${t.version}) = 'integer' AND ${t.version} > 0`),
  ],
);

export const microPreparations = sqliteTable(
  "micro_preparations",
  {
    ...base(),
    formula_id: text("formula_id")
      .notNull()
      .references(() => microFormulas.id),
    request_id: text("request_id").notNull().unique(),
    family: text("family").notNull(),
    nuclei_hundredths: integer("nuclei_hundredths").notNull(),
  },
  (t) => [
    check("micro_preparation_family", sql`${t.family} IN ('ROSADO','VERDE_AMARILLO')`),
    check(
      "micro_preparation_quantity",
      sql`typeof(${t.nuclei_hundredths}) = 'integer' AND ${t.nuclei_hundredths} > 0 AND ${t.nuclei_hundredths} <= 1000000000`,
    ),
  ],
);

export const microAssignments = sqliteTable("micro_assignments", {
  ...base(),
  preparation_id: text("preparation_id")
    .notNull()
    .references(() => microPreparations.id),
  request_id: text("request_id").notNull().unique(),
});
export const microAssignmentLines = sqliteTable(
  "micro_assignment_lines",
  {
    ...base(),
    assignment_id: text("assignment_id")
      .notNull()
      .references(() => microAssignments.id),
    formula_line_id: text("formula_line_id")
      .notNull()
      .references(() => microFormulaLines.id),
    micro_ingredient_id: text("micro_ingredient_id")
      .notNull()
      .references(() => microIngredients.id),
    quantity_hundredths: integer("quantity_hundredths").notNull(),
  },
  (t) => [
    uniqueIndex("micro_assignment_line_identity").on(t.assignment_id, t.micro_ingredient_id),
    check(
      "micro_assignment_quantity",
      sql`typeof(${t.quantity_hundredths}) = 'integer' AND ${t.quantity_hundredths} > 0 AND ${t.quantity_hundredths} <= 9007199254740991`,
    ),
  ],
);
export const microAssignmentReversals = sqliteTable("micro_assignment_reversals", {
  ...base(),
  assignment_id: text("assignment_id")
    .notNull()
    .unique()
    .references(() => microAssignments.id),
  request_id: text("request_id").notNull().unique(),
});

export const microConfirmations = sqliteTable(
  "micro_confirmations",
  {
    ...base(),
    preparation_id: text("preparation_id")
      .notNull()
      .unique()
      .references(() => microPreparations.id),
    assignment_id: text("assignment_id")
      .notNull()
      .unique()
      .references(() => microAssignments.id),
    formula_id: text("formula_id")
      .notNull()
      .references(() => microFormulas.id),
    request_id: text("request_id").notNull().unique(),
    nuclei_hundredths: integer("nuclei_hundredths").notNull(),
  },
  (t) => [
    check(
      "micro_confirmation_quantity",
      sql`typeof(${t.nuclei_hundredths}) = 'integer' AND ${t.nuclei_hundredths} > 0 AND ${t.nuclei_hundredths} <= 1000000000`,
    ),
  ],
);
export const microSubstitutions = sqliteTable(
  "micro_substitutions",
  {
    ...base(),
    policy_id: text("policy_id").notNull().unique(),
    request_id: text("request_id").notNull().unique(),
    rosado_formula_id: text("rosado_formula_id")
      .notNull()
      .unique()
      .references(() => microFormulas.id),
    verde_formula_id: text("verde_formula_id")
      .notNull()
      .unique()
      .references(() => microFormulas.id),
    source_rosado_id: text("source_rosado_id")
      .notNull()
      .references(() => microFormulas.id),
    source_verde_id: text("source_verde_id")
      .notNull()
      .references(() => microFormulas.id),
    from_ingredient_id: text("from_ingredient_id")
      .notNull()
      .references(() => microIngredients.id),
    to_ingredient_id: text("to_ingredient_id")
      .notNull()
      .references(() => microIngredients.id),
  },
  (t) => [check("micro_substitution_distinct", sql`${t.from_ingredient_id} <> ${t.to_ingredient_id}`)],
);
export const microSupersessions = sqliteTable(
  "micro_supersessions",
  {
    ...base(),
    source_id: text("source_id")
      .notNull()
      .unique()
      .references(() => microPreparations.id),
    target_id: text("target_id")
      .notNull()
      .unique()
      .references(() => microPreparations.id),
    substitution_id: text("substitution_id")
      .notNull()
      .references(() => microSubstitutions.id),
    request_id: text("request_id").notNull().unique(),
  },
  (t) => [check("micro_supersession_distinct", sql`${t.source_id} <> ${t.target_id}`)],
);
export const microPreparationGroups = sqliteTable(
  "micro_preparation_groups",
  {
    ...base(),
    preparation_id: text("preparation_id")
      .notNull()
      .unique()
      .references(() => microPreparations.id),
    group_reference: text("group_reference").notNull(),
  },
  (t) => [check("micro_group_reference", sql`length(trim(${t.group_reference})) BETWEEN 1 AND 100`)],
);
export const microIssues = sqliteTable(
  "micro_issues",
  {
    ...base(),
    confirmation_id: text("confirmation_id")
      .notNull()
      .references(() => microConfirmations.id),
    assignment_line_id: text("assignment_line_id")
      .notNull()
      .unique()
      .references(() => microAssignmentLines.id),
    formula_line_id: text("formula_line_id")
      .notNull()
      .references(() => microFormulaLines.id),
    micro_ingredient_id: text("micro_ingredient_id")
      .notNull()
      .references(() => microIngredients.id),
    ledger_id: text("ledger_id")
      .notNull()
      .references(() => microLedgers.id),
    request_id: text("request_id").notNull(),
    revision: integer("revision").notNull(),
    quantity_hundredths: integer("quantity_hundredths").notNull(),
  },
  (t) => [
    uniqueIndex("micro_issue_identity").on(t.confirmation_id, t.micro_ingredient_id),
    uniqueIndex("micro_issue_ledger_revision").on(t.ledger_id, t.revision),
    uniqueIndex("micro_issue_ledger_request").on(t.ledger_id, t.request_id),
    check(
      "micro_issue_quantity",
      sql`typeof(${t.quantity_hundredths}) = 'integer' AND ${t.quantity_hundredths} > 0 AND ${t.quantity_hundredths} <= 100000000000000`,
    ),
  ],
);

// Planning references do not create inventory or cost ledger entries.
export const productionJourneys = sqliteTable("production_journeys", {
  ...base(),
  request_id: text("request_id").notNull().unique(),
});
export const productionJourneyLines = sqliteTable(
  "production_journey_lines",
  {
    ...base(),
    journey_id: text("journey_id")
      .notNull()
      .references(() => productionJourneys.id),
    product_id: text("product_id")
      .notNull()
      .references(() => products.id),
    formula_id: text("formula_id")
      .notNull()
      .references(() => formulas.id),
    micro_formula_id: text("micro_formula_id")
      .notNull()
      .references(() => microFormulas.id),
    nuclei_hundredths: integer("nuclei_hundredths").notNull(),
    family: text("family").notNull(),
  },
  (t) => [
    uniqueIndex("journey_product_unique").on(t.journey_id, t.product_id),
    check("journey_nuclei_positive", sql`${t.nuclei_hundredths} BETWEEN 1 AND 1000000000000`),
    check("journey_family", sql`${t.family} IN ('ROSADO','VERDE_AMARILLO')`),
  ],
);
export const productionJourneyLinks = sqliteTable(
  "production_journey_links",
  {
    ...base(),
    line_id: text("line_id")
      .notNull()
      .references(() => productionJourneyLines.id),
    preparation_id: text("preparation_id")
      .notNull()
      .references(() => microPreparations.id),
    confirmation_id: text("confirmation_id")
      .notNull()
      .references(() => microConfirmations.id),
    nuclei_hundredths: integer("nuclei_hundredths").notNull(),
    request_id: text("request_id").notNull().unique(),
  },
  (t) => [check("journey_link_positive", sql`${t.nuclei_hundredths} BETWEEN 1 AND 1000000000000`)],
);

export const millClosures = sqliteTable(
  "mill_closures",
  {
    ...base(),
    journey_id: text("journey_id")
      .notNull()
      .references(() => productionJourneys.id),
    line_id: text("line_id")
      .notNull()
      .unique()
      .references(() => productionJourneyLines.id),
    product_id: text("product_id")
      .notNull()
      .references(() => products.id),
    request_id: text("request_id").notNull().unique(),
    actual_bags: integer("actual_bags").notNull(),
    waste_grams: integer("waste_grams").notNull(),
    movement_id: text("movement_id")
      .unique()
      .references(() => inventoryMovements.id),
  },
  (t) => [
    check(
      "mill_bags_integer",
      sql`typeof(${t.actual_bags}) = 'integer' AND ${t.actual_bags} BETWEEN 0 AND 1000000000000`,
    ),
    check(
      "mill_waste_integer",
      sql`typeof(${t.waste_grams}) = 'integer' AND ${t.waste_grams} BETWEEN 0 AND 1000000000000`,
    ),
  ],
);
