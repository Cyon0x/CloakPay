import { assertSameOrigin, fail, handle, ok } from "@/lib/api";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Marks one notification as read.
 *
 * The bulk PATCH is for "mark all read"; this one exists so opening a single
 * row does not silently clear the rest of the inbox.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    if (!assertSameOrigin(request)) return fail(403, "bad_origin", "Request rejected.");
    const user = await requireUser();
    const { id } = await params;
    if (!UUID.test(id)) return fail(400, "invalid_id", "That notification was not valid.");

    const marked = await db()`
      update notifications set read_at = now()
      where id = ${id} and user_id = ${user.userId} and read_at is null
      returning id
    `;
    if (marked.length === 0) {
      const exists = await db()`select 1 from notifications where id = ${id} and user_id = ${user.userId}`;
      if (exists.length === 0) return fail(404, "not_found", "No such notification.");
    }

    const unread = await db()<{ count: number }[]>`
      select count(*)::int as count from notifications
      where user_id = ${user.userId} and read_at is null
    `;
    return ok({ marked: marked.length > 0, unread: unread[0]?.count ?? 0 });
  } catch (error) {
    return handle(error);
  }
}
