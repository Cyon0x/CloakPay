/**
 * Viewing keys.
 *
 * A viewing key is an ECDH P-256 pair that can decrypt notes addressed to its
 * owner and can do nothing else. It is deliberately separate from the spending
 * key: handing someone a viewing key discloses what you received without giving
 * them any ability to move it.
 *
 * The web app builds this pair with WebCrypto, which Hermes does not expose.
 * This module produces the identical artefacts with `@noble/curves`: the public
 * key is the uncompressed SEC1 point, the JWK carries `x` and `y` in the same
 * base64url form WebCrypto exports, and the key id is the first 16 bytes of
 * SHA-256 over that point. A key generated here is indistinguishable from one
 * generated in a browser.
 */
import { p256 } from "@noble/curves/p256";
import { sha256 } from "@noble/hashes/sha256";
import { b64url, fromB64url } from "./b64";

/** The subset of the JWK shape CloakPay stores. Matches `JsonWebKey` on the web. */
export interface ViewingJwk {
  kty: "EC";
  crv: "P-256";
  x: string;
  y: string;
  d?: string;
}

export interface ViewingKeyPair {
  publicKey: ViewingJwk;
  privateKey: ViewingJwk;
}

/** The uncompressed public point, `0x04 || X || Y`, the form WebCrypto exports. */
export function rawPublicKey(publicKey: ViewingJwk): Uint8Array {
  const x = fromB64url(publicKey.x);
  const y = fromB64url(publicKey.y);
  const raw = new Uint8Array(65);
  raw[0] = 4;
  raw.set(x, 1);
  raw.set(y, 33);
  return raw;
}

export function createViewingKeyPair(): ViewingKeyPair {
  const privateKey = p256.utils.randomPrivateKey();
  const uncompressed = p256.getPublicKey(privateKey, false);
  const x = b64url(uncompressed.slice(1, 33));
  const y = b64url(uncompressed.slice(33, 65));
  return {
    publicKey: { kty: "EC", crv: "P-256", x, y },
    privateKey: { kty: "EC", crv: "P-256", x, y, d: b64url(privateKey) },
  };
}

/**
 * A stable, publishable identifier for a viewing key.
 *
 * The server stores this so a payer can name the key they sealed a note to
 * without ever learning the key. It is a truncated digest, so it is not
 * reversible and cannot be used to decrypt anything.
 */
export function viewingKeyId(publicKey: ViewingJwk): string {
  return b64url(sha256(rawPublicKey(publicKey)).slice(0, 16));
}
