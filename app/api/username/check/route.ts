import { ok, fail, handle } from "@/lib/api";
import { isUsernameTaken, validateUsername } from "@/lib/username";
import { rateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

/**
 * Availability is checked server-side and rate limited, so the endpoint cannot
 * be used to enumerate the whole username space cheaply.
 */
export async function GET(request: Request) {
  try {
    const value = new URL(request.url).searchParams.get("u") ?? "";
    const forwarded = request.headers.get("x-forwarded-for") ?? "local";
    const limit = await rateLimit(`username-check:${forwarded}`, {
      limit: 40,
      windowSeconds: 60,
    });
    if (!limit.allowed) return fail(429, "rate_limited", "Too many checks. Wait a moment.");

    const valid = validateUsername(value);
    if (!valid.ok) return ok({ username: value, available: false, reason: valid.reason });

    const username = value.trim().toLowerCase();
    const taken = await isUsernameTaken(username);
    return ok({
      username,
      available: !taken,
      reason: taken ? "That username is taken." : null,
    });
  } catch (error) {
    return handle(error);
  }
}
