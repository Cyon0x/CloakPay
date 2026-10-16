import { createHash, randomBytes } from "node:crypto";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "./db";
import { env } from "./env";

export const COOKIE_NAME = "cloakpay_session";
export const SESSION_COOKIE = COOKIE_NAME;
const SESSION_TTL_MS = 14 * 24 * 60 * 60 * 1000;

export interface SessionUser {
  userId: string;
  username: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  onboardingStep: "username" | "security" | "wallet" | "complete";
}

/** Opaque tokens only; the database stores a hash so a dump is not a login. */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Creates a session.
 *
 * The browser receives an httpOnly cookie. A native client passes
 * `setCookie: false` and takes the raw token back, because React Native has no
 * cookie jar it can rely on across a deep-link round trip.
 */
export async function createSession(
  userId: string,
  userAgent?: string | null,
  options: { setCookie?: boolean } = {},
) {
  const token = randomBytes(32).toString("base64url");
  const sql = db();
  await sql`
    insert into sessions (user_id, token_hash, user_agent)
    values (${userId}, ${hashToken(token)}, ${userAgent?.slice(0, 200) ?? null})
  `;
  if (options.setCookie !== false) {
    const store = await cookies();
    store.set(COOKIE_NAME, token, {
      httpOnly: true,
      sameSite: "lax",
      secure: env.isProduction,
      path: "/",
      maxAge: SESSION_TTL_MS / 1000,
    });
  }
  return token;
}

export async function destroySession() {
  const store = await cookies();
  const token = (await readPresentedToken()) ?? store.get(COOKIE_NAME)?.value;
  if (token) {
    await db()`update sessions set revoked_at = now() where token_hash = ${hashToken(token)}`;
  }
  store.delete(COOKIE_NAME);
}

/**
 * The token a request presented, from either transport.
 *
 * `Authorization: Bearer` is what the mobile app sends; the cookie is what the
 * browser sends. Exactly one is ever present, and neither is logged.
 */
async function readPresentedToken(): Promise<string | null> {
  try {
    const header = (await headers()).get("authorization");
    if (header?.toLowerCase().startsWith("bearer ")) {
      const value = header.slice(7).trim();
      return value.length >= 20 ? value : null;
    }
  } catch {
    // headers() is unavailable outside a request scope.
  }
  return null;
}

/**
 * Resolves the current session, or null. Expired and revoked sessions are
 * treated as absent rather than silently refreshed.
 */
export async function currentUser(): Promise<SessionUser | null> {
  const store = await cookies();
  const token = (await readPresentedToken()) ?? store.get(COOKIE_NAME)?.value;
  if (!token) return null;

  const sql = db();
  const rows = await sql<
    {
      id: string;
      username: string | null;
      display_name: string | null;
      avatar_url: string | null;
      onboarding_step: SessionUser["onboardingStep"];
    }[]
  >`
    select u.id, u.username, u.display_name, u.avatar_url, u.onboarding_step
    from sessions s
    join users u on u.id = s.user_id
    where s.token_hash = ${hashToken(token)}
      and s.revoked_at is null
      and s.expires_at > now()
    limit 1
  `;

  const row = rows[0];
  if (!row) return null;

  // Touch sparingly; this is a liveness signal, not a security control.
  await sql`update sessions set last_seen_at = now() where token_hash = ${hashToken(token)}`;

  return {
    userId: row.id,
    username: row.username,
    displayName: row.display_name,
    avatarUrl: row.avatar_url,
    onboardingStep: row.onboarding_step,
  };
}

export async function requireUser(): Promise<SessionUser> {
  const user = await currentUser();
  if (!user) throw new Error("UNAUTHENTICATED");
  return user;
}

/**
 * The current session, or a redirect to sign-in.
 *
 * App pages start with this rather than `currentUser()`. Returning early on a
 * null used to answer an expired or missing session with a 200 and an empty
 * page: no chrome, no guard, no explanation, and no way to tell it apart from a
 * broken page. An expired session is a signed-out visitor, so it is sent to the
 * same place `AuthedShell` sends one.
 */
export async function currentUserOrRedirect(): Promise<SessionUser> {
  const user = await currentUser();
  if (!user) redirect("/signin?error=session_expired");
  return user;
}
