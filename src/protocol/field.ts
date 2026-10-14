/**
 * BN254 (alt_bn128) scalar field helpers.
 *
 * The Groth16 verifier runs over BN254 because that is the pairing-friendly
 * curve reachable through the EIP-197 precompile on Elysium. Every value that
 * enters a circuit or a commitment must be reduced into this field.
 */

/** BN254 scalar field modulus r. */
export const SNARK_SCALAR_FIELD =
  21888242871839275222246405745257275088548364400416034343698204186575808495617n;

export const FIELD_BYTES = 32;

export function mod(a: bigint): bigint {
  const r = a % SNARK_SCALAR_FIELD;
  return r >= 0n ? r : r + SNARK_SCALAR_FIELD;
}

/** Reads a big-endian byte array shorter than 32 bytes as a field element. */
export function bytesToField(bytes: Uint8Array): bigint {
  if (bytes.length > FIELD_BYTES) {
    throw new Error(`expected at most ${FIELD_BYTES} bytes, received ${bytes.length}`);
  }
  let value = 0n;
  for (const byte of bytes) value = (value << 8n) | BigInt(byte);
  return mod(value);
}

/** Reads exactly 32 bytes as a big-endian field element (strict). */
export function bytes32ToField(bytes: Uint8Array): bigint {
  if (bytes.length !== FIELD_BYTES) {
    throw new Error(`expected exactly ${FIELD_BYTES} bytes, received ${bytes.length}`);
  }
  return bytesToField(bytes);
}

export function fieldToBytes(value: bigint, length = FIELD_BYTES): Uint8Array {
  const normalised = mod(value);
  const out = new Uint8Array(length);
  let remaining = normalised;
  for (let i = length - 1; i >= 0; i--) {
    out[i] = Number(remaining & 0xffn);
    remaining >>= 8n;
  }
  return out;
}

export function fieldToHex(value: bigint): `0x${string}` {
  return `0x${mod(value).toString(16).padStart(64, "0")}` as `0x${string}`;
}

export function hexToField(hex: string): bigint {
  const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
  if (clean.length === 0 || clean.length > 64 || /[^0-9a-fA-F]/.test(clean)) {
    throw new Error(`not a field-sized hex string: ${hex}`);
  }
  return mod(BigInt(`0x${clean}`));
}

/** Splits a 20-byte EVM address into a single field element. */
export function addressToField(address: string): bigint {
  const clean = address.startsWith("0x") ? address.slice(2) : address;
  if (!/^[0-9a-fA-F]{40}$/.test(clean)) {
    throw new Error(`not an EVM address: ${address}`);
  }
  return BigInt(`0x${clean}`);
}
