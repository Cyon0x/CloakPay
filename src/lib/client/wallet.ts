"use client";

/**
 * The wallet lives here, not on the server.
 *
 * A 12-word BIP-39 mnemonic is generated in the browser and an EVM account is
 * derived from it with the standard m/44'/60'/0'/0/0 path, so the same wallet
 * can be restored in any other tool. The mnemonic is never derived from an
 * email, a username, or a PIN.
 *
 * Storage is an AEAD envelope keyed by the user's passphrase. The server holds
 * the envelope and cannot open it. The mnemonic shown during onboarding is the
 * real recovery path; the passphrase only makes the backup convenient.
 */
import { english, generateMnemonic, mnemonicToAccount } from "viem/accounts";
import {
  createViewingKeyPair,
  sealWithPassphrase,
  openWithPassphrase,
  encryptNoteToRecipient,
  decryptNoteFromSender,
  viewingKeyId,
  type ViewingKeyPair,
} from "@/protocol/crypto";

export interface WalletSecret {
  version: 1;
  mnemonic: string;
  viewing: ViewingKeyPair;
}

export interface SealedWallet {
  envelope: Awaited<ReturnType<typeof sealWithPassphrase>>;
  address: `0x${string}`;
  viewingPublicKey: JsonWebKey;
  viewingKeyId: string;
}

export const DEVICE_KEY = "cloakpay.device.v1";

export function addressFromMnemonic(mnemonic: string): `0x${string}` {
  return mnemonicToAccount(mnemonic).address;
}

/** Creates a wallet and seals it under the passphrase. Nothing is sent anywhere. */
export async function createSealedWallet(passphrase: string): Promise<{
  sealed: SealedWallet;
  secret: WalletSecret;
}> {
  // 128 bits of entropy from the standard BIP-39 English wordlist: twelve words.
  const mnemonic = generateMnemonic(english);
  const viewing = await createViewingKeyPair();
  const secret: WalletSecret = { version: 1, mnemonic, viewing };

  const envelope = await sealWithPassphrase(JSON.stringify(secret), passphrase);
  const address = addressFromMnemonic(mnemonic);

  return {
    secret,
    sealed: {
      envelope,
      address,
      viewingPublicKey: viewing.publicKey,
      viewingKeyId: await viewingKeyId(viewing.publicKey),
    },
  };
}

export async function openSealedWallet(envelope: Parameters<typeof openWithPassphrase>[0], passphrase: string): Promise<WalletSecret> {
  const plaintext = await openWithPassphrase(envelope, passphrase);
  const parsed = JSON.parse(plaintext) as WalletSecret;
  if (parsed.version !== 1 || !parsed.mnemonic || !parsed.viewing) {
    throw new Error("This envelope does not contain a CloakPay wallet.");
  }
  return parsed;
}

/** Keeps the unlocked wallet for the tab only, so a reload does not lock the user out mid-flow. */
export function stashSecret(secret: WalletSecret) {
  sessionStorage.setItem(DEVICE_KEY, JSON.stringify(secret));
}

export function readStashedSecret(): WalletSecret | null {
  const raw = sessionStorage.getItem(DEVICE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as WalletSecret;
  } catch {
    return null;
  }
}

export function clearStashedSecret() {
  sessionStorage.removeItem(DEVICE_KEY);
}

export { encryptNoteToRecipient, decryptNoteFromSender, viewingKeyId };

/** The server stores the envelope; it can return it, but it cannot open it. */
export async function fetchKeyEnvelope(): Promise<unknown> {
  const response = await fetch("/api/wallet", { cache: "no-store" });
  const body = (await response.json()) as {
    ok: boolean;
    data?: { wallet: { keyEnvelope: unknown } | null };
  };
  if (!body.ok || !body.data?.wallet) {
    throw new Error("This account does not have a wallet yet. Finish onboarding first.");
  }
  return body.data.wallet.keyEnvelope;
}

/**
 * Returns the unlocked wallet for this tab.
 *
 * A wallet opened earlier in the session is reused, so a user is not asked for
 * the passphrase twice while composing a payment. Failing to unlock never
 * destroys anything: the envelope is still on the server.
 */
export async function unlockWallet(passphrase?: string): Promise<WalletSecret> {
  const stashed = readStashedSecret();
  if (stashed) return stashed;
  if (!passphrase) {
    throw new Error("Enter your passphrase to unlock signing for this session.");
  }
  const envelope = await fetchKeyEnvelope();
  const secret = await openSealedWallet(
    envelope as Parameters<typeof openWithPassphrase>[0],
    passphrase,
  );
  stashSecret(secret);
  return secret;
}

export function isUnlocked(): boolean {
  return readStashedSecret() !== null;
}
