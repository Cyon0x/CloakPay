import { z } from "zod";
import { assertSameOrigin, fail, handle, ok } from "@/lib/api";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";

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
