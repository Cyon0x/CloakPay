import { createHmac, randomBytes } from "node:crypto";
import { env } from "../env";

/**
 * X's OAuth 1.0a handshake.
 *
 * CloakPay uses the authorization-code flow with PKCE wherever a provider
 * supports it, and Google still does. X has stopped honouring that flow for
 * this app: the token exchange succeeds, and then `GET /2/users/me` with the
 * resulting user token is answered `403 Forbidden`, while the *same endpoint*
 * answers `200` for an OAuth 1.0a user token from the same app. X still runs
 * 1.0a, so "Continue with X" runs on it.
 *
 * Identity does not change with the flow: both return the same numeric X user
 * id, so a person who signed in under either one is the same account.
 *
 * 1.0a is signature-based. Each request below is signed with HMAC-SHA1 over a
 * normalised parameter string, the consumer secret stays on the server, and the
 * request-token secret is kept in the handshake row rather than in a URL.
 */

const REQUEST_TOKEN_URL = "https://api.x.com/oauth/request_token";
const AUTHORIZE_URL = "https://api.x.com/oauth/authorize";
const ACCESS_TOKEN_URL = "https://api.x.com/oauth/access_token";
const LOOKUP_URL = "https://api.x.com/2/users/me?user.fields=profile_image_url,name,username";

export interface TokenPair {
  token: string;
  secret: string;
}

export interface XUser {
  id: string;
  handle: string | null;
  displayName: string | null;
  avatarUrl: string | null;
}

/**
 * RFC 5849 §3.6 percent-encoding.
 *
 * `encodeURIComponent` leaves `!*'()` alone, and those are the four characters
 * the spec explicitly requires escaping. Getting this wrong produces a valid
 * looking signature that X rejects as if the keys were wrong.
 */
