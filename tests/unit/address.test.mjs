import { test } from "node:test";
import assert from "node:assert/strict";
import { validateExternalAddress, ZERO_ADDRESS } from "../../src/lib/address.js";

const SELF = "0xe20796322664d23e06EC9DAd0B86AAd475b78310";
const OTHER = "0x1111111111111111111111111111111111111111";

test("a well-formed address is accepted and returned checksummed", () => {
  const result = validateExternalAddress(OTHER);
  assert.equal(result.ok, true);
  assert.equal(result.address, "0x1111111111111111111111111111111111111111");
});

test("a lowercase address is accepted because it carries no checksum to fail", () => {
  assert.equal(validateExternalAddress(SELF.toLowerCase()).ok, true);
});

test("the checksum is actually enforced on mixed-case input", () => {
  const flipped = SELF.slice(0, -1) + (SELF.endsWith("0") ? "1" : "0");
  const result = validateExternalAddress(flipped);
  assert.equal(result.ok, false);
  assert.match(result.reason, /checksum/i);
});

test("malformed addresses are refused with a shape message", () => {
  for (const bad of ["", "   ", "0x123", "e20796322664d23e06EC9DAd0B86AAd475b78310", "0xzz796322664d23e06EC9DAd0B86AAd475b78310"]) {
    const result = validateExternalAddress(bad);
    assert.equal(result.ok, false);
    assert.ok(result.reason.length > 0);
  }
});

test("the zero address is refused outright, with or without a checksum", () => {
  const result = validateExternalAddress(ZERO_ADDRESS);
  assert.equal(result.ok, false);
  assert.match(result.reason, /zero address/i);
});

test("sending to your own wallet is refused before it reaches a transaction", () => {
  const result = validateExternalAddress(SELF, SELF);
  assert.equal(result.ok, false);
  assert.match(result.reason, /own address/i);
  assert.equal(validateExternalAddress(SELF, OTHER).ok, true);
});
