import { z } from "zod";
import { createHash } from "node:crypto";
import { fail, handle, ok } from "@/lib/api";
import { db } from "@/lib/db";
import { createSession } from "@/lib/session";
import { rateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const bodySchema = z.object({ code: z.string().min(20).max(120) });

/**
 * Trades a one-time code for a session token.
 *
 * Deliberately not origin-restricted: a native client sends no Origin header.
 * The code carries the security instead. Thirty-two random bytes, single use,
 * two-minute expiry, and it is deleted by the same statement that reads it, so
 * two concurrent attempts cannot both succeed.
 */
export async function POST(request: Request) {
  try {
    const parsed = bodySchema.safeParse(await request.json());
    if (!parsed.success) return fail(400, "invalid_body", "That sign-in could not be completed.");

    const limit = await rateLimit(`mobile-exchange:${parsed.data.code.slice(0, 12)}`, {
      limit: 10,
      windowSeconds: 60,
    });
    if (!limit.allowed) return fail(429, "rate_limited", "Too many attempts. Wait a minute.");

    const hash = createHash("sha256").update(parsed.data.code).digest("hex");
    const rows = await db()<{ user_id: string }[]>`
      delete from auth_codes
      where code_hash = ${hash} and expires_at > now() and consumed_at is null
      returning user_id
    `;
    if (!rows[0]) {
      return fail(401, "invalid_code", "That sign-in link has expired. Try again.");
    }

    const token = await createSession(rows[0].user_id, request.headers.get("user-agent"), {
      setCookie: false,
    });
    return ok({ token });
  } catch (error) {
    return handle(error);
  }
}