function percentEncode(value: string): string {
  return encodeURIComponent(value).replace(
    /[!*'()]/g,
    (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

interface SignatureInput {
  method: string;
  url: string;
  consumerKey: string;
  consumerSecret: string;
  token?: string;
  tokenSecret?: string;
  extraParams?: Record<string, string>;
  nonce?: string;
  timestamp?: string;
}

/**
 * The `Authorization: OAuth ...` header for one signed request.
 *
 * Exported so a test can pin the signature for a fixed nonce and timestamp:
 * everything that reaches the signature base string is part of the contract
 * with X, and a quiet change to the encoding or the sort order fails in a way
 * that reads as "the secret is wrong".
 */
export function oauth1AuthorizationHeader(input: SignatureInput): string {
  const target = new URL(input.url);
  const parameters: Record<string, string> = { ...input.extraParams };
  for (const [name, value] of target.searchParams) parameters[name] = value;

  parameters.oauth_consumer_key = input.consumerKey;
  parameters.oauth_nonce = input.nonce ?? randomBytes(16).toString("hex");
  parameters.oauth_signature_method = "HMAC-SHA1";
  parameters.oauth_timestamp = input.timestamp ?? Math.floor(Date.now() / 1000).toString();
  if (input.token) parameters.oauth_token = input.token;
  parameters.oauth_version = "1.0";

  const normalised = Object.keys(parameters)
    .sort()
    .map((name) => `${percentEncode(name)}=${percentEncode(parameters[name])}`)
    .join("&");
  const base = [
    input.method.toUpperCase(),
    percentEncode(target.origin + target.pathname),
    percentEncode(normalised),
  ].join("&");
  const signingKey = `${percentEncode(input.consumerSecret)}&${percentEncode(input.tokenSecret ?? "")}`;
  const signature = createHmac("sha1", signingKey).update(base).digest("base64");

  const header = Object.keys(parameters)
    .filter((name) => name.startsWith("oauth_"))
    .sort()
    .map((name) => `${percentEncode(name)}="${percentEncode(parameters[name])}"`)
    .join(", ");

  return `OAuth ${header}, oauth_signature="${percentEncode(signature)}"`;
}

/**
 * X's own words for a rejected request, trimmed, never the request itself.
 *
 * X answers the 1.0a endpoints in three shapes: JSON for the v2 lookups, an
 * `errors` XML document for a refusal such as an unapproved callback URL, and
 * `key=value` pairs for a token it would not issue. Exported because "X refused
 * and here is why" is the part of this flow that is hardest to see.
 */
export function describeXError(body: string): string {
  const trimmed = body.trim();
  if (trimmed.startsWith("{")) {
    try {
      const parsed = JSON.parse(trimmed) as {
        errors?: { message?: string }[];
        title?: string;
        detail?: string;
        error?: string;
        error_description?: string;
      };
      const said = [
        parsed.errors?.[0]?.message ?? parsed.title,
        parsed.detail ?? parsed.error_description ?? parsed.error,
      ].filter(Boolean);
      if (said.length > 0) return said.join(" - ").slice(0, 200);
    } catch {
      return "unreadable body";
    }
  }
  if (trimmed.startsWith("<")) {
    const code = (trimmed.match(/<error code="([^"]+)"/) ?? [])[1];
    const message = (trimmed.match(/<error[^>]*>([^<]+)<\/error>/) ?? [])[1];
    const said = [code, message].filter(Boolean).join(": ");
    if (said) return said.replace(/\s+/g, " ").trim().slice(0, 200);
  }
  // The 1.0a endpoints answer with `key=value` pairs instead of JSON.
  const pairs = new URLSearchParams(trimmed);
  const said = pairs.get("error_description") ?? pairs.get("error");
  return (said ?? trimmed).replace(/\s+/g, " ").trim().slice(0, 200) || "no readable body";
}

function parseTokenPair(body: string): TokenPair | null {
  const pairs = new URLSearchParams(body);
  const token = pairs.get("oauth_token");
  const secret = pairs.get("oauth_token_secret");
  return token && secret ? { token, secret } : null;
}

function signingCredentials(): { consumerKey: string; consumerSecret: string } {
  const consumerKey = env.x.consumerKey;
  const consumerSecret = env.x.consumerSecret;
  if (!consumerKey || !consumerSecret) {
    throw new Error("x_oauth1_not_configured:X_CONSUMER_KEY and X_CONSUMER_SECRET are required");
  }
  return { consumerKey, consumerSecret };
}

async function signedRequest(
  url: string,
  options: { method?: string; token?: TokenPair; extraParams?: Record<string, string> } = {},
): Promise<Response> {
  const method = options.method ?? "GET";
  const { consumerKey, consumerSecret } = signingCredentials();
  return fetch(url, {
    method,
    headers: {
      authorization: oauth1AuthorizationHeader({
        method,
        url,
        consumerKey,
        consumerSecret,
        token: options.token?.token,
        tokenSecret: options.token?.secret,
        extraParams: options.extraParams,
      }),
    },
  });
}

/** Asks X for a request token, and the URL the user has to be sent to. */
export async function beginXAuthorization(
  callback: string,
): Promise<{ request: TokenPair; authorizeUrl: string }> {
  const response = await signedRequest(REQUEST_TOKEN_URL, {
    method: "POST",
    extraParams: { oauth_callback: callback },
  });
  const body = await response.text();
  const request = response.ok ? parseTokenPair(body) : null;
  if (!request) throw new Error(`x_request_token_failed:${response.status}:${describeXError(body)}`);

  const authorize = new URL(AUTHORIZE_URL);
  authorize.searchParams.set("oauth_token", request.token);
  return { request, authorizeUrl: authorize.toString() };
}

/** Trades an authorised request token, and its verifier, for the access token. */
export async function exchangeXVerifier(request: TokenPair, verifier: string): Promise<TokenPair> {
  const response = await signedRequest(ACCESS_TOKEN_URL, {
    method: "POST",
    token: request,
    extraParams: { oauth_verifier: verifier },
  });
  const body = await response.text();
  const access = response.ok ? parseTokenPair(body) : null;
  if (!access) throw new Error(`x_access_token_failed:${response.status}:${describeXError(body)}`);
  return access;
}

/** Reads the signed-in X account, using the access token that was just issued. */
export async function readXUser(access: TokenPair): Promise<XUser> {
  const response = await signedRequest(LOOKUP_URL, { token: access });
  const body = await response.text();
  if (!response.ok) {
    throw new Error(`x_userinfo_failed:${response.status}:${describeXError(body)}`);
  }

  const parsed = JSON.parse(body) as {
    data?: { id?: string; name?: string; username?: string; profile_image_url?: string };
  };
  if (!parsed.data?.id) throw new Error("x_userinfo_failed:no account id in the response");

  return {
    id: parsed.data.id,
    handle: parsed.data.username ?? null,
    displayName: parsed.data.name ?? null,
    avatarUrl: parsed.data.profile_image_url ?? null,
  };
}
