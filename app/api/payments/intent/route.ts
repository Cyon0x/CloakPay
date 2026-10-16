import { z } from "zod";
import { assertSameOrigin, fail, handle, ok } from "@/lib/api";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { consumeLinkUse } from "@/lib/payments";
import { rateLimit } from "@/lib/rate-limit";
import { paymentCode } from "@/lib/codes";
import { validateExternalAddress } from "@/lib/address";
import { activeChain } from "@/config/chain";
import { denominationById, poolStatusSentence, privatePaymentsAvailable } from "@/config/pool";
import {
  EXTERNAL_TRANSFER_PAUSED,
  externalTransfersEnabled,
  shieldedPoolEnabled,
} from "@/config/features";

export const dynamic = "force-dynamic";

/**
 * Whether the request is for a path CloakPay has paused, and why.
 *
 * This is a function rather than an inline check so the refusal is decided in
 * one place for both paused paths, and so the flow below it stays written as it
 * will be when they return.
 */
function paused(
  privacy: "private" | "public",
  hasExternalAddress: boolean,
): { code: string; message: string } | null {
  if (privacy === "private" && !shieldedPoolEnabled()) {
    return { code: "shielded_pool_paused", message: poolStatusSentence(activeChain.chainId) };
  }
  if (hasExternalAddress && !externalTransfersEnabled()) {
    return { code: "external_transfer_paused", message: EXTERNAL_TRANSFER_PAUSED };
  }
  return null;
}

const bodySchema = z.object({
  toUsername: z.string().min(3).max(20).optional(),
  /** External wallet destination. Public transfers only. */
  toAddress: z.string().max(64).optional(),
  linkCode: z.string().min(4).max(32).optional(),
  denominationId: z.string().max(40).optional(),
  /** Exact wei for a public transfer. Never used by the fixed-size private flow. */
  amountWei: z.string().regex(/^\d+$/).max(78).optional(),
  privacy: z.enum(["private", "public"]),
  note: z.string().max(140).optional(),
});

/**
 * Opens a settlement.
 *
 * This is the only place a payer is told where to send funds, and it is scoped
 * to one payment: the destination is returned to an authenticated, rate-limited
 * payer who has already committed to an amount, and it is never exposed on a
 * public profile or a lookup endpoint.
 *
 * The two flows are kept apart here rather than in the UI. A private payment
 * takes a username and settles through the shielded pool; an external transfer
 * takes a wallet address and settles as a public transfer. The one thing this
 * endpoint will not do is accept a request labelled private and hand back an
 * address to send an observable transfer to.
 */
