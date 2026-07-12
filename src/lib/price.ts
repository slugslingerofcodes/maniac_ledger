/**
 * Store price formatting. Centralised so the currency is a one-line change —
 * defaults to INR (₹) to match the app's audience. Prices are stored as a
 * plain numeric amount (major units, e.g. 499.00).
 */
const priceFormatter = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 2,
});

export function formatPrice(amount: number): string {
  return priceFormatter.format(amount);
}
