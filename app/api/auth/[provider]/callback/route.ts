import { NextResponse } from "next/server";
import { createHash, randomBytes } from "node:crypto";
import { MOBILE_RETURN, consumeState, exchangeCode } from "@/lib/auth/oauth";
import { upsertUserFromProfile } from "@/lib/auth/accounts";
import { createSession } from "@/lib/session";
import { db } from "@/lib/db";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";

/**
 * Handles the provider redirect.
 *
 * Every failure path lands the user back on /signin with a short error code and
 * no token, code, or provider detail in the URL.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ provider: string }> },
) {
  const { provider } = await params;
  const url = new URL(request.url);

  const failure = (code: string) =>
    NextResponse.redirect(new URL(`/signin?error=${code}`, env.appUrl));

  if (provider !== "google" && provider !== "x") return failure("unknown_provider");

  // A user who cancels comes back as error=access_denied (the OAuth 2.0 flows)
  // or denied=<request token> (X on OAuth 1.0a).
  if (url.searchParams.get("error") || url.searchParams.get("denied")) {
    return failure("cancelled");
  }

  // X's OAuth 1.0a callback carries oauth_token and oauth_verifier instead of
  // state and code. The request token is unguessable, single use, and bound to
  // the handshake row, so it plays exactly the role `state` plays elsewhere.
  const state = url.searchParams.get("state") ?? url.searchParams.get("oauth_token");
  const code = url.searchParams.get("code") ?? url.searchParams.get("oauth_verifier");
  if (!state || !code) return failure("invalid_callback");

  const handshake = await consumeState(state, provider);
  if (!handshake) return failure("state_mismatch");

  let profile;
  try {
    profile = await exchangeCode(provider, {
      state,
      code,
      secret: handshake.code_verifier,
      redirectUri: handshake.redirect_uri,
    });
  } catch (error) {
    console.error("[oauth] exchange failed", provider, (error as Error).message);
    return failure("exchange_failed");
  }

  const { userId, isNewAccount } = await upsertUserFromProfile(provider, profile);

  // Native handoff: mint a one-time code, hand it to the app over the deep link,
  // and let the app exchange it for a token. No session is created here, so the
  // URL never carries anything usable.
  if (handshake.return_to === MOBILE_RETURN) {
    const code = randomBytes(32).toString("base64url");
    await db()`
      insert into auth_codes (code_hash, user_id)
      values (${createHash("sha256").update(code).digest("hex")}, ${userId})
    `;
    await db()`
      insert into audit_events (user_id, kind, detail)
      values (${userId}, 'session.mobile_handoff', ${db().json({ provider, newAccount: isNewAccount })})
    `;
    return NextResponse.redirect(`cloakpay://auth?code=${code}`);
  }

  await createSession(userId, request.headers.get("user-agent"));

  await db()`
    insert into audit_events (user_id, kind, detail)
    values (${userId}, 'session.created', ${db().json({ provider, newAccount: isNewAccount })})
  `;

  const destination = handshake.return_to.startsWith("/") ? handshake.return_to : "/dashboard";
  return NextResponse.redirect(new URL(destination, env.appUrl));
}
