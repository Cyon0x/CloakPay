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
    return ok({ notifications: rows });
  } catch (error) {
    return handle(error);
  }
}

export async function PATCH(request: Request) {
  try {
    if (!assertSameOrigin(request)) return fail(403, "bad_origin", "Request rejected.");
    const user = await requireUser();
    await db()`
      update notifications set read_at = now()
      where user_id = ${user.userId} and read_at is null
    `;
    return ok({ marked: true });
  } catch (error) {
    return handle(error);
  }
}
