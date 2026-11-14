/** Stored money uses integer cents/rationals; micro hundredths explicitly denote 0.01 g. */
export interface Entity {
  id: string;
  created_at?: string;
  created_by?: string;
  updated_at?: string;
}
export interface User extends Entity {
  name: string;
  role: "ADMIN" | "OPERATOR" | "VIEWER";
  is_active: boolean;
}
export interface Site extends Entity {
  name: string;
  is_active: boolean;
}
export interface Customer extends Site {
  code?: string;
  tax_id?: string;
  contact_name?: string;
  phone?: string;
  address?: string;
  notes?: string;
  deleted_at?: string;
}
export interface CustomerSite extends Entity {
  customer_id: string;
  site_id: string;
  is_active: boolean;
  is_default: boolean;
}
export type PresentationUnit = "BAG" | "BOTTLE" | "UNIT";
export type WeightPolicy = "FIXED" | "VARIABLE";
export type StockEntryMode = "NUCLEUS_PRODUCTION" | "DIRECT_STOCK";
export interface PresentationSnapshot {
  presentation_unit_snapshot?: PresentationUnit;
  unit_weight_grams_snapshot?: number;
  weight_policy_snapshot?: WeightPolicy;
}
export interface Product extends Site {
  category: string;
  default_sale_price: number | null;
  presentation_unit?: PresentationUnit;
  unit_weight_grams?: number;
  weight_policy?: WeightPolicy;
  stock_entry_mode?: StockEntryMode;
  standard_bag_weight_kg?: number;
  bags_per_nucleus?: number;
  commercial_weight_per_nucleus_kg?: number;
  is_sellable: boolean;
  image: string | null;
}
export interface Ingredient extends Site {
  current_price_per_kg: number;
}
export interface MicroIngredient extends Site {
  operational_id: number;
  unit: "KG";
  known_price_per_kg: number | null;
}
export interface MicroOpening extends Entity {
  version: number;
  micro_ingredient_id: string;
  warehouse: "MICROS";
  quantity_grams: number;
  unit_cost_cents: number | null;
  valuation_cents: number | null;
  cutoff_date: string;
  measurement: "REAL" | "ESTIMATED";
  source: string;
  notes: string;
}
export interface MicroPurchase extends Entity {
  document_kind: "DOCUMENT" | "MANUAL";
  document_key: string;
  supplier: string | null;
  reference: string;
  source: string | null;
  document_date: string | null;
  total_cents: number | null;
  discount_cents: number;
  payment_method: "CASH";
  status: "DRAFT" | "CONFIRMED" | "CANCELLED";
  expense_id: string | null;
  owns_expense: boolean;
  version: number;
}
export interface MicroPurchaseLine extends Entity {
  purchase_id: string;
  micro_ingredient_id: string;
  quantity_grams: number | null;
  unit_price_cents: number | null;
  amount_cents: number | null;
  cutoff_date_snapshot: string | null;
  is_current: boolean;
  version: number;
}
export interface Rational {
  n: string;
  d: string;
}
export interface MicroReceipt extends Entity {
  document_key: string;
  supplier: string;
  reference: string;
  source: string;
  document_date: string;
  total_cents: number;
  discount_cents: number;
  currency: "PEN";
  payment_method: "CASH";
  status: "DRAFT" | "CONFIRMED";
  expense_id: string | null;
  request_id: string;
  version: number;
}
export interface MicroReceiptLine extends Entity {
  receipt_id: string;
  micro_ingredient_id: string;
  quantity_grams: number;
  unit_price_cents: number;
  amount_cents: number;
  discount_cents: number;
  total_cost_cents: number;
  cutoff_date_snapshot: string;
  is_current: boolean;
  version: number;
}
/** v2 quantity_hundredths is canonical; quantity_grams is a presentation projection. */
export interface MicroLedger extends Entity {
  micro_ingredient_id: string;
  opening_id: string;
  ledger: {
    quantity_hundredths?: number;
    quantity_grams: number;
    value_cents: Rational | null;
    revision: number;
    events: unknown[];
  };
}
export interface MicroValuationEvent extends Entity {
  ledger_id: string;
  receipt_line_id: string;
  request_id: string;
  revision: number;
  event: unknown;
}
export type MicroFamily = "ROSADO" | "VERDE_AMARILLO";
export interface MicroFormula extends Entity {
  family: MicroFamily;
  version: number;
  notes: string;
  published_at: string | null;
  published_by: string | null;
  total_grams: number;
}
export interface MicroFormulaLine extends Entity {
  formula_id: string;
  micro_ingredient_id: string;
  operational_id_snapshot: number;
  name_snapshot: string;
  dose_grams: number;
}
export interface MicroFormulaHead extends Entity {
  family: MicroFamily;
  active_formula_id: string | null;
  version: number;
}
export interface Formula extends Entity {
  product_id: string;
  version: number;
  valid_from: string;
  valid_to: string | null;
  is_active: boolean;
}
export interface FormulaIngredient extends Entity {
  formula_id: string;
  ingredient_id: string;
  kg_per_nucleus: number;
}
export interface Operation extends Entity {
  code: string;
  notes?: string;
  cancellation_reason?: string;
  confirmed_at?: string;
  closed_at?: string;
  delivered_at?: string;
  cancelled_at?: string;
}
export interface Sale extends Operation {
  coverage_version?: 1;
  coverage_adopted_at?: string;
  coverage_adopted_by?: string;
  coverage_adoption_reason?: string;
  customer_id: string;
  site_id: string;
  sale_date: string;
  delivery_date?: string;
  delivery_date_manual_override?: boolean;
  payment_condition: string;
  commercial_status: string;
  fulfillment_status: string;
  financial_status: string;
}
export interface SaleItem extends Entity, PresentationSnapshot {
  coverage?: {
    version: 1;
    quantity: number;
    weight_grams: number;
    movement_id: string | null;
    events?: { movement_id: string; quantity: number; weight_grams: number; reverses_movement_id?: string }[];
  };
  previous_item_id?: string;
  sale_id: string;
  product_id: string;
  quantity: number;
  unit_weight_kg: number;
  total_weight_kg: number;
  reference_unit_price: number;
  unit_price: number;
  subtotal: number;
  is_current: boolean;
}
export interface Production extends Operation {
  production_date: string;
  status: string;
  input_snapshot?: ProductionInput;
}
export interface ProductionProduct extends Entity {
  production_id: string;
  product_id: string;
  formula_id: string;
  formula_snapshot: FormulaIngredient[];
  nuclei_count: number;
  bags_per_nucleus_snapshot?: number;
  bags_produced: number;
  commercial_weight_kg: number;
  formula_weight_kg: number;
  is_current: boolean;
}
export interface ProductionIngredient extends Entity {
  production_id: string;
  ingredient_id: string;
  total_kg: number;
  historical_price_per_kg: number;
  theoretical_gross_cost: number;
  discount_amount: number;
  theoretical_net_cost: number;
  actual_charge: number | null;
  difference: number | null;
  is_paid: boolean;
  is_current: boolean;
  notes?: string;
}
export interface ProductionCost extends Entity {
  production_id: string;
  category: string;
  description: string;
  quantity?: number;
  unit_cost?: number;
  amount: number;
  ingredient_id?: string | null;
  is_paid: boolean;
  is_current: boolean;
}
export interface SaleProductionLink extends Entity {
  sale_id: string;
  production_id: string;
  notes?: string;
}
export interface Payment extends Operation {
  customer_id: string;
  payment_date: string;
  total_amount: number;
  payment_method: string;
  other_method: string;
  reference: string;
}
export interface PaymentApplication extends Entity {
  payment_id: string;
  sale_id: string;
  applied_amount: number;
}
export interface PaymentReversal extends Entity {
  payment_id: string;
  amount: number;
  date: string;
  reason: string;
  code: string;
}
export interface Return extends Operation {
  sale_id: string;
  return_date: string;
  reason: string;
  economic_amount: number;
}
export interface ReturnItem extends Entity {
  return_id: string;
  sale_item_id: string;
  quantity: number;
  weight_kg: number;
}
export interface Correction extends Entity {
  code: string;
  entity_type: string;
  entity_id: string;
  reason: string;
}
export interface CorrectionField extends Entity {
  correction_id: string;
  field_name: string;
  old_value: string;
  new_value: string;
}
export interface Expense extends Entity {
  date: string;
  category: string;
  description: string;
  amount: number;
  production_id: string | null;
  sale_id: string | null;
  site_id: string | null;
  ingredient_id: string | null;
  production_cost_id: string | null;
  notes?: string;
  status: string;
  reason?: string;
}
export interface InventoryMovement extends Entity, PresentationSnapshot {
  sale_item_id?: string;
  coverage_version?: 1;
  coverage_action?: "ASSIGN" | "RELEASE";
  coverage_cause?: string;
  reverses_movement_id?: string;
  request_id?: string;
  date: string;
  item_type: string;
  item_id: string;
  movement_type: string;
  quantity: number;
  weight_kg: number;
  source_type: string;
  source_id: string;
  notes?: string;
}
export interface Audit extends Entity {
  request_contract_version?: 1;
  action: string;
  entity_id: string | null;
  payload: unknown;
  actor_name: string;
  actor_role: string;
  request_id?: string;
}
export interface CompanyConfig {
  company_name: string;
  currency: string;
  timezone: string;
  default_nucleus_cost: number;
  default_packaging_cost: number;
  expense_categories: string[];
  tax_id?: string;
  address?: string;
  phone?: string;
  contact_email?: string;
  default_payment_condition?: "CASH" | "CREDIT";
  default_payment_method?: "" | "CASH" | "TRANSFER" | "CHECK";
  default_expense_category?: string;
}
export interface MicroSubstitutionPolicy {
  id: string;
  reference: string;
  from_ingredient_id: string;
  to_ingredient_id: string;
  families: Record<
    MicroFamily,
    { source_formula_id: string; lines: { micro_ingredient_id: string; dose_grams: number }[] }
  >;
}
export interface MicroSubstitution extends Entity {
  policy_id: string;
  approval_reference: string;
  from_ingredient_id: string;
  to_ingredient_id: string;
  source_rosado_id: string;
  source_verde_id: string;
  rosado_formula_id: string;
  verde_formula_id: string;
  reason: string;
  request_id: string;
}
export interface MicroSupersession extends Entity {
  source_id: string;
  target_id: string;
  substitution_id: string;
  approval_reference: string;
  reason: string;
  consent: true;
  request_id: string;
}
export interface MicroPreparationGroup extends Entity {
  preparation_id: string;
  group_reference: string;
  reason: string;
  request_id: string;
}
export interface MicroPreparationPolicy {
  formula_id: string;
  family: MicroFamily;
  reference: string;
  lines: { micro_ingredient_id: string; dose_grams: number }[];
}
export interface MicroPreparation extends Entity {
  family: MicroFamily;
  formula_id: string;
  nuclei_hundredths: number;
  date: string;
  status: "PENDING";
  authorization_reference: string;
  request_id: string;
}
export interface MicroAssignment extends Entity {
  preparation_id: string;
  request_id: string;
  reason: string;
  authorization_reference: string;
}
export interface MicroAssignmentLine extends Entity {
  assignment_id: string;
  formula_line_id: string;
  micro_ingredient_id: string;
  quantity_hundredths: number;
}
export interface MicroAssignmentReversal extends Entity {
  assignment_id: string;
  request_id: string;
  reason: string;
}
export interface MicroConfirmation extends Entity {
  preparation_id: string;
  assignment_id: string;
  formula_id: string;
  request_id: string;
  nuclei_hundredths: number;
  date: string;
  authorization_reference: string;
  total_cost_cents: Rational;
  unit_cost_cents: Rational;
  posted_cost_cents: string;
}
export interface MicroIssue extends Entity {
  confirmation_id: string;
  assignment_line_id: string;
  formula_line_id: string;
  micro_ingredient_id: string;
  ledger_id: string;
  request_id: string;
  revision: number;
  quantity_hundredths: number;
  released_hundredths: number;
  event: unknown;
}
export interface ProductionJourney extends Entity {
  code: string;
  date: string;
  timezone: string;
  notes: string;
  request_id: string;
}
export interface ProductionJourneyLine extends Entity {
  journey_id: string;
  product_id: string;
  product_name: string;
  family: string;
  formula_id: string;
  micro_formula_id: string;
  nuclei_hundredths: number;
  formula_snapshot: FormulaIngredient[];
  micro_formula_snapshot: MicroFormulaLine[];
  planned_weight_grams: number;
  planned_bags: number;
  macro_estimate: {
    ingredient_id: string;
    name: string;
    grams: number;
    price_cents_per_kg: number;
    estimated_cents: number;
  }[];
  actual_bags: number | null;
  waste_grams: number | null;
  final_cost_cents: null;
}
export interface ProductionJourneyLink extends Entity {
  line_id: string;
  preparation_id: string;
  confirmation_id: string;
  nuclei_hundredths: number;
  request_id: string;
}
export interface MillClosure extends Entity {
  journey_id: string;
  line_id: string;
  product_id: string;
  request_id: string;
  date: string;
  lot_complete: boolean;
  formula_consent: boolean;
  formula_mismatch: boolean;
  actual_bags: number;
  waste_grams: number;
  theoretical_weight_grams: number;
  unit_weight_grams: number;
  movement_id: string | null;
  final_cost_cents: null;
}
export interface Tables {
  millClosures: MillClosure[];
  productionJourneys: ProductionJourney[];
  productionJourneyLines: ProductionJourneyLine[];
  productionJourneyLinks: ProductionJourneyLink[];
  microSubstitutions: MicroSubstitution[];
  microSupersessions: MicroSupersession[];
  microPreparationGroups: MicroPreparationGroup[];
  microConfirmations: MicroConfirmation[];
  microIssues: MicroIssue[];
  microAssignments: MicroAssignment[];
  microAssignmentLines: MicroAssignmentLine[];
  microAssignmentReversals: MicroAssignmentReversal[];
  microPreparations: MicroPreparation[];
  users: User[];
  customers: Customer[];
  sites: Site[];
  customerSites: CustomerSite[];
  products: Product[];
  ingredients: Ingredient[];
  microIngredients: MicroIngredient[];
  microFormulas: MicroFormula[];
  microFormulaLines: MicroFormulaLine[];
  microFormulaHeads: MicroFormulaHead[];
  microOpenings: MicroOpening[];
  microReceipts: MicroReceipt[];
  microReceiptLines: MicroReceiptLine[];
  microLedgers: MicroLedger[];
  microValuationEvents: MicroValuationEvent[];
  microPurchases: MicroPurchase[];
  microPurchaseLines: MicroPurchaseLine[];
  formulas: Formula[];
  formulaIngredients: FormulaIngredient[];
  productions: Production[];
  productionProducts: ProductionProduct[];
  productionIngredients: ProductionIngredient[];
  productionCosts: ProductionCost[];
  sales: Sale[];
  saleItems: SaleItem[];
  saleProductionLinks: SaleProductionLink[];
  payments: Payment[];
  paymentApplications: PaymentApplication[];
  paymentReversals: PaymentReversal[];
  returns: Return[];
  returnItems: ReturnItem[];
  corrections: Correction[];
  correctionFields: CorrectionField[];
  expenses: Expense[];
  inventoryMovements: InventoryMovement[];
  audit: Audit[];
}
export type TableName = keyof Tables;
export interface AppState extends Tables {
  config: CompanyConfig;
  revision: number;
}
export type NumericInput = string | number;
export interface CostInput {
  id?: string;
  category: string;
  description: string;
  amount: NumericInput;
  ingredient_id?: string;
  is_paid: boolean;
  notes?: string;
}
export interface IngredientInput {
  id?: string;
  ingredient_id: string;
  /** Soles per kg applied only to this production; historical snapshots store cents. */
  price_per_kg?: NumericInput;
  discount_amount?: NumericInput;
  actual_charge?: NumericInput | null;
  /** Missing on historical records: preserve their stored charge instead of inferring automatic mode. */
  actual_charge_mode?: "auto" | "manual";
  is_paid?: boolean;
  notes?: string;
}
export interface ProductionInput {
  products: { product_id: string; nuclei_count: NumericInput }[];
  ingredients?: IngredientInput[];
  costs?: CostInput[];
  nucleus_cost?: NumericInput;
  packaging_cost?: NumericInput;
  nucleus_paid?: boolean;
  packaging_paid?: boolean;
}
/** A modal can initially carry just an ID; it is resolved against the current state. */
export type EditorRecord = Omit<
  Partial<Customer & Product & Ingredient & Sale & Production & Payment & Formula & Expense & User>,
  "site_id" | "sale_id" | "ingredient_id"
