import { z } from "zod";
import { assertSameOrigin, fail, handle, ok } from "@/lib/api";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { isUsernameTaken, validateUsername } from "@/lib/username";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  step: z.enum(["username", "security", "wallet", "complete"]),
  username: z.string().min(1).max(40).optional(),
  displayName: z.string().max(60).optional(),
});

/** Advances onboarding. Every write is scoped to the signed-in user. */
export async function POST(request: Request) {
  try {
    if (!assertSameOrigin(request)) return fail(403, "bad_origin", "Request rejected.");
    const user = await requireUser();
    const parsed = bodySchema.safeParse(await request.json());
    if (!parsed.success) return fail(400, "invalid_body", "That request was not valid.");
    const { step, username, displayName } = parsed.data;

    if (username !== undefined) {
      const valid = validateUsername(username);
      if (!valid.ok) return fail(400, "invalid_username", valid.reason);
      const normalised = username.trim().toLowerCase();
      if (await isUsernameTaken(normalised, user.userId)) {
        return fail(409, "username_taken", "That username is taken.");
      }
      try {
        await db()`
          update users
          set username = ${normalised},
              username_lower = ${normalised},
              display_name = coalesce(${displayName ?? null}, display_name),
              updated_at = now()
          where id = ${user.userId}
        `;
      } catch {
        // The unique index is the real guard; this catches a lost race.
        return fail(409, "username_taken", "That username is taken.");
      }
    }

    await db()`
      update users set onboarding_step = ${step}, updated_at = now() where id = ${user.userId}
    `;

    return ok({ step });
  } catch (error) {
    return handle(error);
  }
}
