/**
 * Note format.
 *
 * A shielded "note" is the private counterpart of a deposit. It is a bearer
 * instrument: whoever can produce the nullifier and a valid Merkle proof can
 * spend it. See docs/PRIVACY_PROTOCOL.md for the consequences of that model.
 *
 * Encoding used for transport and export:
 *   cloakpay1.<chainId>.<denominationId>.<nullifier>.<secret>
 *
 * The denomination id is everything between the chain id and the last two
 * fields, and may itself contain a dot (`hype-0.01` does). Parsing therefore
 * anchors on the end: the final two fields are always the nullifier and the
 * secret, so the id can never be mistaken for them. Splitting naively into five
 * parts instead is what made every note of a fractional denomination decode as
 * malformed.
 * The string is never placed in a URL, never logged, and never stored in
 * plaintext anywhere.
 */
import { commitmentOf, nullifierHashOf } from "./poseidon";
import { fieldToHex, hexToField } from "./field";
import { randomBytes } from "./crypto";
import { bytesToField } from "./field";
import type { Field, Note } from "./types";
import { denominationById } from "../config/pool";

const PREFIX = "cloakpay1";
/** 31 bytes keeps every generated value below the BN254 scalar field. */
const SECRET_BYTES = 31;

export function randomField(): Field {
  return bytesToField(randomBytes(SECRET_BYTES));
}

export interface CreateNoteOptions {
  chainId: number;
  denominationId: string;
  nullifier?: Field;
  secret?: Field;
}

export function createNote(options: CreateNoteOptions): Note {
  const denomination = denominationById(options.denominationId);
  if (!denomination) throw new Error(`unknown denomination: ${options.denominationId}`);

  const nullifier = options.nullifier ?? randomField();
  const secret = options.secret ?? randomField();
  if (nullifier === 0n || secret === 0n) throw new Error("note secrets must be non-zero");

  return {
    version: 1,
    chainId: options.chainId,
    denominationId: denomination.id,
    amountWei: denomination.wei,
    nullifier,
    secret,
    commitment: commitmentOf(nullifier, secret),
    nullifierHash: nullifierHashOf(nullifier),
  };
}

export function encodeNote(note: Note): string {
  return [
    PREFIX,
    note.chainId,
    note.denominationId,
    fieldToHex(note.nullifier).slice(2),
    fieldToHex(note.secret).slice(2),
  ].join(".");
}

export function decodeNote(encoded: string): Note {
  const parts = encoded.trim().split(".");
  // Five fields, but the denomination id may contain dots of its own, so the
  // id is read as everything between the chain id and the trailing pair.
  if (parts.length < 5) throw new Error("note is malformed");
  const [prefix, chainIdRaw] = parts;
  const nullifierHex = parts[parts.length - 2];
  const secretHex = parts[parts.length - 1];
  const denominationId = parts.slice(2, parts.length - 2).join(".");
  if (prefix !== PREFIX) throw new Error(`unrecognised note prefix: ${prefix}`);
  const chainId = Number(chainIdRaw);
  if (!Number.isInteger(chainId)) throw new Error("note has an invalid chain id");

  const denomination = denominationById(denominationId);
  if (!denomination) throw new Error(`note has an unknown denomination: ${denominationId}`);

  const nullifier = hexToField(nullifierHex);
  const secret = hexToField(secretHex);
  if (nullifier === 0n || secret === 0n) throw new Error("note secrets must be non-zero");

  return {
    version: 1,
    chainId,
    denominationId,
    amountWei: denomination.wei,
    nullifier,
    secret,
    commitment: commitmentOf(nullifier, secret),
    nullifierHash: nullifierHashOf(nullifier),
  };
}

/**
 * Recomputes the commitment from a note's secrets and compares it with the
 * value that was published on-chain. Guards against a note that was tampered
 * with in transit or in storage.
 */
export function noteMatchesCommitment(note: Note, commitment: Field): boolean {
  return commitmentOf(note.nullifier, note.secret) === commitment;
}
