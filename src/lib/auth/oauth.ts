import { createHash, randomBytes } from "node:crypto";
import { db } from "../db";
import { env } from "../env";
import { beginXAuthorization, exchangeXVerifier, readXUser } from "./oauth1";

/**
 * Google and X are the only ways to sign in.
 *
 * Google signs in with an authorization-code flow with PKCE, implemented here
 * rather than pulled from a dependency because the behaviour we need is small
 * enough to review in one sitting.
 *
 * X does not answer that flow for this app any more. Its token exchange
 * succeeds and then `GET /2/users/me` refuses the resulting user token with a
 * `403`, while the same endpoint accepts an OAuth 1.0a user token from the same
 * app, so X runs on 1.0a instead: see `src/lib/auth/oauth1.ts`. Setting
 * `X_OAUTH_VERSION=2` puts it back on the flow below, which is kept because it
 * is what should work if X fixes the entitlement.
 *
 * Guarantees:
 *   * `state` is generated per attempt, stored server-side, single-use, and
 *     expires after ten minutes.
 *   * the per-handshake secret (`code_verifier` for PKCE, the request-token
 *     secret for X's 1.0a) never leaves the server.
 *   * Identity is keyed on the provider's stable account id, never on a handle
 *     or an email address, both of which can change or be reassigned.
 */

export type ProviderId = "google" | "x";

/**
 * Sentinel for "this handshake came from the native app".
 *
 * It is not a URL: the callback recognises it and returns a deep link carrying a
 * one-time code instead of a path on the web app.
 */
export const MOBILE_RETURN = "mobile-app";

export interface Profile {
  accountId: string;
  handle: string | null;
  email: string | null;
  displayName: string | null;
  avatarUrl: string | null;
}

interface ProviderDefinition {
  id: ProviderId;
  authorizeUrl: string;
  tokenUrl: string;
  scope: string;
  clientId: () => string;
  clientSecret: () => string;
  /** X requires HTTP Basic on the token endpoint; Google puts the secret in the body. */
  tokenAuth: "basic" | "body";
  profile: (accessToken: string) => Promise<Profile>;
}

const PROVIDERS: Record<ProviderId, ProviderDefinition> = {
  google: {
    id: "google",
    authorizeUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
    scope: "openid email profile",
    clientId: () => env.google.clientId,
    clientSecret: () => env.google.clientSecret,
    tokenAuth: "body",
    async profile(accessToken) {
      const response = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
        headers: { authorization: `Bearer ${accessToken}` },
      });
      if (!response.ok) {
        throw new Error(`google_userinfo_failed:${response.status}:${await describeProviderError(response)}`);
      }
      const body = (await response.json()) as {
        sub: string;
        email?: string;
        name?: string;
        picture?: string;
      };
      return {
        accountId: body.sub,
        handle: body.email?.split("@")[0]?.toLowerCase() ?? null,
        email: body.email ?? null,
        displayName: body.name ?? null,
        avatarUrl: body.picture ?? null,
      };
    },
  },
  x: {
    id: "x",
    authorizeUrl: "https://x.com/i/oauth2/authorize",
    tokenUrl: "https://api.x.com/2/oauth2/token",
    scope: "users.read",
    clientId: () => env.x.clientId,
    clientSecret: () => env.x.clientSecret,
    tokenAuth: "basic",
    async profile(accessToken) {
      const response = await fetch(
        "https://api.x.com/2/users/me?user.fields=profile_image_url,name,username",
        { headers: { authorization: `Bearer ${accessToken}` } },
      );
      if (!response.ok) {
        throw new Error(`x_userinfo_failed:${response.status}:${await describeProviderError(response)}`);
      }
      const body = (await response.json()) as {
        data: { id: string; name?: string; username?: string; profile_image_url?: string };
      };
      return {
        accountId: body.data.id,
        handle: body.data.username ?? null,
        email: null, // X only returns an email with an additional, separately reviewed scope
        displayName: body.data.name ?? null,
        avatarUrl: body.data.profile_image_url ?? null,
      };
    },
  },
};

export function getProvider(id: string): ProviderDefinition {
  if (id !== "google" && id !== "x") throw new Error(`unsupported provider: ${id}`);
  return PROVIDERS[id];
}

export function redirectUri(provider: ProviderId): string {
  return `${env.appUrl}/api/auth/${provider}/callback`;
}

/**
 * The provider's own words for a rejected request.
 *
 * `!response.ok` on its own is not a diagnosis: the same endpoint answers 200
 * for a good user token, 401 for a bad one, 403 when the token is missing a
 * scope, and 402 when the app is out of credits, and those want four different
 * fixes. X explains which in `title`/`detail`, so keep that, trimmed, and never
 * the request itself.
 */
async function describeProviderError(response: Response): Promise<string> {
  try {
    const text = await response.text();
    const parsed = JSON.parse(text) as {
      title?: string;
      detail?: string;
      error?: string;
      error_description?: string;
    };
    const said = [parsed.title, parsed.detail ?? parsed.error_description ?? parsed.error]
      .filter(Boolean)
      .join(" - ");
    return (said || text).replace(/\s+/g, " ").trim().slice(0, 200);
  } catch {
    return "no readable body";
  }
}

