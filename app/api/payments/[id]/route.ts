import { z } from "zod";
import { assertSameOrigin, fail, handle, ok } from "@/lib/api";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";

export const dynamic = "force-dynamic";

const patchSchema = z.object({
  status: z.enum(["pending", "submitted", "confirmed", "failed"]),
  txHash: z.string().max(80).optional(),
  nullifierHash: z.string().max(80).optional(),
  failureReason: z.string().max(200).optional(),
});

/**
 * Only the two parties to a payment may change its status, and "confirmed"
 * requires a transaction hash, so a client cannot mark its own payment settled.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    if (!assertSameOrigin(request)) return fail(403, "bad_origin", "Request rejected.");
    const user = await requireUser();
    const { id } = await params;
    const parsed = patchSchema.safeParse(await request.json());
    if (!parsed.success) return fail(400, "invalid_body", "That update was not valid.");
    const body = parsed.data;

    const rows = await db()<
      { from_user_id: string | null; to_user_id: string | null; status: string }[]
    >`
      select from_user_id, to_user_id, status from payments where id = ${id}
    `;
    const payment = rows[0];
    if (!payment) return fail(404, "not_found", "No such payment.");
    if (payment.from_user_id !== user.userId && payment.to_user_id !== user.userId) {
      return fail(403, "forbidden", "That payment is not yours.");
    }
    if (body.status === "confirmed" && !body.txHash) {
      return fail(400, "missing_tx_hash", "A confirmed payment needs a transaction hash.");
    }

    await db()`
      update payments
      set status = ${body.status},
          tx_hash = coalesce(${body.txHash ?? null}, tx_hash),
          nullifier_hash = coalesce(${body.nullifierHash ?? null}, nullifier_hash),
          failure_reason = ${body.failureReason ?? null},
          confirmed_at = case when ${body.status} = 'confirmed' then now() else confirmed_at end,
          submitted_at = case when ${body.status} = 'submitted' then now() else submitted_at end
      where id = ${id}
    `;

    const settled = body.status === "confirmed" && payment.status !== "confirmed";
    const failed = body.status === "failed" && payment.status !== "failed";

    if (settled) {
      if (payment.from_user_id) {
        await db()`
          insert into notifications (user_id, kind, title, body, payload)
          values (
            ${payment.from_user_id}, 'payment.confirmed', 'Payment confirmed',
            ${"The payment you sent has settled."}, ${db().json({ paymentId: id })}
          )
        `;
      }
      if (payment.to_user_id) {
        // The recipient's "waiting" notice is replaced by the settled one so a
        // stale pending row does not sit above the confirmation.
        await db()`
          update notifications set read_at = now()
          where user_id = ${payment.to_user_id}
            and read_at is null
            and payload->>'paymentId' = ${id}
        `;
        await db()`
          insert into notifications (user_id, kind, title, body, payload)
          values (
            ${payment.to_user_id}, 'payment.received.confirmed', 'Payment received',
            ${"The payment is ready in your activity."}, ${db().json({ paymentId: id })}
          )
        `;
      }
    }

    if (failed && payment.from_user_id) {
      await db()`
        insert into notifications (user_id, kind, title, body, payload)
        values (
          ${payment.from_user_id}, 'payment.failed', 'Payment did not go through',
          ${"Open the payment to see what happened."}, ${db().json({ paymentId: id })}
        )
      `;
    }

    return ok({ id, status: body.status });
  } catch (error) {
    return handle(error);
  }
}
