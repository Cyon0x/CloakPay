import { db } from "./db";


export type Privacy = "private" | "public";

export interface PaymentRow {
  id: string;
  privacy: Privacy;
  status: "pending" | "submitted" | "confirmed" | "failed" | "expired";
  amount_wei: string | null;
  denomination_id: string | null;
  asset: string;
  note: string | null;
  commitment: string | null;
  nullifier_hash: string | null;
  tx_hash: string | null;
  created_at: Date;
  confirmed_at: Date | null;
  failure_reason: string | null;
  from_user_id: string | null;
  to_user_id: string | null;
  from_username: string | null;
  to_username: string | null;
}

/**
 * Applies a link's usage rules inside a transaction.
 *
 * The row is locked so two concurrent claims cannot both pass the check, and
 * the caller gets a stable reason when a link is not claimable.
 *
 * Whether a private link can be settled is decided here, before the counter
 * moves, rather than after the caller gets the row back. A refusal must leave
 * the link exactly as it was: charging a use for a payment that never happened
 * would burn a one-time link, and hand the payer a failure and a dead link.
 */
export async function consumeLinkUse(
  code: string,
  userId: string,
  options: { privatePaymentsAllowed: boolean },
): Promise<
  | { ok: true; linkId: string; amountWei: bigint | null; denominationId: string | null; mode: string; ownerUserId: string }
  | { ok: false; reason: string }
> {
  const sql = db();
  return sql.begin(async (tx) => {
    const rows = await tx<
      {
        id: string;
        owner_user_id: string;
        amount_wei: string | null;
        denomination_id: string | null;
        mode: string;
        reusable: boolean;
        max_uses: number | null;
        uses: number;
        expires_at: Date | null;
        status: string;
      }[]
    >`
      select id, owner_user_id, amount_wei, denomination_id, mode, reusable, max_uses, uses,
             expires_at, status
      from payment_links
      where code = ${code}
      for update
    `;
    const link = rows[0];
    if (!link) return { ok: false, reason: "not_found" };
    if (link.status !== "active") return { ok: false, reason: "disabled" };
    if (link.expires_at && link.expires_at.getTime() < Date.now()) {
      await tx`update payment_links set status = 'expired' where id = ${link.id}`;
      return { ok: false, reason: "expired" };
    }
    if (link.max_uses !== null && link.uses >= link.max_uses) {
      return { ok: false, reason: "exhausted" };
    }
    if (!link.reusable && link.uses > 0) return { ok: false, reason: "already_used" };
    if (link.owner_user_id === userId) return { ok: false, reason: "own_link" };

    // A one-time link is bound to its first claimant.
    const claimed = await tx<{ claimed_by_user_id: string | null }[]>`
      select claimed_by_user_id from payment_links where id = ${link.id}
    `;
    if (!link.reusable && claimed[0]?.claimed_by_user_id && claimed[0].claimed_by_user_id !== userId) {
      return { ok: false, reason: "already_used" };
    }
    if (link.mode === "private" && !options.privatePaymentsAllowed) {
      return { ok: false, reason: "privacy_unavailable" };
    }

    await tx`
      update payment_links
      set uses = uses + 1,
          claimed_by_user_id = coalesce(claimed_by_user_id, ${userId}),
          claimed_at = coalesce(claimed_at, now()),
          updated_at = now()
      where id = ${link.id}
    `;

    return {
      ok: true,
      linkId: link.id,
      amountWei: link.amount_wei === null ? null : BigInt(link.amount_wei),
      denominationId: link.denomination_id,
      mode: link.mode,
      ownerUserId: link.owner_user_id,
    };
  });
}

export {
  formatWei,
  parseToWei,
  denominationLabel,
  isSupportedDenomination,
  denominationForId,
  shortId,
} from "./format";
