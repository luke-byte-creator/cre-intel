/**
 * Shared formatting utilities.
 */

/** Format a number as compact CAD currency (e.g. $1.2M, $450K, $500) */
export function fmtCurrency(n: number | null | undefined): string {
  if (n == null) return "—";
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n}`;
}

/** Format a number as full CAD currency (e.g. $1,200,000) */
export function fmtCurrencyFull(v: unknown): string {
  if (v == null) return "—";
  return Number(v).toLocaleString("en-CA", {
    style: "currency",
    currency: "CAD",
    maximumFractionDigits: 0,
  });
}
