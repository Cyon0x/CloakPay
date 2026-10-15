import { z } from "zod";
import { assertSameOrigin, fail, handle, ok } from "@/lib/api";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { rateLimit } from "@/lib/rate-limit";
import { activeChain } from "@/config/chain";
import { denominationById } from "@/config/pool";

export const dynamic = "force-dynamic";

/**
 * Shielded notes belonging to the signed-in user.
 *
 * The server stores and returns ciphertext only. It cannot read a note, and the
 * query is scoped by user id, so one account can never enumerate another's.
 */
export async function GET() {
  try {
    const user = await requireUser();
    const rows = await db()<
      {
        id: string;
        denomination_id: string;
        commitment: string;
        nullifier_hash: string | null;
        note_envelope: unknown;
        status: string;
        origin: string;
        created_at: Date;
        spent_at: Date | null;
        spent_tx_hash: string | null;
      }[]
    >`
      select id, denomination_id, commitment, nullifier_hash, note_envelope, status, origin,
             created_at, spent_at, spent_tx_hash
      from shielded_notes
      where user_id = ${user.userId}
      order by created_at desc
      limit 200
    `;
    return ok({ notes: rows });
  } catch (error) {
    return handle(error);
  }
}

/**
 * The ciphertext a sender produced for a recipient.
 *
 * Every field is a length-bounded string with a fixed shape. The route checks
 * the envelope's *form* and nothing else, because it has no key that could open
 * it: the note's amount, its nullifier and its secret are all inside, sealed to
 * the recipient's viewing key with ECIES. That is the point of this endpoint.
 */
const envelopeSchema = z.object({
  v: z.literal(1),
  alg: z.literal("P256-HKDF-SHA256-AES-256-GCM"),
  epk: z.string().min(16).max(128),
  iv: z.string().min(12).max(32),
  ct: z.string().min(32).max(2048),
});

const createSchema = z
  .object({
    /** Deliver the note to this account. Omitted, the note is the sender's own. */
    username: z.string().min(3).max(20).optional(),
    denominationId: z.string().max(40),
    commitment: z.string().regex(/^0x[0-9a-fA-F]{1,64}$/),
    noteEnvelope: envelopeSchema,
    origin: z.enum(["deposit", "transfer"]),
    /** Recorded for the recipient's history; never treated as proof. */
    txHash: z
      .string()
      .regex(/^0x[0-9a-fA-F]{64}$/)
      .optional(),
  })
  .refine((body) => (body.origin === "transfer") === Boolean(body.username), {
    message: "A transfer names its recipient; a deposit does not.",
  });

/**
 * Stores a note envelope.
 *
 * Two shapes of write, and the difference matters:
 *
 *   * a *deposit* — the note is the sender's own, and the row belongs to them;
 *   * a *transfer* — the note belongs to the named recipient, and the sender is
 *     only allowed to hand it over, never to read it back.
 *
 * What this route does NOT do is claim the note is real. It cannot: the money
 * is proved by a Groth16 proof the pool verified, and the commitment only
 * becomes spendable once the chain has put it in the tree. A row here is a
 * delivery address, and the client re-derives spendability from the pool's own
 * events. A row with a commitment that never made it on chain is inert, which
 * is why the honest failure mode is a note that shows as unspendable rather
 * than a balance that lies.
 *
 * The row is written *before* the deposit is broadcast, deliberately: the
 * reverse order can lose a funded note to a dropped connection, while an
 * orphaned row costs nothing.
 */
export async function POST(request: Request) {
  try {
    if (!assertSameOrigin(request)) return fail(403, "bad_origin", "Request rejected.");
    const user = await requireUser();
    const parsed = createSchema.safeParse(await request.json());
    if (!parsed.success) return fail(400, "invalid_body", "That note payload was not valid.");
    const body = parsed.data;

    const denomination = denominationById(body.denominationId);
    if (!denomination) return fail(400, "unknown_denomination", "Unsupported denomination.");

    const limit = await rateLimit(`notes:${user.userId}`, { limit: 60, windowSeconds: 60 });
    if (!limit.allowed) return fail(429, "rate_limited", "Too many notes. Wait a moment.");

    const sql = db();

    let ownerUserId = user.userId;
    if (body.username) {
      const found = await sql<{ id: string; viewing_key_id: string | null; viewing_public_key: unknown }[]>`
        select u.id, w.viewing_key_id, w.viewing_public_key
        from users u
        left join wallets w on w.user_id = u.id
        where u.username_lower = ${body.username.trim().toLowerCase()}
        limit 1
      `;
      const recipient = found[0];
      if (!recipient) return fail(404, "recipient_not_found", "No such username.");
      if (recipient.id === user.userId) {
        return fail(400, "self_transfer", "You cannot send a shielded note to yourself.");
      }
      // Sealing a note to an account that has no viewing key would produce a
      // note nobody can ever open, so it is refused rather than stored.
      if (!recipient.viewing_key_id || !recipient.viewing_public_key) {
        return fail(
          409,
          "recipient_cannot_receive",
          "That account has not finished setting up a wallet, so it cannot receive a private payment yet.",
        );
      }
      ownerUserId = recipient.id;
    }

    const inserted = await sql<{ id: string }[]>`
      insert into shielded_notes (
        user_id, chain_id, denomination_id, commitment, note_envelope, status, origin
      ) values (
        ${ownerUserId}, ${activeChain.chainId}, ${denomination.id}, ${body.commitment},
        ${sql.json(body.noteEnvelope)}, 'unspent', ${body.origin}
      )
      on conflict (chain_id, commitment) do nothing
      returning id
    `;

    if (inserted[0]) return ok({ id: inserted[0].id, duplicate: false }, { status: 201 });

    // The commitment is already recorded. Returning the existing row keeps a
    // retried delivery idempotent instead of failing the sender's payment.
    const [existing] = await sql<{ id: string }[]>`
      select id from shielded_notes
      where chain_id = ${activeChain.chainId} and commitment = ${body.commitment}
      limit 1
    `;
    if (!existing) return fail(409, "note_conflict", "That note could not be recorded.");
    return ok({ id: existing.id, duplicate: true });
  } catch (error) {
    return handle(error);
  }
}

const patchSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(["unspent", "spending", "spent", "invalid"]),
  nullifierHash: z.string().max(80).optional(),
  txHash: z.string().max(80).optional(),
});

/** Records that a note was spent. The chain is still the authority. */
export async function PATCH(request: Request) {
  try {
    if (!assertSameOrigin(request)) return fail(403, "bad_origin", "Request rejected.");
    const user = await requireUser();
    const parsed = patchSchema.safeParse(await request.json());
    if (!parsed.success) return fail(400, "invalid_body", "That update was not valid.");
    const { id, status, nullifierHash, txHash } = parsed.data;

    const updated = await db()<{ id: string }[]>`
      update shielded_notes
      set status = ${status},
          nullifier_hash = coalesce(${nullifierHash ?? null}, nullifier_hash),
          spent_tx_hash = coalesce(${txHash ?? null}, spent_tx_hash),
          spent_at = case when ${status} = 'spent' then now() else spent_at end
      where id = ${id} and user_id = ${user.userId}
      returning id
    `;
    if (!updated[0]) return fail(404, "not_found", "No such note.");
    return ok({ id, status });
  } catch (error) {
    return handle(error);
  }
}
