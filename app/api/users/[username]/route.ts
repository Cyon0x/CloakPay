import { fail, handle, ok } from "@/lib/api";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * The public payment profile behind a username. This is what a payment link and
 * a QR code point at, so it exposes nothing beyond the payment identity.
 *
 * `viewingPublicKey` is here because a shielded payment needs somewhere to seal
 * the note for the recipient, and a payer cannot seal a note to a key they are
 * not told. It is the *public* half of an ECDH key pair: it can only be used to
 * encrypt a note to its owner. Possessing it grants no ability to read another
 * person's notes, to move funds, or to learn anything about the account. The
 * private half never leaves the owner's device, and is never stored here.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ username: string }> },
) {
  try {
    const { username } = await params;
    const normalised = username.trim().toLowerCase().replace(/^@/, "");
    if (!/^[a-z0-9_]{3,20}$/.test(normalised)) {
      return fail(400, "invalid_username", "That username is not valid.");
    }

    const rows = await db()<
      {
        username: string;
        display_name: string | null;
        avatar_url: string | null;
        profile_visibility: string;
        viewing_key_id: string | null;
        viewing_public_key: unknown;
      }[]
    >`
      select u.username, u.display_name, u.avatar_url, u.profile_visibility,
             w.viewing_key_id, w.viewing_public_key
      from users u
      left join wallets w on w.user_id = u.id
      where u.username_lower = ${normalised}
      limit 1
    `;

    const profile = rows[0];
    if (!profile || profile.profile_visibility === "private") {
      return fail(404, "not_found", "No such username.");
    }

    return ok({
      profile: {
        username: profile.username,
        displayName: profile.display_name,
        avatarUrl: profile.avatar_url,
        canReceivePrivately: Boolean(profile.viewing_key_id && profile.viewing_public_key),
        viewingPublicKey: profile.viewing_public_key ?? null,
      },
    });
  } catch (error) {
    return handle(error);
  }
}
