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
  const { url: authorizeUrl } = await beginAuthorization(
    provider as "google" | "x",
    returnTo,
  );

  return NextResponse.redirect(authorizeUrl);
}
