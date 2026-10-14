/**
 * Secret-handling primitives.
 *
 * Everything in this module runs with WebCrypto, so the identical code path
 * executes in the browser, in the React Native runtime, and in Node during
 * tests. No hand-rolled primitives: ECDH P-256, HKDF-SHA256, AES-256-GCM and
 * PBKDF2-SHA256 are all platform implementations.
 *
 * Two envelopes exist:
 *   * `NoteEnvelope`  — a private note sealed to a recipient's viewing key.
 *   * `KeyEnvelope`   — the user's secret material sealed under a passphrase.
 */
import type { KeyEnvelope, NoteEnvelope } from "./types";

const subtle = globalThis.crypto.subtle;
const HKDF_SALT = new TextEncoder().encode("cloakpay/note/v1");
const HKDF_INFO = new TextEncoder().encode("note-encryption-key");
const KEY_ENVELOPE_AAD = new TextEncoder().encode("cloakpay/key-envelope/v1");
const NOTE_ENVELOPE_AAD = new TextEncoder().encode("cloakpay/note-envelope/v1");

export const PBKDF2_ITERATIONS = 600_000;

export function randomBytes(length: number): Uint8Array {
  const out = new Uint8Array(length);
  globalThis.crypto.getRandomValues(out);
  return out;
}

export function b64urlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function b64urlDecode(value: string): Uint8Array {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(padded + "=".repeat((4 - (padded.length % 4)) % 4));
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

/* ── Viewing keys ─────────────────────────────────────────────────────────── */

export interface ViewingKeyPair {
  publicKey: JsonWebKey;
  privateKey: JsonWebKey;
}

/**
 * Creates the "viewing key" that receives private payments.
 *
 * This key only decrypts incoming notes. It cannot move funds, which is the
 * whole point of separating viewing authority from spending authority.
 */
export async function createViewingKeyPair(): Promise<ViewingKeyPair> {
  const pair = await subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, [
    "deriveBits",
  ]);
  return {
    publicKey: await subtle.exportKey("jwk", pair.publicKey),
    privateKey: await subtle.exportKey("jwk", pair.privateKey),
  };
}

/** A stable identifier for a viewing key, safe to publish. Not reversible. */
export async function viewingKeyId(publicKey: JsonWebKey): Promise<string> {
  const raw = await subtle.exportKey("raw", await importPublicKey(publicKey));
  const digest = await subtle.digest("SHA-256", raw);
  return b64urlEncode(new Uint8Array(digest).slice(0, 16));
}

async function importPublicKey(jwk: JsonWebKey): Promise<CryptoKey> {
  return subtle.importKey("jwk", jwk, { name: "ECDH", namedCurve: "P-256" }, true, []);
}

async function importPrivateKey(jwk: JsonWebKey): Promise<CryptoKey> {
  return subtle.importKey("jwk", jwk, { name: "ECDH", namedCurve: "P-256" }, false, [
    "deriveBits",
  ]);
}

async function deriveKeyFromSharedBits(bits: ArrayBuffer): Promise<CryptoKey> {
  const hkdfKey = await subtle.importKey("raw", bits, "HKDF", false, ["deriveKey"]);
  return subtle.deriveKey(
    { name: "HKDF", hash: "SHA-256", salt: HKDF_SALT, info: HKDF_INFO },
    hkdfKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

/* ── Note envelopes (ECIES) ───────────────────────────────────────────────── */

/**
 * Seals a note to a recipient's viewing public key.
 * The sender's ephemeral key is single-use, so two payments of the same
 * amount to the same person produce unrelated ciphertexts.
 */
export async function encryptNoteToRecipient(
  plaintext: string,
  recipientPublicKey: JsonWebKey,
): Promise<NoteEnvelope> {
  const ephemeral = await subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, [
    "deriveBits",
  ]);
  const shared = await subtle.deriveBits(
    { name: "ECDH", public: await importPublicKey(recipientPublicKey) },
    ephemeral.privateKey,
    256,
  );
  const aesKey = await deriveKeyFromSharedBits(shared);
  const iv = randomBytes(12);
  const ct = await subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: NOTE_ENVELOPE_AAD },
    aesKey,
    new TextEncoder().encode(plaintext),
  );
  const epkRaw = new Uint8Array(await subtle.exportKey("raw", ephemeral.publicKey));
  return {
    v: 1,
    alg: "P256-HKDF-SHA256-AES-256-GCM",
    epk: b64urlEncode(epkRaw),
    iv: b64urlEncode(iv),
    ct: b64urlEncode(new Uint8Array(ct)),
  };
}

export async function decryptNoteFromSender(
  envelope: NoteEnvelope,
  viewingPrivateKey: JsonWebKey,
): Promise<string> {
  if (envelope.v !== 1 || envelope.alg !== "P256-HKDF-SHA256-AES-256-GCM") {
    throw new Error(`unsupported note envelope: ${envelope.alg}`);
  }
  const epk = await subtle.importKey(
    "raw",
    b64urlDecode(envelope.epk),
    { name: "ECDH", namedCurve: "P-256" },
    true,
    [],
  );
  const shared = await subtle.deriveBits(
    { name: "ECDH", public: epk },
    await importPrivateKey(viewingPrivateKey),
    256,
  );
  const aesKey = await deriveKeyFromSharedBits(shared);
  const plaintext = await subtle.decrypt(
    { name: "AES-GCM", iv: b64urlDecode(envelope.iv), additionalData: NOTE_ENVELOPE_AAD },
    aesKey,
    b64urlDecode(envelope.ct),
  );
  return new TextDecoder().decode(plaintext);
}

/* ── Key envelopes (passphrase-sealed secret material) ────────────────────── */

async function deriveKek(
  passphrase: string,
  salt: Uint8Array,
  iterations: number,
): Promise<CryptoKey> {
  const base = await subtle.importKey(
    "raw",
    new TextEncoder().encode(passphrase.normalize("NFKD")),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  return subtle.deriveKey(
    { name: "PBKDF2", salt, iterations, hash: "SHA-256" },
    base,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

/** Seals secret material (mnemonic + viewing key) under a passphrase. */
export async function sealWithPassphrase(
  plaintext: string,
  passphrase: string,
): Promise<KeyEnvelope> {
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const kek = await deriveKek(passphrase, salt, PBKDF2_ITERATIONS);
  const ct = await subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: KEY_ENVELOPE_AAD },
    kek,
    new TextEncoder().encode(plaintext),
  );
  return {
    v: 1,
    alg: "PBKDF2-SHA256-600000-AES-256-GCM",
    kdf: "PBKDF2-SHA256",
    iterations: PBKDF2_ITERATIONS,
    salt: b64urlEncode(salt),
    iv: b64urlEncode(iv),
    ct: b64urlEncode(new Uint8Array(ct)),
  };
}

export async function openWithPassphrase(
  envelope: KeyEnvelope,
  passphrase: string,
): Promise<string> {
  if (envelope.v !== 1 || envelope.kdf !== "PBKDF2-SHA256") {
    throw new Error(`unsupported key envelope: ${envelope.kdf}`);
  }
  const kek = await deriveKek(
    passphrase,
    b64urlDecode(envelope.salt),
    envelope.iterations,
  );
  const plaintext = await subtle.decrypt(
    { name: "AES-GCM", iv: b64urlDecode(envelope.iv), additionalData: KEY_ENVELOPE_AAD },
    kek,
    b64urlDecode(envelope.ct),
  );
  return new TextDecoder().decode(plaintext);
}
