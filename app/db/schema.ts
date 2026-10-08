import { sqliteTable, text, integer, index, check } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

// Amounts inside data are integer céntimos; weights are integer grams.
// JSON keeps historical snapshots intact; foreign keys enforce entity links.
const base = () => ({ id: text('id').primaryKey(), data: text('data').notNull() });
export const settings = sqliteTable('settings', { id: text('id').primaryKey(), data: text('data').notNull(), revision: integer('revision').notNull().default(0) });
export const transactionGuards = sqliteTable('transaction_guards', { id: text('id').primaryKey(), accepted: integer('accepted').notNull() }, t => [check('guard_accepted', sql`${t.accepted} = 1`)]);
export const users = sqliteTable('users', base());
export const customers = sqliteTable('customers', base());
export const sites = sqliteTable('sites', base());
export const customerSites = sqliteTable('customer_sites', { ...base(), customer_id: text('customer_id').notNull().references(() => customers.id), site_id: text('site_id').notNull().references(() => sites.id) });
export const products = sqliteTable('products', base());
export const ingredients = sqliteTable('ingredients', base());
export const formulas = sqliteTable('formulas', { ...base(), product_id: text('product_id').notNull().references(() => products.id) });
export const formulaIngredients = sqliteTable('formula_ingredients', { ...base(), formula_id: text('formula_id').notNull().references(() => formulas.id), ingredient_id: text('ingredient_id').notNull().references(() => ingredients.id) });
export const productions = sqliteTable('productions', base());
export const productionProducts = sqliteTable('production_products', { ...base(), production_id: text('production_id').notNull().references(() => productions.id), product_id: text('product_id').notNull().references(() => products.id), formula_id: text('formula_id').notNull().references(() => formulas.id) });
export const productionIngredients = sqliteTable('production_ingredients', { ...base(), production_id: text('production_id').notNull().references(() => productions.id), ingredient_id: text('ingredient_id').notNull().references(() => ingredients.id) });
export const productionCosts = sqliteTable('production_costs', { ...base(), production_id: text('production_id').notNull().references(() => productions.id), ingredient_id: text('ingredient_id').references(() => ingredients.id) });
export const sales = sqliteTable('sales', { ...base(), customer_id: text('customer_id').notNull().references(() => customers.id), site_id: text('site_id').notNull().references(() => sites.id) }, t => [index('idx_sales_customer').on(t.customer_id)]);
export const saleItems = sqliteTable('sale_items', { ...base(), sale_id: text('sale_id').notNull().references(() => sales.id), product_id: text('product_id').notNull().references(() => products.id) });
export const saleProductionLinks = sqliteTable('sale_production_links', { ...base(), sale_id: text('sale_id').notNull().references(() => sales.id), production_id: text('production_id').notNull().references(() => productions.id) });
export const payments = sqliteTable('payments', { ...base(), customer_id: text('customer_id').notNull().references(() => customers.id) });
export const paymentApplications = sqliteTable('payment_applications', { ...base(), payment_id: text('payment_id').notNull().references(() => payments.id), sale_id: text('sale_id').notNull().references(() => sales.id) });
export const paymentReversals = sqliteTable('payment_reversals', { ...base(), payment_id: text('payment_id').notNull().references(() => payments.id) });
export const returns = sqliteTable('returns', { ...base(), sale_id: text('sale_id').notNull().references(() => sales.id) });
export const returnItems = sqliteTable('return_items', { ...base(), return_id: text('return_id').notNull().references(() => returns.id), sale_item_id: text('sale_item_id').notNull().references(() => saleItems.id) });
export const corrections = sqliteTable('corrections', base());
export const correctionFields = sqliteTable('correction_fields', { ...base(), correction_id: text('correction_id').notNull().references(() => corrections.id) });
export const expenses = sqliteTable('expenses', { ...base(), production_id: text('production_id').references(() => productions.id), sale_id: text('sale_id').references(() => sales.id), site_id: text('site_id').references(() => sites.id), ingredient_id: text('ingredient_id').references(() => ingredients.id) });
export const inventoryMovements = sqliteTable('inventory_movements', base());
export const audit = sqliteTable('audit', base());
