/**
 * Minimal ambient types for `snarkjs`.
 *
 * snarkjs ships no type declarations of its own. CloakPay only ever calls two
 * entry points, both of them Groth16, so this declares exactly those and
 * nothing more: a wider surface here would be a promise the library does not
 * make. Anything that needs a different snarkjs call should extend this file
 * deliberately rather than fall back to `any`.
 *
 * The declaration is intentionally loose on the proof object: snarkjs returns
 * the snarkjs-specific curve point representation, and `shielded.ts` hands it
 * straight back to `exportSolidityCallData`, which is the only consumer.
 */
declare module "snarkjs" {
  export interface Groth16Proof {
    pi_a: string[];
    pi_b: string[][];
    pi_c: string[];
    protocol: string;
    curve: string;
  }

  export const groth16: {
    /** Builds a witness from `input` and proves it against wasm + zkey. */
    fullProve(
      input: Record<string, unknown>,
      wasmPath: string,
      zkeyPath: string,
    ): Promise<{ proof: Groth16Proof; publicSignals: string[] }>;

    /** Verifies a proof against a verification key, in-process. */
    verify(
      verificationKey: unknown,
      publicSignals: string[],
      proof: Groth16Proof,
    ): Promise<boolean>;

    /** Serialises a proof + signals into Solidity calldata arguments. */
    exportSolidityCallData(proof: Groth16Proof, publicSignals: string[]): Promise<string>;
  };
}
