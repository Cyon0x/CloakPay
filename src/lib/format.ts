/**
 * Pure formatting helpers.
 *
 * Kept free of database and server imports so the same code runs in a client
 * component, in a server component, and in the test runner.
 */
import { DENOMINATIONS, denominationById } from "@/config/pool";

/** Renders a stored wei amount for display, without floating point. */
export function formatWei(wei: bigint, decimals = 18, maxFractionDigits = 6): string {
  const negative = wei < 0n;
  const value = negative ? -wei : wei;
  const base = 10n ** BigInt(decimals);
  const whole = value / base;
  const fraction = value % base;
  let fractionText = fraction.toString().padStart(decimals, "0").replace(/0+$/, "");
  if (fractionText.length > maxFractionDigits) {
    fractionText = fractionText.slice(0, maxFractionDigits);
  }
  const text = fractionText.length > 0 ? `${whole}.${fractionText}` : whole.toString();
  return negative ? `-${text}` : text;
}

export function parseToWei(input: string, decimals = 18): bigint {
  const trimmed = input.trim();
  if (!/^\d+(\.\d+)?$/.test(trimmed)) throw new Error("not a decimal amount");
  const [whole, fraction = ""] = trimmed.split(".");
  if (fraction.length > decimals) throw new Error(`at most ${decimals} decimal places`);
  const padded = fraction.padEnd(decimals, "0");
  return BigInt(whole) * 10n ** BigInt(decimals) + BigInt(padded || "0");
}

export function denominationLabel(amountWei: bigint | null): string | null {
  if (amountWei === null) return null;
  const match = DENOMINATIONS.find((d) => d.wei === amountWei);
  return match?.label ?? `${formatWei(amountWei)} HYPE`;
}

export function isSupportedDenomination(amountWei: bigint): boolean {
  return DENOMINATIONS.some((d) => d.wei === amountWei);
}

export function denominationForId(id: string) {
  return denominationById(id);
}

/** A short, stable reference a user can quote in support. */
export function shortId(id: string): string {
  return id.replace(/-/g, "").slice(0, 8).toUpperCase();
}
