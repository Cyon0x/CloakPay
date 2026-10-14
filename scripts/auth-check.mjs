#!/usr/bin/env node
/**
 * Checks the Google and X OAuth configuration before you rely on it.
 *
 * A wrong redirect URI or a mismatched client secret only shows up as a cryptic
 * page from the provider after a round trip, which is a slow way to find a typo.
 * This asks the providers directly and names what is wrong.
 *
 * It never prints a secret. It prints whether one is present, and what the
 * provider said about it.
 *
 * Usage:
 *   node scripts/auth-check.mjs                 # reads .env.local, then the environment
 *   APP_URL=https://example.com node scripts/auth-check.mjs
 */
import { existsSync, readFileSync } from "node:fs";

function loadEnv() {
  const values = { ...process.env };
  if (existsSync(".env.local")) {
    for (const line of readFileSync(".env.local", "utf8").split("\n")) {
      const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (match && !values[match[1]]) values[match[1]] = match[2].replace(/^["']|["']$/g, "");
    }
  }
  return values;
}

const env = loadEnv();
const appUrl = env.APP_URL || "http://localhost:3200";
const results = [];

function record(provider, ok, message) {
  results.push({ provider, ok, message });
}

/** Presence of the four values, reported without revealing any of them. */
function presence(provider) {
  const id = env[provider === "google" ? "GOOGLE_CLIENT_ID" : "X_CLIENT_ID"];
  const secret = env[provider === "google" ? "GOOGLE_CLIENT_SECRET" : "X_CLIENT_SECRET"];
  const label = provider === "google" ? "Google" : "X";
  if (!id && !secret) return record(provider, false, `${label}: no client id and no client secret set.`);
  if (!id) return record(provider, false, `${label}: client id is missing.`);
  if (!secret) return record(provider, false, `${label}: client secret is missing.`);
  return { id, secret };
}

const PROVIDERS = {
  google: {
    authorize: "https://accounts.google.com/o/oauth2/v2/auth",
    token: "https://oauth2.googleapis.com/token",
    scope: "openid email profile",
    tokenAuth: "body",
  },
  x: {
    authorize: "https://x.com/i/oauth2/authorize",
    token: "https://api.x.com/2/oauth2/token",
    scope: "users.read",
    tokenAuth: "basic",
  },
};

/**
 * Asks Google whether it recognises the client id and the redirect URI.
 *
 * Google answers an unusable pair by redirecting to its own error page with a
 * base64 `authError` parameter, which decodes to a plain reason. That is a
 * dependable answer and the only one available without a real sign-in: a
 * request that gets as far as a sign-in page proves nothing about the secret,
 * and a bogus client id also reaches a page, so "no error text" is reported as
 * unverified rather than as a pass.
 */
async function checkGoogleAuthorize(creds) {
  const definition = PROVIDERS.google;
  const redirect = `${appUrl}/api/auth/google/callback`;
  const url = new URL(definition.authorize);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", creds.id);
  url.searchParams.set("redirect_uri", redirect);
  url.searchParams.set("scope", definition.scope);
  url.searchParams.set("state", "cloakpay-auth-check");
  url.searchParams.set("code_challenge", "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM");
  url.searchParams.set("code_challenge_method", "S256");

  let response;
  try {
    response = await fetch(url, { redirect: "manual" });
  } catch (error) {
    return record("google", false, `Could not reach ${definition.authorize}: ${error.message}`);
  }

  const location = response.headers.get("location") ?? "";
  const encoded = (location.match(/authError=([^&]+)/) ?? [])[1];
  if (!encoded) {
    return record("google", null, "Reached the sign-in page. The client id looks real; the secret is checked below.");
  }

  const decoded = Buffer.from(decodeURIComponent(encoded), "base64").toString("latin1");
  // The payload is a protobuf that repeats the same sentence around a URL, so
  // it is reduced to the error code and the first clean sentence.
  const readable = (decoded.match(/[ -~]{4,}/g) ?? []).join(" ").replace(/\s+/g, " ").trim();
  const code = (readable.match(/^(redirect_uri_mismatch|invalid_client|invalid_request|unauthorized_client)/) ?? [])[1];
  const sentence = readable
    .replace(/^\S+\s*/, "")
    .replace(/https?:\/\/\S+/g, "")
    .split(/\.\s/)[0]
    .trim()
    .slice(0, 160);
  const reason = [code, sentence].filter(Boolean).join(": ");

  if (/redirect_uri_mismatch/i.test(reason)) {
    return record(
      "google",
      false,
      `Client id is real, but the redirect URI is not registered.\n        Add this exact URI in the Google console:\n          ${redirect}\n        Google said: ${reason}`,
    );
  }
  if (/invalid_client/i.test(reason)) {
    return record("google", false, `Google does not recognise this client id. Google said: ${reason}`);
  }
  return record("google", false, `Google rejected the request: ${reason}`);
}

/**
 * X runs its authorize screen as a single-page app, so a bad client id and a
 * good one both come back as an HTTP 200 carrying the same shell. There is no
 * honest way to read validity out of that response, so this reports that rather
 * than pretending. The token endpoint below is the real check.
 */
function reportXAuthorizeLimitation() {
  record(
    "x",
    null,
    "The X authorize screen cannot be verified from here: it renders the same page " +
      "whether or not the client id is real. The token check below is the dependable one.",
  );
}

/**
 * Sends a deliberately invalid grant to the token endpoint.
 *
 * "invalid_grant" means the client authenticated and merely disliked the code,
 * which is what a correct secret looks like. "invalid_client" means the secret
 * is wrong. This is the only way to check a secret without a real login.
 */
async function checkSecret(provider, creds) {
  const definition = PROVIDERS[provider];
  const redirect = `${appUrl}/api/auth/${provider}/callback`;
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code: "cloakpay-auth-check-invalid-code",
    redirect_uri: redirect,
    code_verifier: "cloakpay-auth-check-code-verifier",
    client_id: creds.id,
  });
  const headers = { "content-type": "application/x-www-form-urlencoded" };
  if (definition.tokenAuth === "basic") {
    headers.authorization = `Basic ${Buffer.from(`${creds.id}:${creds.secret}`).toString("base64")}`;
  } else {
    body.set("client_secret", creds.secret);
  }

  let response;
  try {
    response = await fetch(definition.token, { method: "POST", headers, body });
  } catch (error) {
    return record(provider, false, `Could not reach ${definition.token}: ${error.message}`);
  }

  const text = await response.text();
  const error = (text.match(/"error"\s*:\s*"([a-z_]+)"/i) ?? [])[1] ?? response.status.toString();

  if (error === "invalid_client") {
    return record(provider, false, "The token endpoint rejected the credentials: invalid_client. The secret is wrong.");
  }
  if (error === "invalid_grant" || error === "invalid_request") {
    return record(provider, true, `The token endpoint accepted the credentials (rejected the fake code with ${error}, as expected).`);
  }
  return record(provider, false, `Unexpected answer from the token endpoint: ${response.status} ${error}`);
}

console.log(`Checking OAuth configuration for ${appUrl}\n`);

const google = presence("google");
if (google) {
  await checkGoogleAuthorize(google);
  await checkSecret("google", google);
}

const x = presence("x");
if (x) {
  reportXAuthorizeLimitation();
  await checkSecret("x", x);
}

const width = Math.max(...results.map((r) => r.provider.length));
for (const result of results) {
  const label = result.ok === true ? "PASS" : result.ok === false ? "FAIL" : "INFO";
  console.log(`${label}  ${result.provider.padEnd(width)}  ${result.message}`);
}

const failures = results.filter((r) => r.ok === false).length;
const checks = results.filter((r) => r.ok !== null).length;
console.log(`\n${checks - failures} passed, ${failures} failed.`);
if (failures) {
  console.log("Sign-in is disabled for any provider that failed. The sign-in page says so too.");
}
process.exit(failures ? 1 : 0);
