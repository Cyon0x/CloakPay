import { z } from "zod";
import { assertSameOrigin, fail, handle, ok } from "@/lib/api";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { consumeLinkUse } from "@/lib/payments";
import { denominationById } from "@/config/pool";
import { activeChain } from "@/config/chain";

export const dynamic = "force-dynamic";

const envelopeSchema = z.object({
  v: z.literal(1),
  alg: z.literal("P256-HKDF-SHA256-AES-256-GCM"),
  epk: z.string().min(16),
  iv: z.string().min(16),
  ct: z.string().min(16),
});

const bodySchema = z.object({
  idempotencyKey: z.string().min(8).max(80),
  toUsername: z.string().min(3).max(20).optional(),
  linkCode: z.string().min(4).max(32).optional(),
  denominationId: z.string(),
  privacy: z.enum(["private", "public"]),
  note: z.string().max(140).optional(),
  commitment: z.string().max(80).optional(),
  nullifierHash: z.string().max(80).optional(),
  txHash: z.string().max(80).optional(),
  noteEnvelope: envelopeSchema.optional(),
});

export async function GET() {
  try {
    const user = await requireUser();
    const rows = await db()<
      {
        id: string;
        privacy: string;
        status: string;
        amount_wei: string | null;
        denomination_id: string | null;
        note: string | null;
        tx_hash: string | null;
        created_at: Date;
        confirmed_at: Date | null;
        direction: string;
        counterparty: string | null;
      }[]
    >`
      select p.id, p.privacy, p.status, p.amount_wei, p.denomination_id, p.note, p.tx_hash,
             p.created_at, p.confirmed_at,
             case when p.from_user_id = ${user.userId} then 'sent' else 'received' end as direction,
             case when p.from_user_id = ${user.userId}
                  then coalesce(tu.username, 'unknown')
                  else coalesce(fu.username, 'unknown') end as counterparty
      from payments p
      left join users fu on fu.id = p.from_user_id
      left join users tu on tu.id = p.to_user_id
      where p.from_user_id = ${user.userId} or p.to_user_id = ${user.userId}
      order by p.created_at desc
      limit 100
    `;
    return ok({ payments: rows });
  } catch (error) {
    return handle(error);
  }
}

export async function POST(request: Request) {
  try {
    if (!assertSameOrigin(request)) return fail(403, "bad_origin", "Request rejected.");
    const user = await requireUser();
    const parsed = bodySchema.safeParse(await request.json());
    if (!parsed.success) return fail(400, "invalid_body", "That payment was not valid.");
    const body = parsed.data;

    const denomination = denominationById(body.denominationId);
    if (!denomination) return fail(400, "unknown_denomination", "Unsupported amount.");

    // A private payment must carry the commitment it deposited and the sealed
    // note for the recipient: without both, nothing is claimable.
    if (body.privacy === "private" && (!body.commitment || !body.noteEnvelope)) {
      return fail(
        400,
        "private_payment_incomplete",
        "A private payment needs its commitment and the sealed note for the recipient.",
      );
    }
    if (body.privacy === "public" && !body.txHash) {
      return fail(400, "public_payment_incomplete", "A public payment needs its transaction hash.");
    }

    const sql = db();

    // Idempotency: the same key returns the original record instead of creating
    // a second payment when a client retries.
    const prior = await sql<{ id: string; status: string }[]>`
      select id, status from payments where idempotency_key = ${body.idempotencyKey}
    `;
    if (prior[0]) return ok({ paymentId: prior[0].id, duplicate: true });

    let recipientId: string | null = null;
    let linkId: string | null = null;

    if (body.linkCode) {
      const consumed = await consumeLinkUse(body.linkCode, user.userId);
      if (!consumed.ok) {
        return fail(409, "link_not_claimable", `This link cannot be used right now: ${consumed.reason}.`);
      }
      linkId = consumed.linkId;
      recipientId = consumed.ownerUserId;
    } else if (body.toUsername) {
      const found = await sql<{ id: string }[]>`
        select id from users where username_lower = ${body.toUsername.toLowerCase()} limit 1
      `;
      if (!found[0]) return fail(404, "recipient_not_found", "No such username.");
      if (found[0].id === user.userId) {
        return fail(400, "self_payment", "You cannot pay yourself.");
      }
      recipientId = found[0].id;
    } else {
      return fail(400, "missing_recipient", "Choose a recipient or a payment link.");
    }

    const created = await sql<{ id: string }[]>`
      insert into payments (
        chain_id, privacy, status, from_user_id, to_user_id, amount_wei,
        denomination_id, asset, note, link_id, commitment, nullifier_hash, tx_hash,
        idempotency_key, submitted_at
      ) values (
        ${activeChain.chainId}, ${body.privacy},
        ${body.privacy === "public" && body.txHash ? "submitted" : "pending"},
        ${user.userId}, ${recipientId},
        ${denomination.wei.toString()}, ${denomination.id}, 'HYPE',
        ${body.note ?? null}, ${linkId}, ${body.commitment ?? null},
        ${body.nullifierHash ?? null}, ${body.txHash ?? null},
        ${body.idempotencyKey}, ${body.privacy === "public" ? new Date() : null}
      )
      returning id
    `;
    const paymentId = created[0].id;

    if (body.privacy === "private" && body.noteEnvelope && recipientId) {
      await sql`
        insert into shielded_notes (
          user_id, chain_id, denomination_id, commitment, note_envelope, status,
          origin, origin_payment_id, link_id
        ) values (
          ${recipientId}, ${activeChain.chainId}, ${denomination.id}, ${body.commitment!},
          ${sql.json(body.noteEnvelope)}, 'unspent', 'payment', ${paymentId}, ${linkId}
        )
        on conflict (chain_id, commitment) do nothing
      `;
    }

    if (recipientId) {
      await sql`
        insert into notifications (user_id, kind, title, body, payload)
        values (
          ${recipientId},
          ${body.privacy === "private" ? "payment.received.private" : "payment.received"},
          ${body.privacy === "private" ? "A private payment is waiting" : "You have a payment"},
          -- Amounts are deliberately kept out of the notification body.
          ${"Open CloakPay to claim it."},
          ${sql.json({ paymentId })}
        )
      `;
    }

    return ok({ paymentId, duplicate: false }, { status: 201 });
  } catch (error) {
    return handle(error);
  }
}
