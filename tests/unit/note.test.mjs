import { test } from "node:test";
import assert from "node:assert/strict";
import { createNote, encodeNote, decodeNote, noteMatchesCommitment } from "../../src/protocol/note.js";
import { commitmentOf, nullifierHashOf } from "../../src/protocol/poseidon.js";
import { SNARK_SCALAR_FIELD } from "../../src/protocol/field.js";

const CHAIN = 99801;
const DENOM = "hype-1";

test("a note's commitment and nullifier hash are derived, not stored", () => {
  const note = createNote({ chainId: CHAIN, denominationId: DENOM });
  assert.equal(note.commitment, commitmentOf(note.nullifier, note.secret));
  assert.equal(note.nullifierHash, nullifierHashOf(note.nullifier));
});

test("notes never repeat their secrets", () => {
  const seen = new Set();
  for (let i = 0; i < 200; i++) {
    const note = createNote({ chainId: CHAIN, denominationId: DENOM });
    assert.ok(note.nullifier < SNARK_SCALAR_FIELD);
    assert.ok(note.secret < SNARK_SCALAR_FIELD);
    assert.equal(seen.has(note.nullifier + ":" + note.secret), false);
    seen.add(note.nullifier + ":" + note.secret);
  }
});

test("amount comes from the denomination, not from user input", () => {
  const note = createNote({ chainId: CHAIN, denominationId: "hype-0.01" });
  assert.equal(note.amountWei, 10_000_000_000_000_000n);
});

test("an unknown denomination is refused", () => {
  assert.throws(() => createNote({ chainId: CHAIN, denominationId: "hype-5000" }), /unknown denomination/);
});

test("encode / decode round-trips exactly", () => {
  const note = createNote({ chainId: CHAIN, denominationId: DENOM });
  const restored = decodeNote(encodeNote(note));
  assert.equal(restored.nullifier, note.nullifier);
  assert.equal(restored.secret, note.secret);
  assert.equal(restored.commitment, note.commitment);
  assert.equal(restored.nullifierHash, note.nullifierHash);
  assert.equal(restored.denominationId, note.denominationId);
});

// The denomination ids contain a dot ("hype-0.01"), and the note format is
// dot-separated. Splitting into a fixed five fields made every note of a
// fractional denomination fail to decode, which silently made funded notes
// unspendable, so each size is round-tripped explicitly.
for (const denominationId of ["hype-0.01", "hype-0.1", "hype-1"]) {
  test(`a note of ${denominationId} round-trips through its dotted id`, () => {
    const note = createNote({ chainId: CHAIN, denominationId });
    const restored = decodeNote(encodeNote(note));
    assert.equal(restored.denominationId, denominationId);
    assert.equal(restored.nullifier, note.nullifier);
    assert.equal(restored.secret, note.secret);
    assert.equal(restored.amountWei, note.amountWei);
  });
}

test("malformed notes are rejected instead of half-parsed", () => {
  assert.throws(() => decodeNote("not-a-note"), /malformed/);
  assert.throws(() => decodeNote("wrong1.99801.hype-1.aa.bb"), /prefix/);
  assert.throws(() => decodeNote("cloakpay1.99801.hype-5000.aa.bb"), /unknown denomination/);
  assert.throws(() => decodeNote("cloakpay1.99801.hype-1.00.bb"), /non-zero/);
  assert.throws(() => decodeNote("cloakpay1.abc.hype-1.aa.bb"), /invalid chain id/);
});

test("commitment comparison catches a tampered note", () => {
  const note = createNote({ chainId: CHAIN, denominationId: DENOM });
  assert.equal(noteMatchesCommitment(note, note.commitment), true);
  assert.equal(noteMatchesCommitment(note, note.commitment + 1n), false);
});
