import { test } from "node:test";
import assert from "node:assert/strict";
import { parseAmount, validateAmount, formatAmount, AMOUNT_PRESETS } from "../../src/lib/amount.js";

const HYPE = { decimals: 18, symbol: "HYPE" };
const E = 10n ** 18n;

test("a plain decimal parses to exact wei with no floating point", () => {
  assert.deepEqual(parseAmount("0.1", 18), { ok: true, wei: E / 10n });
  assert.deepEqual(parseAmount("1", 18), { ok: true, wei: E });
  assert.deepEqual(parseAmount("5", 18), { ok: true, wei: 5n * E });
  assert.deepEqual(parseAmount("0.000000000000000001", 18), { ok: true, wei: 1n });
});

test("0.1 and 0.2 add to exactly 0.3, which binary floats cannot do", () => {
  const a = parseAmount("0.1", 18);
  const b = parseAmount("0.2", 18);
  assert.equal(a.ok && b.ok, true);
  assert.equal(a.wei + b.wei, E * 3n / 10n);
  assert.equal(formatAmount(a.wei + b.wei, 18), "0.3");
  // The float version of the same sum is not exact, which is the whole point.
  assert.notEqual(0.1 + 0.2, 0.3);
});

test("an empty field is a prompt, not an error about digits", () => {
  const result = validateAmount("   ", HYPE);
  assert.equal(result.ok, false);
  assert.match(result.reason, /Enter an amount/);
});

test("malformed input is rejected rather than coerced", () => {
  for (const bad of ["abc", "1.2.3", "1e5", "-1", "1,5", "0x10", "1 000", "+2", ".5", "1."]) {
    const result = parseAmount(bad, 18);
    assert.equal(result.ok, false, `${bad} should not parse`);
  }
});

test("zero and negative values never validate", () => {
  for (const zero of ["0", "0.0", "0.000"]) {
    const result = validateAmount(zero, HYPE);
    assert.equal(result.ok, false);
    assert.match(result.reason, /greater than zero/);
  }
  assert.equal(validateAmount("-1", HYPE).ok, false);
});

test("precision beyond the token decimals is refused", () => {
  const result = parseAmount("1.0000000000000000001", 18);
  assert.equal(result.ok, false);
  assert.match(result.reason, /18 decimal places/);
  assert.equal(parseAmount("1.000000000000000000", 18).ok, true);
});

test("an amount above the balance is reported as insufficient funds", () => {
  const result = validateAmount("2", { ...HYPE, balanceWei: E });
  assert.equal(result.ok, false);
  assert.match(result.reason, /more HYPE than this wallet holds/);
  assert.match(result.reason, /1 HYPE/);
  // Exactly the balance is allowed; the fee is a separate consideration.
  assert.equal(validateAmount("1", { ...HYPE, balanceWei: E }).ok, true);
});

test("an unknown balance does not block entry", () => {
  assert.equal(validateAmount("2", { ...HYPE, balanceWei: null }).ok, true);
});

test("fixed denominations are the only amounts the pool accepts", () => {
  const allowedWei = [E / 10n, E, 10n * E];
  const bad = validateAmount("2", { ...HYPE, allowedWei });
  assert.equal(bad.ok, false);
  assert.match(bad.reason, /fixed sizes/);
  assert.match(bad.reason, /0.1 HYPE/);
  for (const good of ["0.1", "1", "10"]) {
    assert.equal(validateAmount(good, { ...HYPE, allowedWei }).ok, true, `${good} should be allowed`);
  }
});

test("the preset list is real and every preset validates", () => {
  assert.ok(AMOUNT_PRESETS.length > 0);
  for (const preset of AMOUNT_PRESETS) {
    assert.equal(validateAmount(preset, HYPE).ok, true, `${preset} should validate`);
  }
});

test("formatting round-trips through parsing", () => {
  for (const value of ["0.1", "1", "5", "0.000000000000000001", "123.456789"]) {
    const parsed = parseAmount(value, 18);
    assert.equal(parsed.ok, true);
    assert.equal(formatAmount(parsed.wei, 18), value);
  }
});
