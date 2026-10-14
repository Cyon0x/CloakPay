import { fail, handle, ok } from "@/lib/api";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { rateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

/**
 * Recipient lookup by username.
 *
 * Returns only what a payer needs: username, display name, avatar and the
 * viewing key id used to seal a private note. It never returns an email, a
 * provider account id, a wallet address, or any internal identifier.
 */
export async function GET(request: Request) {
  try {
    const me = await requireUser();
    const query = (new URL(request.url).searchParams.get("q") ?? "").trim().toLowerCase();
    if (query.length < 2) return ok({ results: [] });

    const limit = await rateLimit(`search:${me.userId}`, { limit: 60, windowSeconds: 60 });
    if (!limit.allowed) return fail(429, "rate_limited", "Slow down a moment.");

    const rows = await db()<
      { username: string; display_name: string | null; avatar_url: string | null; viewing_key_id: string | null }[]
    >`
      select u.username, u.display_name, u.avatar_url, w.viewing_key_id
      from users u
      left join wallets w on w.user_id = u.id
      where u.username_lower like ${query + "%"}
        and u.id <> ${me.userId}
      order by u.username_lower
      limit 8
    `;

    return ok({
      results: rows.map((row) => ({
        username: row.username,
        displayName: row.display_name,
        avatarUrl: row.avatar_url,
        canReceivePrivately: Boolean(row.viewing_key_id),
      })),
    });
  } catch (error) {
    return handle(error);
  }
}
