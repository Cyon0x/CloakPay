import { assertSameOrigin, fail, handle, ok } from "@/lib/api";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await requireUser();
    const rows = await db()<
      { id: string; kind: string; title: string; body: string | null; payload: unknown; read_at: Date | null; created_at: Date }[]
    >`
      select id, kind, title, body, payload, read_at, created_at
      from notifications
      where user_id = ${user.userId}
      order by created_at desc
      limit 50
    `;
    const counts = await db()<{ count: number }[]>`
      select count(*)::int as count from notifications
      where user_id = ${user.userId} and read_at is null
    `;
    return ok({ notifications: rows, unread: counts[0]?.count ?? 0 });
  } catch (error) {
    return handle(error);
  }
}

export async function PATCH(request: Request) {
  try {
    if (!assertSameOrigin(request)) return fail(403, "bad_origin", "Request rejected.");
    const user = await requireUser();
    const marked = await db()`
      update notifications set read_at = now()
      where user_id = ${user.userId} and read_at is null
      returning id
    `;
    return ok({ marked: marked.length, unread: 0 });
  } catch (error) {
    return handle(error);
  }
}
