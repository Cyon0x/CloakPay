import { z } from "zod";
import { assertSameOrigin, fail, handle, ok } from "@/lib/api";
import { SQLSTATE, db, sqlStateOf } from "@/lib/db";
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
        // `username_lower` is `generated always as (lower(username)) stored`, so
        // it must not appear here: naming it makes Postgres reject the whole
        // statement with 428C9 and no row is written. It maintains itself.
        await db()`
          update users
          set username = ${normalised},
              display_name = coalesce(${displayName ?? null}, display_name),
              updated_at = now()
          where id = ${user.userId}
        `;
      } catch (error) {
        // Only these two outcomes are the caller's to see. The unique index is
        // the real guard and this catches a lost race between the check above
        // and the write; everything else is our failure, not a taken name.
        const state = sqlStateOf(error);
        if (state === SQLSTATE.uniqueViolation) {
          return fail(409, "username_taken", "That username is taken.");
        }
        if (state === SQLSTATE.checkViolation) {
          return fail(400, "invalid_username", "That username is not allowed.");
        }
        throw error;
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
