/**
 * Amount parsing and validation for every money input in CloakPay.
 *
 * An entered amount becomes an integer number of wei before it is validated,
 * compared against a balance, or signed into a transaction. Floating point is
 * never used: 0.1 has no exact binary representation, so arithmetic on HYPE in
 * a float eventually yields either a value the chain rejects or, worse, one it
 * accepts for a different amount than the user typed.
 *
 * Kept free of imports so the same rules run in a server component, a client
 * component and the unit test runner.
 */

export interface AmountRules {
  /** Token decimals. HYPE uses 18. */
  decimals: number;
  /** Token symbol, used in user-facing messages. */
  symbol: string;
  /** Balance in wei when it is known. Null or undefined means "not known yet". */
  balanceWei?: bigint | null;
  /**
   * When set and non-empty, only these exact wei values are accepted. The
   * shielded pool uses this: it settles in fixed denominations, and an amount
   * that is not one of them is not a payment the protocol can make.
   */
  allowedWei?: readonly bigint[] | null;
}

export type AmountResult = { ok: true; wei: bigint } | { ok: false; reason: string };

const DECIMAL = /^\d+(?:\.\d+)?$/;

/** Parses a decimal string into wei. Rejects anything that is not plainly decimal. */
export function parseAmount(input: string, decimals: number): AmountResult {
  const trimmed = input.trim();
  if (trimmed === "") return { ok: false, reason: "Enter an amount." };
  if (!DECIMAL.test(trimmed)) {
    return { ok: false, reason: "Use digits and one decimal point." };
  }
  const [whole, fraction = ""] = trimmed.split(".");
  if (fraction.length > decimals) {
    return { ok: false, reason: `Use at most ${decimals} decimal places.` };
  }
  const padded = fraction.padEnd(decimals, "0");
  const wei = BigInt(whole) * 10n ** BigInt(decimals) + BigInt(padded === "" ? "0" : padded);
  return { ok: true, wei };
}

/** Parses, then applies the zero, denomination and balance rules in that order. */
export function validateAmount(input: string, rules: AmountRules): AmountResult {
  const parsed = parseAmount(input, rules.decimals);
  if (!parsed.ok) return parsed;
  const { wei } = parsed;

  if (wei <= 0n) return { ok: false, reason: "Enter an amount greater than zero." };

  const allowed = rules.allowedWei;
  if (allowed && allowed.length > 0 && !allowed.some((value) => value === wei)) {
    const sizes = allowed.map((value) => `${formatAmount(value, rules.decimals)} ${rules.symbol}`);
    return { ok: false, reason: `This payment settles in fixed sizes: ${sizes.join(", ")}.` };
  }

  if (rules.balanceWei !== null && rules.balanceWei !== undefined && wei > rules.balanceWei) {
    return {
      ok: false,
      reason: `That is more ${rules.symbol} than this wallet holds (${formatAmount(rules.balanceWei, rules.decimals)} ${rules.symbol}).`,
    };
  }

  return { ok: true, wei };
}

/** Renders wei as a plain decimal string with trailing zeros trimmed. */
export function formatAmount(wei: bigint, decimals: number): string {
  const negative = wei < 0n;
  const value = negative ? -wei : wei;
  const base = 10n ** BigInt(decimals);
  const whole = value / base;
  const fraction = (value % base).toString().padStart(decimals, "0").replace(/0+$/, "");
  const text = fraction === "" ? whole.toString() : `${whole}.${fraction}`;
  return negative ? `-${text}` : text;
}

/** Quick picks offered under the amount field. */
export const AMOUNT_PRESETS: readonly string[] = ["0.1", "1", "5"];
