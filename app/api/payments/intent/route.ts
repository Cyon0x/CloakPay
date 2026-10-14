import { z } from "zod";
import { assertSameOrigin, fail, handle, ok } from "@/lib/api";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { consumeLinkUse } from "@/lib/payments";
import { rateLimit } from "@/lib/rate-limit";
import { paymentCode } from "@/lib/codes";
import { activeChain } from "@/config/chain";
import { denominationById, getPoolDeployment } from "@/config/pool";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  toUsername: z.string().min(3).max(20).optional(),
  linkCode: z.string().min(4).max(32).optional(),
  denominationId: z.string().min(1).max(40),
  privacy: z.enum(["private", "public"]),
  note: z.string().max(140).optional(),
});

/**
 * Opens a settlement.
 *
 * This is the only place a payer is told where to send funds, and it is scoped
 * to one payment: the recipient's address is returned to an authenticated,
 * rate-limited payer who has already committed to paying this denomination, and
 * it is never exposed on a public profile, a lookup endpoint, or a link's
 * public metadata.
 *
 * A private settlement is refused outright while the shielded pool has no
 * recorded deployment. Falling back to an observable transfer while still
 * calling it private is exactly the failure mode this endpoint exists to
 * prevent.
 */
export async function POST(request: Request) {
  try {
    if (!assertSameOrigin(request)) return fail(403, "bad_origin", "Request rejected.");
    const user = await requireUser();
    const parsed = bodySchema.safeParse(await request.json());
    if (!parsed.success) return fail(400, "invalid_body", "That payment was not valid.");
    const body = parsed.data;

    const denomination = denominationById(body.denominationId);
    if (!denomination) return fail(400, "unknown_denomination", "Unsupported amount.");

    if (body.privacy === "private" && !getPoolDeployment(activeChain.chainId)) {
      return fail(
        409,
        "privacy_unavailable",
        "The shielded pool is not deployed on this network, so a private payment cannot be made yet.",
      );
    }

    const limit = await rateLimit(`intent:${user.userId}`, { limit: 30, windowSeconds: 60 });
    if (!limit.allowed) return fail(429, "rate_limited", "Too many attempts. Wait a moment.");

    const sql = db();
    let recipientId: string | null = null;
    let linkId: string | null = null;

    if (body.linkCode) {
      const consumed = await consumeLinkUse(body.linkCode, user.userId);
      if (!consumed.ok) {
        return fail(409, "link_not_claimable", `This link cannot be used right now: ${consumed.reason}.`);
      }
      if (consumed.mode === "private" && !getPoolDeployment(activeChain.chainId)) {
        return fail(409, "privacy_unavailable", "This link asks for a private payment, which is not deployed yet.");
      }
      linkId = consumed.linkId;
      recipientId = consumed.ownerUserId;
    } else if (body.toUsername) {
      const found = await sql<{ id: string }[]>`
        select id from users where username_lower = ${body.toUsername.trim().toLowerCase()} limit 1
      `;
      if (!found[0]) return fail(404, "recipient_not_found", "No such username.");
      if (found[0].id === user.userId) return fail(400, "self_payment", "You cannot pay yourself.");
      recipientId = found[0].id;
    } else {
      return fail(400, "missing_recipient", "Choose a recipient or a payment link.");
    }

    const wallets = await sql<{ address: string }[]>`
      select address from wallets where user_id = ${recipientId} limit 1
    `;
    const recipientWallet = wallets[0];
    if (!recipientWallet) {
      return fail(409, "recipient_has_no_wallet", "That account has not finished setting up a wallet yet.");
    }

    const idempotencyKey = `intent:${paymentCode(24)}`;
    const created = await sql<{ id: string }[]>`
      insert into payments (
        chain_id, privacy, status, from_user_id, to_user_id, amount_wei,
        denomination_id, asset, note, link_id, idempotency_key
      ) values (
        ${activeChain.chainId}, ${body.privacy}, 'pending', ${user.userId}, ${recipientId},
        ${denomination.wei.toString()}, ${denomination.id}, 'HYPE',
        ${body.note ?? null}, ${linkId}, ${idempotencyKey}
      )
      returning id
    `;

    return ok(
      {
        paymentId: created[0].id,
        idempotencyKey,
        to: recipientWallet.address,
        amountWei: denomination.wei.toString(),
        denominationId: denomination.id,
        asset: "HYPE",
        chainId: activeChain.chainId,
      },
      { status: 201 },
    );
  } catch (error) {
    return handle(error);
  }
}
