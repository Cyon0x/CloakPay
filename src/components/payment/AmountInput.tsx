"use client";

import { useRef, useState } from "react";
import { AMOUNT_PRESETS, validateAmount } from "@/lib/amount";

/**
 * The single amount control in the product.
 *
 * Send and payment links both render this, and both call the same pure
 * validator, so an amount accepted on one screen cannot be rejected on the
 * other and both end up holding the same integer wei.
 *
 * The field is deliberately the largest control in the form: typing an amount
 * is the default action, and the presets are a shortcut into the very same
 * field rather than a second way to pay.
 */
export function AmountInput({
  value,
  onChange,
  symbol,
  decimals = 18,
  balanceWei = null,
  allowedWei = null,
  presets = AMOUNT_PRESETS,
  label = "Amount",
  hint,
  disabled = false,
  id = "amount",
}: {
  value: string;
  onChange: (value: string) => void;
  symbol: string;
  decimals?: number;
  balanceWei?: bigint | null;
  allowedWei?: readonly bigint[] | null;
  presets?: readonly string[];
  label?: string;
  hint?: string;
  disabled?: boolean;
  id?: string;
}) {
  const field = useRef<HTMLInputElement>(null);
  const [focused, setFocused] = useState(false);

  const parsed = validateAmount(value, { decimals, symbol, balanceWei, allowedWei });
  // A half-typed value such as "0." is an error by the rules but it is not a
  // mistake worth shouting about while the caret is still in the field.
  const showError = !focused && value.trim() !== "" && !parsed.ok;
  const custom = !presets.includes(value.trim());

  return (
    <div className="amount-field">
      <label className="label" htmlFor={id}>
        {label}
      </label>

      <div className={`amount-box${showError ? " amount-box-invalid" : ""}`}>
        <input
          id={id}
          ref={field}
          className="amount-input mono"
          value={value}
          onChange={(event) => onChange(event.target.value.replace(/[^0-9.]/g, ""))}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          inputMode="decimal"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          placeholder="0.00"
          disabled={disabled}
          aria-invalid={showError || undefined}
          aria-describedby={`${id}-help`}
        />
        <span className="amount-symbol" aria-hidden="true">
          {symbol}
        </span>
      </div>

      <div className="preset-row" role="group" aria-label="Quick amounts">
        {presets.map((preset) => (
          <button
            key={preset}
            type="button"
            className="preset"
            aria-pressed={value.trim() === preset}
            disabled={disabled}
            onClick={() => onChange(preset)}
          >
            {preset} {symbol}
          </button>
        ))}
        <button
          type="button"
          className="preset"
          aria-pressed={custom}
          disabled={disabled}
          onClick={() => field.current?.focus()}
        >
          Custom
        </button>
      </div>

      <p className="hint" id={`${id}-help`} aria-live="polite">
        {showError ? <span className="hint-error">{parsed.reason}</span> : hint}
      </p>
    </div>
  );
}
