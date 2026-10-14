import { db } from "../db";
import type { Profile, ProviderId } from "./oauth";

/**
 * Maps a provider profile onto a CloakPay account.
 *
 * Rules that matter:
 *   * identity is keyed on (provider, provider_account_id);
 *   * a new provider identity never silently attaches to an existing account
 *     because an email or handle looked similar — linking is an explicit action
 *     the user takes while signed in;
 *   * no access or refresh token is persisted.
 */
export async function upsertUserFromProfile(
  provider: ProviderId,
  profile: Profile,
): Promise<{ userId: string; isNewAccount: boolean }> {
  const sql = db();

  return sql.begin(async (tx) => {
    const existing = await tx<{ user_id: string }[]>`
      select user_id from oauth_identities
      where provider = ${provider} and provider_account_id = ${profile.accountId}
      limit 1
    `;

    if (existing[0]) {
      await tx`
        update oauth_identities
        set handle = ${profile.handle}, email = ${profile.email}, last_login_at = now()
        where provider = ${provider} and provider_account_id = ${profile.accountId}
      `;
      return { userId: existing[0].user_id, isNewAccount: false };
    }

    const created = await tx<{ id: string }[]>`
      insert into users (display_name, avatar_url)
      values (${profile.displayName}, ${profile.avatarUrl})
      returning id
    `;
    const userId = created[0].id;

    await tx`
      insert into oauth_identities (user_id, provider, provider_account_id, handle, email)
      values (${userId}, ${provider}, ${profile.accountId}, ${profile.handle}, ${profile.email})
    `;

    await tx`
      insert into audit_events (user_id, kind, detail)
      values (${userId}, 'account.created', ${tx.json({ provider })})
    `;

    return { userId, isNewAccount: true };
  });
}

/** Connects a second provider to an account that is already signed in. */
export async function linkIdentity(
  userId: string,
  provider: ProviderId,
  profile: Profile,
): Promise<{ linked: boolean; reason?: string }> {
  const sql = db();
  const taken = await sql<{ user_id: string }[]>`
    select user_id from oauth_identities
    where provider = ${provider} and provider_account_id = ${profile.accountId}
    limit 1
  `;
  if (taken[0]) {
    return taken[0].user_id === userId
      ? { linked: false, reason: "already_linked" }
      : { linked: false, reason: "identity_in_use" };
  }

  await sql`
    insert into oauth_identities (user_id, provider, provider_account_id, handle, email)
    values (${userId}, ${provider}, ${profile.accountId}, ${profile.handle}, ${profile.email})
  `;
  await sql`
    insert into audit_events (user_id, kind, detail)
    values (${userId}, 'account.linked', ${sql.json({ provider })})
  `;
  return { linked: true };
}

export async function listIdentities(userId: string) {
  return db()<
    { provider: ProviderId; handle: string | null; created_at: Date; last_login_at: Date }[]
  >`
    select provider, handle, created_at, last_login_at
    from oauth_identities where user_id = ${userId}
    order by created_at
  `;
}
