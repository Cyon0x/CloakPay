import { z } from "zod";
import { assertSameOrigin, fail, handle, ok } from "@/lib/api";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";

export const dynamic = "force-dynamic";

const envelopeSchema = z.object({
  v: z.literal(1),
  alg: z.literal("PBKDF2-SHA256-600000-AES-256-GCM"),
  kdf: z.literal("PBKDF2-SHA256"),
  iterations: z.number().int().min(600_000),
  salt: z.string().min(16).max(64),
  iv: z.string().min(16).max(32),
  ct: z.string().min(32),
});

const bodySchema = z.object({
  address: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
  keyEnvelope: envelopeSchema,
  viewingPublicKey: z.object({ kty: z.string(), crv: z.string(), x: z.string(), y: z.string() }),
  viewingKeyId: z.string().min(8).max(64),
});

/**
 * Stores wallet metadata.
 *
 * The server receives a ciphertext and a public key. It never sees the mnemonic
 * or the viewing private key, and it cannot derive either.
 */
export async function POST(request: Request) {
  try {
    if (!assertSameOrigin(request)) return fail(403, "bad_origin", "Request rejected.");
    const user = await requireUser();
    const parsed = bodySchema.safeParse(await request.json());
    if (!parsed.success) return fail(400, "invalid_body", "That wallet payload was not valid.");
    const body = parsed.data;

    const existing = await db()<{ address: string }[]>`
      select address from wallets where user_id = ${user.userId}
    `;
    if (existing[0]) {
      if (existing[0].address.toLowerCase() !== body.address.toLowerCase()) {
        return fail(409, "wallet_exists", "This account already has a wallet.");
      }
      await db()`
        update wallets
        set key_envelope = ${db().json(body.keyEnvelope)},
            viewing_public_key = ${db().json(body.viewingPublicKey)},
            viewing_key_id = ${body.viewingKeyId},
            updated_at = now()
        where user_id = ${user.userId}
      `;
      return ok({ address: existing[0].address, updated: true });
    }

    await db()`
      insert into wallets (user_id, address, key_envelope, viewing_public_key, viewing_key_id)
      values (
        ${user.userId},
        ${body.address},
        ${db().json(body.keyEnvelope)},
        ${db().json(body.viewingPublicKey)},
        ${body.viewingKeyId}
      )
    `;
    await db()`
      insert into audit_events (user_id, kind, detail)
      values (${user.userId}, 'wallet.created', ${db().json({ address: body.address })})
    `;
    return ok({ address: body.address, updated: false });
  } catch (error) {
    return handle(error);
  }
}

/** Returns wallet metadata only. The envelope is returned solely to its owner. */
export async function GET() {
  try {
    const user = await requireUser();
    const rows = await db()<
      {
        address: string;
        key_envelope: unknown;
        viewing_key_id: string | null;
        recovery_confirmed_at: Date | null;
      }[]
    >`
      select address, key_envelope, viewing_key_id, recovery_confirmed_at
      from wallets where user_id = ${user.userId}
    `;
    const wallet = rows[0];
    if (!wallet) return ok({ wallet: null });
    return ok({
      wallet: {
        address: wallet.address,
        keyEnvelope: wallet.key_envelope,
        viewingKeyId: wallet.viewing_key_id,
        recoveryConfirmedAt: wallet.recovery_confirmed_at,
      },
    });
  } catch (error) {
    return handle(error);
  }
}
