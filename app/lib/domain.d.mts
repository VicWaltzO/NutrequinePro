import type {
  AppState,
  TableName,
  User,
  Command,
  CommandResult,
  SaleSummary,
  ProductionSummary,
  StockSummary,
  BalanceSummary,
} from "./domain-types";
export const TABLES: TableName[];
export const SQL_NAMES: Record<TableName, string>;
export const RELATIONS: Partial<Record<TableName, string[]>>;
export class DomainError extends Error {}
export function normalize(value: unknown): string;
export function scaled(value: unknown, digits?: number): number;
export function emptyState(): AppState;
export function seedState(): AppState;
export function executeCommand(state: AppState, command: Command, actor: User, clock?: string): CommandResult;
export function saleSummary(state: AppState, sale: { id: string }): SaleSummary;
export function productionSummary(state: AppState, production: { id: string }): ProductionSummary;
export function stock(state: AppState, productId: string): StockSummary;
export function balanceSummary(state: AppState, from?: string, to?: string): BalanceSummary;

export function paymentSummary(
  state: AppState,
  payment: { id: string; total_amount: number },
): { applied: number; available: number; reversed: boolean };
export function customerSummary(
  state: AppState,
  customerId: string,
): { debt: number; credit: number; net: number };
export interface DeliveryAvailability {
  product_id: string;
  requested: number;
  weight: number;
  quantity: number;
  weight_kg: number;
  missing_quantity: number;
  missing_weight: number;
}
export function deliveryAvailability(
  state: AppState,
  rows: import("./domain-types").SaleItem[],
  allowOld?: import("./domain-types").SaleItem[],
): DeliveryAvailability[];
