import type { NumericInput, CostInput, ProductionIngredient } from '../../lib/domain-types';
export interface PaymentFieldsValue { payment_method:string;other_method?:string;reference:string }
export interface SaleFields extends PaymentFieldsValue { id?:string;sale_date:string;customer_id:string;site_id:string;payment_condition:string;notes:string;mode:string;reason:string;production_id:string;payment_date?:string }
export interface SaleLine { original_item_id?:string;product_id:string;quantity:NumericInput;unit_weight_kg:NumericInput;unit_price:NumericInput }
export interface PaymentValues extends PaymentFieldsValue {customer_id:string;payment_date:string;total_amount:NumericInput;notes:string}
export interface ReturnValues {return_date:string;reason:string;economic_amount:NumericInput;notes:string}
export interface ProductionValues {production_date:string;notes:string;nucleus_cost:NumericInput;packaging_cost:NumericInput;nucleus_paid:boolean;packaging_paid:boolean;confirm:boolean}
export type ReconcileIngredient=Omit<ProductionIngredient,'actual_charge'|'discount_amount'> & {actual_charge:NumericInput;discount_amount:NumericInput};
export type EditableCost=Omit<CostInput,'category'|'is_paid'> & {category?:string;is_paid?:boolean};
/** Each simple form exposes only its own relevant fields to the domain command. */
export interface SimpleFields {
  id?:string;name?:string;is_active?:boolean;site_ids?:string[];tax_id?:string;contact_name?:string;phone?:string;address?:string;notes?:string;confirm_duplicate?:boolean;
  category?:string;default_sale_price?:NumericInput;standard_bag_weight_kg?:NumericInput;bags_per_nucleus?:NumericInput;commercial_weight_per_nucleus_kg?:NumericInput;is_sellable?:boolean;current_price_per_kg?:NumericInput;
  date?:string;description?:string;amount?:NumericInput;production_id?:string|null;sale_id?:string|null;site_id?:string|null;ingredient_id?:string|null;
  product_id?:string;quantity?:NumericInput;weight_kg?:NumericInput;direction?:string;reason?:string;
  company_name?:string;default_nucleus_cost?:NumericInput;default_packaging_cost?:NumericInput;categories_text?:string;role?:string;
}
