import { z } from "zod";
import { assertSameOrigin, fail, handle, ok } from "@/lib/api";
import { requireUser } from "@/lib/session";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * Public link metadata for the checkout page.
 *
 * Only intentionally disclosed fields are returned: who is being paid, what for,
 * how much, and whether the link is still usable. The owner's wallet address,
 * account id, and connected identities are never exposed here.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ code: string }> },
) {
  try {
    const { code } = await params;
    const rows = await db()<
      {
        code: string;
        title: string | null;
        description: string | null;
        amount_wei: string | null;
        denomination_id: string | null;
        mode: string;
        reusable: boolean;
        max_uses: number | null;
        uses: number;
        expires_at: Date | null;
        status: string;
        username: string | null;
        display_name: string | null;
        avatar_url: string | null;
      }[]
    >`
      select l.code, l.title, l.description, l.amount_wei, l.denomination_id, l.mode,
             l.reusable, l.max_uses, l.uses, l.expires_at, l.status,
             u.username, u.display_name, u.avatar_url
      from payment_links l
      join users u on u.id = l.owner_user_id
      where l.code = ${code}
      limit 1
    `;

    const link = rows[0];
    if (!link) return fail(404, "not_found", "That payment link does not exist.");

    const expired = link.expires_at ? link.expires_at.getTime() < Date.now() : false;
    const exhausted = link.max_uses !== null && link.uses >= link.max_uses;
    const claimable =
      link.status === "active" && !expired && !exhausted && (link.reusable || link.uses === 0);

    return ok({
      link: {
        code: link.code,
        title: link.title,
        description: link.description,
        amountWei: link.amount_wei,
        denominationId: link.denomination_id,
        mode: link.mode,
        reusable: link.reusable,
        maxUses: link.max_uses,
        uses: link.uses,
        expiresAt: link.expires_at,
        claimable,
        reason: expired ? "expired" : exhausted ? "exhausted" : claimable ? null : "disabled",
        recipient: {
          username: link.username,
          displayName: link.display_name,
          avatarUrl: link.avatar_url,
        },
      },
    });
  } catch (error) {
    return handle(error);
  }
}

const patchSchema = z.object({
  status: z.enum(["active", "disabled"]),
});

/** Only the owner may disable or re-enable a link. */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ code: string }> },
) {
  try {
    if (!assertSameOrigin(request)) return fail(403, "bad_origin", "Request rejected.");
    const user = await requireUser();
    const { code } = await params;
    const parsed = patchSchema.safeParse(await request.json());
    if (!parsed.success) return fail(400, "invalid_body", "That update was not valid.");

    const updated = await db()<{ code: string; status: string }[]>`
      update payment_links
      set status = ${parsed.data.status}, updated_at = now()
      where code = ${code} and owner_user_id = ${user.userId}
      returning code, status
    `;
    if (!updated[0]) return fail(404, "not_found", "No such link.");
    return ok({ code: updated[0].code, status: updated[0].status });
  } catch (error) {
    return handle(error);
  }
}
