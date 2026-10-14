/**
 * Poseidon over BN254.
 *
 * CloakPay uses Poseidon because it is the hash the circuit is cheapest in, and
 * because the same parameters exist in circomlib (`poseidon.circom`), in
 * `poseidon-lite` (JavaScript), and in the Solidity library the contract tests
 * use. All three must agree byte for byte.
 *
 * The circuit is the authority: a proof only verifies if the JavaScript
 * implementation produced identical field elements.
 */
import { poseidon1, poseidon2, poseidon3, poseidon4 } from "poseidon-lite";
import { mod } from "./field";
import type { Field } from "./types";

export { poseidon1, poseidon2, poseidon3, poseidon4 };

/**
 * Domain-separated hash over up to three field elements.
 * The domain tag occupies its own lane, so a hash of one struct shape can
 * never be confused with another.
 */
export function hashToField(domain: Field, ...parts: Field[]): Field {
  const lanes = [mod(domain), ...parts.map(mod)];
  switch (lanes.length) {
    case 1:
      return poseidon1(lanes as [Field]);
    case 2:
      return poseidon2(lanes as [Field, Field]);
    case 3:
      return poseidon3(lanes as [Field, Field, Field]);
    case 4:
      return poseidon4(lanes as [Field, Field, Field, Field]);
    default:
      throw new Error(`hashToField supports 0-3 parts, received ${parts.length}`);
  }
}

/** Commitment to a note: C = Poseidon(nullifier, secret). */
export function commitmentOf(nullifier: Field, secret: Field): Field {
  return poseidon2([nullifier, secret]);
}

/** Nullifier hash: N = Poseidon(nullifier). Revealed at spend time. */
export function nullifierHashOf(nullifier: Field): Field {
  return poseidon1([nullifier]);
}

/** Interior Merkle node: H(left, right). */
export function hashPair(left: Field, right: Field): Field {
  return poseidon2([left, right]);
}
