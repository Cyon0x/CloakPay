/** Money formatting. Integer wei in, string out. No floating point. */
export function formatWei(wei: bigint, decimals = 18, maxFractionDigits = 6): string {
  const negative = wei < 0n;
  const value = negative ? -wei : wei;
  const base = 10n ** BigInt(decimals);
  const whole = value / base;
  const fraction = value % base;
  let text = fraction.toString().padStart(decimals, "0").replace(/0+$/, "");
  if (text.length > maxFractionDigits) text = text.slice(0, maxFractionDigits);
  const out = text.length > 0 ? `${whole}.${text}` : whole.toString();
  return negative ? `-${out}` : out;
}
