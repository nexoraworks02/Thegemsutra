export const BASE_CURRENCY = "PKR";

/** "Rs 12,900" */
export function formatMoney(amount: number, currency: string = BASE_CURRENCY): string {
  const n = Math.round(amount).toLocaleString("en-US");
  if (currency === "PKR") return `Rs ${n}`;
  if (currency === "USD") return `$${n}`;
  return `${currency} ${n}`;
}

/**
 * Convert from PKR to another currency and round to a clean local price.
 * (Jewlr rounds converted prices, e.g. $69 -> Rs 20,100.)
 */
export function convert(amountPkr: number, rate: number, roundStep = 1): number {
  return Math.ceil((amountPkr * rate) / roundStep) * roundStep;
}