export async function POST(request: Request) {
  try {
    if (!assertSameOrigin(request)) return fail(403, "bad_origin", "Request rejected.");
    const user = await requireUser();
    const parsed = bodySchema.safeParse(await request.json());
    if (!parsed.success) return fail(400, "invalid_body", "That payment was not valid.");
    const body = parsed.data;

    const sql = db();
    const external = Boolean(body.toAddress);

    // The two paths beside the username flow are paused, and they are refused
    // here rather than only in the form that used to offer them: a stale tab, a
    // bookmarked route or a hand-made request meets the same wall as the UI.
    // The check comes before anything is written, so a refused attempt leaves
    // no payment row and burns no link use.
    const refused = paused(body.privacy, external);
    if (refused) return fail(409, refused.code, refused.message);

    if (external && body.privacy === "private") {
      return fail(
        400,
        "invalid_body",
        "A private payment is addressed to a CloakPay username. A wallet address is an external transfer.",
      );
    }

    if (body.privacy === "private" && !privatePaymentsAvailable(activeChain.chainId)) {
      return fail(409, "privacy_unavailable", poolStatusSentence(activeChain.chainId));
    }

    const limit = await rateLimit(`intent:${user.userId}`, { limit: 30, windowSeconds: 60 });
    if (!limit.allowed) return fail(429, "rate_limited", "Too many attempts. Wait a moment.");

    // ── amount ────────────────────────────────────────────────────────────────
    // An amount is either exact wei, which is how a username payment and a
    // free-amount link arrive, or one of the pool's fixed denominations, which
    // is how a private payment arrives. Exactly one of them has to be present.
    let amountWei: bigint;
    let denominationId: string | null = null;

    if (body.amountWei) {
      amountWei = BigInt(body.amountWei);
      if (amountWei <= 0n) return fail(400, "invalid_amount", "Enter an amount greater than zero.");
    } else if (body.denominationId) {
      const denomination = body.denominationId ? denominationById(body.denominationId) : undefined;
      if (!denomination) return fail(400, "unknown_denomination", "Unsupported amount.");
      amountWei = denomination.wei;
      denominationId = denomination.id;
    } else {
      return fail(400, "missing_amount", "Enter an amount to send.");
    }

    // ── recipient ─────────────────────────────────────────────────────────────
    let recipientId: string | null = null;
    let linkId: string | null = null;
    let destination: string | null = null;

    if (body.linkCode) {
      const consumed = await consumeLinkUse(body.linkCode, user.userId, {
        privatePaymentsAllowed: privatePaymentsAvailable(activeChain.chainId),
        requestedPrivacy: body.privacy,
      });
      if (!consumed.ok) {
        // A private link that cannot be settled is refused before its use
        // counter moves, so the link is still there when the flow is ready.
        if (consumed.reason === "privacy_unavailable") {
          return fail(409, "privacy_unavailable", poolStatusSentence(activeChain.chainId));
        }
        if (consumed.reason === "mode_mismatch") {
          return fail(
            409,
            "link_mode_mismatch",
            "This link was created for a different kind of payment, so it cannot be settled this way.",
          );
        }
        return fail(409, "link_not_claimable", `This link cannot be used right now: ${consumed.reason}.`);
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
    } else if (body.toAddress) {
      const self = await sql<{ address: string }[]>`
        select address from wallets where user_id = ${user.userId} limit 1
      `;
      const valid = validateExternalAddress(body.toAddress, self[0]?.address ?? null);
      if (!valid.ok) return fail(400, "invalid_address", valid.reason);
      destination = valid.address;
    } else {
      return fail(400, "missing_recipient", "Choose a recipient or a payment link.");
    }

    // The two flows need different things from the recipient, and only one of
    // them needs an address.
    //
    // A public transfer is addressed to a wallet, so the address is looked up
    // and returned. A private payment is addressed to a username and settles
    // through the pool, so the payer is never told the recipient's address --
    // what a private payment needs from the recipient is their viewing key,
    // which is exactly the thing that lets a note be sealed to them.
    if (body.privacy === "private") {
      const recipientWallet = await sql<{ viewing_key_id: string | null }[]>`
        select w.viewing_key_id from wallets w where w.user_id = ${recipientId} limit 1
      `;
      if (!recipientWallet[0]) {
        return fail(409, "recipient_has_no_wallet", "That account has not finished setting up a wallet yet.");
      }
      if (!recipientWallet[0].viewing_key_id) {
        return fail(
          409,
          "recipient_cannot_receive",
          "That account has not registered a viewing key, so it cannot receive a private payment yet.",
        );
      }
    } else if (!destination) {
      const wallets = await sql<{ address: string }[]>`
        select address from wallets where user_id = ${recipientId} limit 1
      `;
      const recipientWallet = wallets[0];
      if (!recipientWallet) {
        return fail(409, "recipient_has_no_wallet", "That account has not finished setting up a wallet yet.");
      }
      destination = recipientWallet.address;
    }

    // A private payment is addressed by username and nothing else. The client
    // needs the username to resolve the recipient's viewing key at proof time,
    // so it is returned here rather than being re-derived from a link.
    let recipientUsername: string | null = null;
    if (recipientId) {
      const recipients = await sql<{ username: string | null }[]>`
        select username from users where id = ${recipientId} limit 1
      `;
      recipientUsername = recipients[0]?.username ?? null;
    }
    if (body.privacy === "private" && !recipientUsername) {
      return fail(409, "recipient_has_no_username", "That account has no CloakPay username to pay.");
    }

    const idempotencyKey = `intent:${paymentCode(24)}`;
    const created = await sql<{ id: string }[]>`
      insert into payments (
        chain_id, privacy, status, from_user_id, to_user_id, amount_wei,
        denomination_id, asset, note, link_id, idempotency_key
      ) values (
        ${activeChain.chainId}, ${body.privacy}, 'pending', ${user.userId}, ${recipientId},
        ${amountWei.toString()}, ${denominationId}, 'HYPE',
        ${body.note ?? null}, ${linkId}, ${idempotencyKey}
      )
      returning id
    `;

    return ok(
      {
        paymentId: created[0].id,
        idempotencyKey,
        privacy: body.privacy,
        // Null for a private payment: the payer has no business knowing it.
        to: body.privacy === "private" ? null : destination,
        recipientUsername,
        amountWei: amountWei.toString(),
        denominationId,
        asset: "HYPE",
        chainId: activeChain.chainId,
      },
      { status: 201 },
    );
  } catch (error) {
    return handle(error);
  }
}
