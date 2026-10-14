import { fail, handle, ok } from "@/lib/api";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * The public payment profile behind a username. This is what a payment link and
 * a QR code point at, so it exposes nothing beyond the payment identity.
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
      }[]
    >`
      select u.username, u.display_name, u.avatar_url, u.profile_visibility, w.viewing_key_id
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
        canReceivePrivately: Boolean(profile.viewing_key_id),
      },
    });
  } catch (error) {
    return handle(error);
  }
}