function base64url(buffer: Buffer): string {
  return buffer.toString("base64url");
}

function sha256base64url(value: string): string {
  return base64url(createHash("sha256").update(value).digest());
}

/** Creates and persists a single-use handshake record. */
export async function beginAuthorization(provider: ProviderId, returnTo: string) {
  if (provider === "x" && env.x.oauthVersion === "1") return beginXHandshake(returnTo);

  const definition = getProvider(provider);
  const state = base64url(randomBytes(32));
  const codeVerifier = base64url(randomBytes(32));

  await db()`
    insert into oauth_states (state, provider, code_verifier, redirect_uri, return_to)
    values (${state}, ${provider}, ${codeVerifier}, ${redirectUri(provider)}, ${returnTo})
  `;

  const url = new URL(definition.authorizeUrl);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", definition.clientId());
  url.searchParams.set("redirect_uri", redirectUri(provider));
  url.searchParams.set("scope", definition.scope);
  url.searchParams.set("state", state);
  url.searchParams.set("code_challenge", sha256base64url(codeVerifier));
  url.searchParams.set("code_challenge_method", "S256");
  if (provider === "google") {
    url.searchParams.set("prompt", "select_account");
  }

  return { url: url.toString(), state };
}

/**
 * Starts X's OAuth 1.0a handshake and persists the half that must stay here.
 *
 * X's request token is unguessable and single use, so it takes the place of the
 * `state` value the other flows generate, and its secret is stored in the same
 * per-handshake column the PKCE verifier uses. `consumeState` therefore guards
 * both flows with one mechanism.
 */
async function beginXHandshake(returnTo: string) {
  const callback = redirectUri("x");
  const { request, authorizeUrl } = await beginXAuthorization(callback);

  await db()`
    insert into oauth_states (state, provider, code_verifier, redirect_uri, return_to)
    values (${request.token}, 'x', ${request.secret}, ${callback}, ${returnTo})
  `;

  return { url: authorizeUrl, state: request.token };
}

/**
 * Consumes a handshake by state. Returns null when the state is unknown,
 * expired, already used, or belongs to a different provider: all four cases are
 * rejected identically so a caller cannot probe which one it was.
 */
export async function consumeState(state: string, provider: ProviderId) {
  const rows = await db()<
    { code_verifier: string; redirect_uri: string; return_to: string }[]
  >`
    delete from oauth_states
    where state = ${state}
      and provider = ${provider}
      and expires_at > now()
    returning code_verifier, redirect_uri, return_to
  `;
  return rows[0] ?? null;
}

/**
 * Completes a handshake and returns the provider profile.
 *
 * `state` and `code` are what the provider sent back; `secret` and `redirectUri`
 * come from the handshake row. For X on 1.0a the state is the request token, the
 * code is the verifier, and the secret is the request-token secret.
 */
export async function exchangeCode(
  provider: ProviderId,
  handshake: { state: string; code: string; secret: string; redirectUri: string },
): Promise<Profile> {
  if (provider === "x" && env.x.oauthVersion === "1") {
    const access = await exchangeXVerifier(
      { token: handshake.state, secret: handshake.secret },
      handshake.code,
    );
    const user = await readXUser(access);
    // X only returns an email address with a separate, reviewed scope, so the
    // profile deliberately carries none.
    return {
      accountId: user.id,
      handle: user.handle,
      email: null,
      displayName: user.displayName,
      avatarUrl: user.avatarUrl,
    };
  }

  const { code, secret: codeVerifier, redirectUri: redirect } = handshake;
  const definition = getProvider(provider);
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: redirect,
    code_verifier: codeVerifier,
    client_id: definition.clientId(),
  });
  const headers: Record<string, string> = {
    "content-type": "application/x-www-form-urlencoded",
  };

  if (definition.tokenAuth === "basic") {
    const credentials = Buffer.from(
      `${definition.clientId()}:${definition.clientSecret()}`,
    ).toString("base64");
    headers.authorization = `Basic ${credentials}`;
  } else {
    body.set("client_secret", definition.clientSecret());
  }

  const response = await fetch(definition.tokenUrl, { method: "POST", headers, body });
  if (!response.ok) {
    // The body can echo secrets, so it is never logged verbatim.
    throw new Error(`token_exchange_failed:${response.status}`);
  }
  const token = (await response.json()) as { access_token?: string };
  if (!token.access_token) throw new Error("token_exchange_missing_access_token");

  // The provider token is used once, to read the profile, and then dropped.
  // CloakPay has no reason to keep it.
  return definition.profile(token.access_token);
}

/** Removes expired handshake rows. Called opportunistically on sign-in start. */
export async function pruneExpiredStates() {
  await db()`delete from oauth_states where expires_at < now()`;
}
