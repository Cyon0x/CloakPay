import { z } from "zod";
import { assertSameOrigin, fail, handle, ok } from "@/lib/api";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { paymentCode } from "@/lib/codes";
import { parseToWei } from "@/lib/payments";
import { denominationById } from "@/config/pool";
import { shieldedPoolEnabled } from "@/config/features";

export const dynamic = "force-dynamic";

const createSchema = z.object({
  title: z.string().max(80).optional(),
  description: z.string().max(200).optional(),
  denominationId: z.string().optional(),
  amount: z.string().optional(),
  mode: z.enum(["private", "public", "record"]).default("private"),
  reusable: z.boolean().default(true),
  maxUses: z.number().int().min(1).max(1000).optional(),
  expiresInHours: z.number().int().min(1).max(24 * 90).optional(),
});

export async function GET() {
  try {
    const user = await requireUser();
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
        created_at: Date;
      }[]
    >`
      select code, title, description, amount_wei, denomination_id, mode, reusable, max_uses,
             uses, expires_at, status, created_at
      from payment_links
      where owner_user_id = ${user.userId}
      order by created_at desc
      limit 50
    `;
    return ok({ links: rows });
  } catch (error) {
    return handle(error);
  }
}

export async function POST(request: Request) {
  try {
    if (!assertSameOrigin(request)) return fail(403, "bad_origin", "Request rejected.");
    const user = await requireUser();
    const parsed = createSchema.safeParse(await request.json());
    if (!parsed.success) return fail(400, "invalid_body", "That link request was not valid.");
    const body = parsed.data;

    // A link's mode is the promise its owner makes about how they will be
    // paid, and a private one cannot be kept while the pool is paused. Refusing
    // it here means no payer is ever handed a link whose whole point is
    // unavailable.
    if (body.mode === "private" && !shieldedPoolEnabled()) {
      return fail(
        409,
        "shielded_pool_paused",
        "Private payment links are paused while the shielded pool is off. A link created now asks for an ordinary payment, and says so.",
      );
    }

    let amountWei: bigint | null = null;
    if (body.denominationId) {
      const denomination = denominationById(body.denominationId);
      if (!denomination) return fail(400, "unknown_denomination", "Unsupported amount.");
      amountWei = denomination.wei;
    } else if (body.amount) {
      try {
        amountWei = parseToWei(body.amount);
      } catch (error) {
        return fail(400, "invalid_amount", (error as Error).message);
      }
    }

    const code = paymentCode();
    const expiresAt = body.expiresInHours
      ? new Date(Date.now() + body.expiresInHours * 3600_000)
      : null;

    const rows = await db()<{ code: string }[]>`
      insert into payment_links (
        code, owner_user_id, title, description, amount_wei, denomination_id,
        mode, reusable, max_uses, expires_at
      ) values (
        ${code}, ${user.userId}, ${body.title ?? null}, ${body.description ?? null},
        ${amountWei === null ? null : amountWei.toString()},
        ${body.denominationId ?? null},
        ${body.mode}, ${body.reusable}, ${body.maxUses ?? null}, ${expiresAt}
      )
      returning code
    `;

    return ok({ code: rows[0].code }, { status: 201 });
  } catch (error) {
    return handle(error);
  }
}
