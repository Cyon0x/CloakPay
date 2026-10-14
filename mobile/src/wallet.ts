/**
 * The mobile wallet.
 *
 * React Native has no WebCrypto, so this module reimplements the web app's
 * envelope with `@noble/*`, which is pure JavaScript and runs the same
 * everywhere. Everything else is deliberately identical:
 *
 *   - 12 words from the standard BIP-39 English list, derived to the standard
 *     m/44'/60'/0'/0/0 account, so the same phrase restores the same wallet in
 *     any other tool.
 *   - one secret object, `{ version, mnemonic, viewing }`, sealed with
 *     PBKDF2-SHA256 at 600 000 iterations into AES-256-GCM under the fixed AAD
 *     `cloakpay/key-envelope/v1`.
 *
 * Because the format is byte-for-byte the web format, a wallet created on a
 * phone opens in a browser and the other way round. The difference is where the
 * secret rests: the iOS keychain and the Android keystore hold it here, rather
 * than an origin-scoped browser store.
 */
import "react-native-get-random-values";
import * as SecureStore from "expo-secure-store";
import { english, generateMnemonic, mnemonicToAccount } from "viem/accounts";
import { pbkdf2Async } from "@noble/hashes/pbkdf2";
import { sha256 } from "@noble/hashes/sha256";
import { gcm } from "@noble/ciphers/aes";
import { randomBytes } from "@noble/hashes/utils";
import { b64url, fromB64url, utf8, fromUtf8 } from "./b64";
import { createViewingKeyPair, viewingKeyId, type ViewingKeyPair } from "./viewing";

const ENVELOPE_KEY = "cloakpay.envelope";
export const PBKDF2_ITERATIONS = 600_000;

/**
 * The unlocked secret for this session, in memory and nowhere else.
 *
 * The keychain holds the sealed envelope, never the phrase. Keeping the
 * plaintext copy out of it is what makes the passphrase mean something: an
 * attacker with an unlocked phone and the app's storage still cannot sign
 * without it.
 */
let sessionSecret: WalletSecret | null = null;

export interface KeyEnvelope {
  v: 1;
  alg: "PBKDF2-SHA256-600000-AES-256-GCM";
  kdf: "PBKDF2-SHA256";
  iterations: number;
  salt: string;
  iv: string;
  ct: string;
}

export interface WalletSecret {
  version: 1;
  mnemonic: string;
  viewing: ViewingKeyPair;
}

export interface SealedWallet {
  envelope: KeyEnvelope;
  address: `0x${string}`;
  viewingPublicKey: ViewingKeyPair["publicKey"];
  viewingKeyId: string;
}

/** True once the user has entered their passphrase in this session. */
export function isUnlocked(): boolean {
  return sessionSecret !== null;
}

/** Same construction as the web app: PBKDF2-SHA256, AES-256-GCM, fixed AAD. */
export async function sealWithPassphrase(plaintext: string, passphrase: string): Promise<KeyEnvelope> {
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const key = await pbkdf2Async(sha256, utf8(passphrase.normalize("NFKD")), salt, {
    c: PBKDF2_ITERATIONS,
    dkLen: 32,
  });
  const sealed = gcm(key, iv, utf8("cloakpay/key-envelope/v1")).encrypt(utf8(plaintext));
  return {
    v: 1,
    alg: "PBKDF2-SHA256-600000-AES-256-GCM",
    kdf: "PBKDF2-SHA256",
    iterations: PBKDF2_ITERATIONS,
    salt: b64url(salt),
    iv: b64url(iv),
    ct: b64url(sealed),
  };
}

export async function openWithPassphrase(envelope: KeyEnvelope, passphrase: string): Promise<string> {
  if (envelope.v !== 1 || envelope.kdf !== "PBKDF2-SHA256") {
    throw new Error(`Unsupported key envelope: ${envelope.kdf}`);
  }
  const key = await pbkdf2Async(sha256, utf8(passphrase.normalize("NFKD")), fromB64url(envelope.salt), {
    c: envelope.iterations,
    dkLen: 32,
  });
  const plaintext = gcm(key, fromB64url(envelope.iv), utf8("cloakpay/key-envelope/v1")).decrypt(
    fromB64url(envelope.ct),
  );
  return fromUtf8(plaintext);
}

