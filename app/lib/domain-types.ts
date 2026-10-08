/** Stored amounts are integer cents and stored weights are integer grams. */
export interface Entity { id: string; created_at?: string; created_by?: string; updated_at?: string }
export interface User extends Entity { name: string; role: 'ADMIN' | 'OPERATOR' | 'VIEWER'; is_active: boolean }
export interface Site extends Entity { name: string; is_active: boolean }
export interface Customer extends Site { code?: string; tax_id?: string; contact_name?: string; phone?: string; address?: string; notes?: string; deleted_at?: string }
export interface CustomerSite extends Entity { customer_id: string; site_id: string; is_active: boolean; is_default: boolean }
export interface Product extends Site { category: string; default_sale_price: number; standard_bag_weight_kg: number; bags_per_nucleus: number; commercial_weight_per_nucleus_kg: number; is_sellable: boolean; image: string | null }
export interface Ingredient extends Site { current_price_per_kg: number }
export interface Formula extends Entity { product_id: string; version: number; valid_from: string; valid_to: string | null; is_active: boolean }
export interface FormulaIngredient extends Entity { formula_id: string; ingredient_id: string; kg_per_nucleus: number }
export interface Operation extends Entity { code: string; notes?: string; cancellation_reason?: string; confirmed_at?: string; closed_at?: string; delivered_at?: string }
export interface Sale extends Operation { customer_id: string; site_id: string; sale_date: string; payment_condition: string; commercial_status: string; fulfillment_status: string; financial_status: string }
export interface SaleItem extends Entity { sale_id: string; product_id: string; quantity: number; unit_weight_kg: number; total_weight_kg: number; reference_unit_price: number; unit_price: number; subtotal: number; is_current: boolean }
export interface Production extends Operation { production_date: string; status: string; input_snapshot?: ProductionInput }
export interface ProductionProduct extends Entity { production_id: string; product_id: string; formula_id: string; formula_snapshot: FormulaIngredient[]; nuclei_count: number; bags_produced: number; commercial_weight_kg: number; formula_weight_kg: number; is_current: boolean }
export interface ProductionIngredient extends Entity { production_id: string; ingredient_id: string; total_kg: number; historical_price_per_kg: number; theoretical_gross_cost: number; discount_amount: number; theoretical_net_cost: number; actual_charge: number | null; difference: number | null; is_paid: boolean; is_current: boolean; notes?: string }
export interface ProductionCost extends Entity { production_id: string; category: string; description: string; quantity?: number; unit_cost?: number; amount: number; ingredient_id?: string | null; is_paid: boolean; is_current: boolean }
export interface SaleProductionLink extends Entity { sale_id: string; production_id: string; notes?: string }
export interface Payment extends Operation { customer_id: string; payment_date: string; total_amount: number; payment_method: string; other_method: string; reference: string }
export interface PaymentApplication extends Entity { payment_id: string; sale_id: string; applied_amount: number }
export interface PaymentReversal extends Entity { payment_id: string; amount: number; date: string; reason: string; code: string }
export interface Return extends Operation { sale_id: string; return_date: string; reason: string; economic_amount: number }
export interface ReturnItem extends Entity { return_id: string; sale_item_id: string; quantity: number; weight_kg: number }
export interface Correction extends Entity { code: string; entity_type: string; entity_id: string; reason: string }
export interface CorrectionField extends Entity { correction_id: string; field_name: string; old_value: string; new_value: string }
export interface Expense extends Entity { date: string; category: string; description: string; amount: number; production_id: string | null; sale_id: string | null; site_id: string | null; ingredient_id: string | null; production_cost_id: string | null; notes?: string; status: string; reason?: string }
export interface InventoryMovement extends Entity { date: string; item_type: string; item_id: string; movement_type: string; quantity: number; weight_kg: number; source_type: string; source_id: string; notes?: string }
export interface Audit extends Entity { action: string; entity_id: string | null; payload: unknown; actor_name: string; actor_role: string; request_id?: string }
export interface CompanyConfig { company_name: string; currency: string; timezone: string; default_nucleus_cost: number; default_packaging_cost: number; expense_categories: string[] }
export interface Tables {
  users: User[]; customers: Customer[]; sites: Site[]; customerSites: CustomerSite[];
  products: Product[]; ingredients: Ingredient[]; formulas: Formula[]; formulaIngredients: FormulaIngredient[];
  productions: Production[]; productionProducts: ProductionProduct[]; productionIngredients: ProductionIngredient[]; productionCosts: ProductionCost[];
  sales: Sale[]; saleItems: SaleItem[]; saleProductionLinks: SaleProductionLink[];
  payments: Payment[]; paymentApplications: PaymentApplication[]; paymentReversals: PaymentReversal[];
  returns: Return[]; returnItems: ReturnItem[]; corrections: Correction[]; correctionFields: CorrectionField[];
  expenses: Expense[]; inventoryMovements: InventoryMovement[]; audit: Audit[];
}
export type TableName = keyof Tables;
export interface AppState extends Tables { config: CompanyConfig; revision: number }
export type NumericInput = string | number;
export interface CostInput { id?: string; category: string; description: string; amount: NumericInput; ingredient_id?: string; is_paid: boolean; notes?: string }
export interface IngredientInput { id?: string; ingredient_id: string; discount_amount?: NumericInput; actual_charge?: NumericInput | null; is_paid?: boolean; notes?: string }
export interface ProductionInput { products: { product_id: string; nuclei_count: NumericInput }[]; ingredients?: IngredientInput[]; costs?: CostInput[]; nucleus_cost?: NumericInput; packaging_cost?: NumericInput; nucleus_paid?: boolean; packaging_paid?: boolean }
/** A modal can initially carry just an ID; it is resolved against the current state. */
export type EditorRecord = Omit<Partial<Customer & Product & Ingredient & Sale & Production & Payment & Formula & Expense & User>, 'site_id' | 'sale_id' | 'ingredient_id'> & { id?: string; _operation?: string; site_id?: string | null; sale_id?: string | null; ingredient_id?: string | null };
export type Submit = (type: string, payload: object) => Promise<string | true | null>;
export type OpenModal = (type: string, record?: EditorRecord, kind?: string) => void;
export interface Command { type: string; payload?: object; request_id?: string }
export interface CommandResult { state: AppState; result: string | null }
export interface SaleSummary { items: SaleItem[]; gross: number; total: number; returned: number; paid: number; balance: number; financial_status: string }
export interface ProductionSummary { ingredients: ProductionIngredient[]; costs: ProductionCost[]; products: ProductionProduct[]; estimated: number; real: number; reconciled: boolean; variation: number; bags: number; weight: number }
export interface StockSummary { quantity: number; weight_kg: number; committed: number }
export interface BalanceSummary { sales: number; collections: number; receivable: number; costs: number; paidCosts: number; logistics: number; other: number; estimated_result: number; cash_result: number; estimated_productions: number }

export function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}
export function recordId(record: EditorRecord | undefined): string {
  if (!record?.id) throw new Error('Falta el identificador del registro.');
  return record.id;
}
