import { valuationHundredths } from "./valuation.mjs";

// Physical stock only. Commitments are applied by evaluatePreparation, never here.
export function microPhysicalStock(s, id) {
  const ledger = s.microLedgers.find((row) => row.micro_ingredient_id === id && row.ledger.events.length > 0);
  const opening = s.microOpenings.find((row) => row.micro_ingredient_id === id);
  let stock_source = "UNRECORDED";
  if (opening) stock_source = "OPENING";
  if (ledger) stock_source = "LEDGER";
  return {
    physical_hundredths: ledger ? valuationHundredths(ledger.ledger) : (opening?.quantity_grams ?? 0) * 100,
    stock_source,
  };
}