> & {
  id?: string;
  _operation?: string;
  site_id?: string | null;
  sale_id?: string | null;
  ingredient_id?: string | null;
};
export type Submit = (type: string, payload: object, requestId?: string) => Promise<string | true | null>;
export type OpenModal = (type: string, record?: EditorRecord, kind?: string) => void;
export interface Command {
  type: string;
  payload?: object;
  request_id?: string;
}
export interface CommandResult {
  state: AppState;
  result: string | null;
}
export interface SaleSummary {
  coverage_lines?: { item: SaleItem; covered: number; missing: number }[];
  coverage_status?: "READY_BY_STOCK" | "PENDING_STOCK";
  coverage_label?: string;
  covered_quantity?: number;
  missing_quantity?: number;
  items: SaleItem[];
  gross: number;
  total: number;
  returned: number;
  paid: number;
  balance: number;
  financial_status: string;
}
export interface ProductionSummary {
  ingredients: ProductionIngredient[];
  costs: ProductionCost[];
  products: ProductionProduct[];
  estimated: number;
  real: number;
  reconciled: boolean;
  variation: number;
  bags: number;
  weight: number;
}
export interface StockSummary {
  quantity: number;
  weight_kg: number;
  committed: number;
}
export interface BalanceSummary {
  customer_credit: number;
  sales: number;
  collections: number;
  receivable: number;
  costs: number;
  paidCosts: number;
  logistics: number;
  other: number;
  estimated_result: number;
  cash_result: number;
  estimated_productions: number;
}

export function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}
export function recordId(record: EditorRecord | undefined): string {
  if (!record?.id) throw new Error("Falta el identificador del registro.");
  return record.id;
}
