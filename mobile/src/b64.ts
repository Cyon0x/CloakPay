/**
 * base64url helpers.
 *
 * The web app gets these from `btoa`/`atob`; Hermes has neither, so they go
 * through the `buffer` polyfill instead. The alphabet is the same URL-safe one
 * the browser uses, which is what keeps an envelope written on a phone readable
 * in a browser and the other way round.
 */
const BufferImpl = require("buffer").Buffer as typeof import("buffer").Buffer;

export function b64url(bytes: Uint8Array): string {
  return BufferImpl.from(bytes).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function fromB64url(value: string): Uint8Array {
  return new Uint8Array(BufferImpl.from(value.replace(/-/g, "+").replace(/_/g, "/"), "base64"));
}

export function utf8(value: string): Uint8Array {
  return new Uint8Array(BufferImpl.from(value, "utf8"));
}

export function fromUtf8(bytes: Uint8Array): string {
  return BufferImpl.from(bytes).toString("utf8");
}
