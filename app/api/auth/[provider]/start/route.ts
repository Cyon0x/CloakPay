import { NextResponse } from "next/server";
import { MOBILE_RETURN, beginAuthorization, getProvider, pruneExpiredStates } from "@/lib/auth/oauth";
import { rateLimit } from "@/lib/rate-limit";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";

/** Starts the OAuth handshake and redirects to the provider. */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ provider: string }> },
) {
  const { provider } = await params;
  const url = new URL(request.url);

  try {
    getProvider(provider);
  } catch {
    return NextResponse.redirect(new URL("/signin?error=unknown_provider", env.appUrl));
  }

  const forwarded = request.headers.get("x-forwarded-for") ?? "local";
  const limit = await rateLimit(`oauth-start:${forwarded}`, { limit: 30, windowSeconds: 60 });
  if (!limit.allowed) {
    return NextResponse.redirect(new URL("/signin?error=rate_limited", env.appUrl));
  }

  // A native client asks for a deep-link handoff. Anything else must be a
  // same-site path: an absolute URL here would be an open redirect.
  const wantsApp = url.searchParams.get("client") === "app";
  const requested = url.searchParams.get("next") ?? "/dashboard";
  const returnTo = wantsApp
    ? MOBILE_RETURN
    : requested.startsWith("/") && !requested.startsWith("//")
      ? requested
      : "/dashboard";

  await pruneExpiredStates();

  let authorizeUrl: string;
  try {
    ({ url: authorizeUrl } = await beginAuthorization(provider as "google" | "x", returnTo));
  } catch (error) {
    // The provider refused before the user saw anything: a callback URL it will
    // not accept, a revoked key, or a refusal of its own. The reason belongs in
    // the log, and the user gets a page that says the attempt did not start
    // rather than a 500.
    console.error("[oauth] start failed", provider, (error as Error).message);
    return NextResponse.redirect(new URL("/signin?error=provider_refused", env.appUrl));
  }

  return NextResponse.redirect(authorizeUrl);
}