export function addressFromMnemonic(mnemonic: string): `0x${string}` {
  return mnemonicToAccount(mnemonic.trim()).address;
}

function assertSecret(value: unknown): WalletSecret {
  const secret = value as WalletSecret;
  if (!secret || secret.version !== 1 || typeof secret.mnemonic !== "string" || !secret.viewing?.publicKey) {
    throw new Error("That envelope does not contain a CloakPay wallet.");
  }
  return secret;
}

/**
 * Creates a wallet and seals it.
 *
 * Nothing here reaches the network. The mnemonic is written to the keychain and
 * the sealed envelope is what gets uploaded, so the server receives the same
 * opaque blob it receives from a browser and cannot open either.
 */
export async function createWallet(passphrase: string): Promise<{ sealed: SealedWallet; secret: WalletSecret }> {
  const mnemonic = generateMnemonic(english);
  const viewing = createViewingKeyPair();
  const secret: WalletSecret = { version: 1, mnemonic, viewing };
  const envelope = await sealWithPassphrase(JSON.stringify(secret), passphrase);

  await SecureStore.setItemAsync(ENVELOPE_KEY, JSON.stringify(envelope));
  sessionSecret = secret;

  return {
    secret,
    sealed: {
      envelope,
      address: addressFromMnemonic(mnemonic),
      viewingPublicKey: viewing.publicKey,
      viewingKeyId: viewingKeyId(viewing.publicKey),
    },
  };
}

/** Restores an existing phrase on a new device or after a reinstall. */
export async function restoreFromMnemonic(mnemonic: string, passphrase: string) {
  const secret: WalletSecret = { version: 1, mnemonic: mnemonic.trim(), viewing: createViewingKeyPair() };
  const envelope = await sealWithPassphrase(JSON.stringify(secret), passphrase);
  await SecureStore.setItemAsync(ENVELOPE_KEY, JSON.stringify(envelope));
  sessionSecret = secret;
  return {
    secret,
    sealed: {
      envelope,
      address: addressFromMnemonic(secret.mnemonic),
      viewingPublicKey: secret.viewing.publicKey,
      viewingKeyId: viewingKeyId(secret.viewing.publicKey),
    } satisfies SealedWallet,
  };
}

/**
 * Returns the unlocked wallet for this session.
 *
 * The keychain entry is the fast path. When only the sealed envelope is present
 * (a fresh install restoring from the server) the passphrase is required, and
 * failing to open it destroys nothing: the envelope is still on the server.
 */
export async function unlockWallet(passphrase?: string): Promise<WalletSecret> {
  if (sessionSecret) return sessionSecret;
  if (!passphrase) {
    throw new Error("Enter your passphrase to unlock signing on this device.");
  }
  const raw = await SecureStore.getItemAsync(ENVELOPE_KEY);
  if (!raw) throw new Error("No wallet on this device. Restore it with your recovery phrase.");
  const secret = assertSecret(JSON.parse(await openWithPassphrase(JSON.parse(raw) as KeyEnvelope, passphrase)));
  sessionSecret = secret;
  return secret;
}

/** Used when the sealed envelope came from the server rather than this device. */
export async function unlockEnvelope(envelope: KeyEnvelope, passphrase: string): Promise<WalletSecret> {
  if (sessionSecret) return sessionSecret;
  const secret = assertSecret(JSON.parse(await openWithPassphrase(envelope, passphrase)));
  sessionSecret = secret;
  await SecureStore.setItemAsync(ENVELOPE_KEY, JSON.stringify(envelope));
  return secret;
}

export async function forgetWallet() {
  sessionSecret = null;
  await SecureStore.deleteItemAsync(ENVELOPE_KEY);
}

export async function hasWalletOnDevice(): Promise<boolean> {
  return (await SecureStore.getItemAsync(ENVELOPE_KEY)) !== null;
}
