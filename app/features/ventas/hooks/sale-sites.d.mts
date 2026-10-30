import type { AppState, Customer, Site } from "../../../lib/domain-types";
import type { SaleFields } from "../../../shared/types/forms";
export function saleSiteContext(
  state: AppState,
  customerId: string,
  siteId: string,
): {
  linked: Site[];
  other: Site[];
  principal?: string;
  customer?: Customer;
  site?: Site;
  needsChoice: boolean;
  key: string;
};
export function changeSaleParty(
  values: SaleFields,
  field: string,
  value: string,
  state: AppState,
): SaleFields;
