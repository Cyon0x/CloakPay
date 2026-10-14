import { randomBytes } from "node:crypto";

/** Unambiguous alphabet: no 0/O, 1/I/L. Payment links get read aloud. */
const ALPHABET = "23456789abcdefghjkmnpqrstuvwxyz";

export function paymentCode(length = 9): string {
  const bytes = randomBytes(length);
  let out = "";
  for (const byte of bytes) out += ALPHABET[byte % ALPHABET.length];
  return out;
}
