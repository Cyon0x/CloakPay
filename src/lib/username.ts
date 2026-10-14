import { db } from "./db";

/**
 * Usernames are the payment identity, so the rules are strict and the
 * uniqueness check is case-insensitive at the database level, not here.
 */
export const USERNAME_PATTERN = /^[a-z0-9](?:[a-z0-9_]{2,19})$/;

const RESERVED = new Set([
  "about", "admin", "api", "auth", "billing", "cloakpay", "dashboard", "docs",
  "faq", "help", "legal", "login", "logout", "me", "new", "onboarding", "pay",
  "privacy", "receive", "root", "security", "send", "settings", "signin",
  "signout", "signup", "support", "terms", "u", "wallet", "www",
]);

export function validateUsername(value: string): { ok: true } | { ok: false; reason: string } {
  const username = value.trim().toLowerCase();
  if (username.length === 0) return { ok: false, reason: "Choose a username." };
  if (username.length < 3) return { ok: false, reason: "Usernames are at least 3 characters." };
  if (username.length > 20) return { ok: false, reason: "Usernames are at most 20 characters." };
  if (!/^[a-z0-9]/.test(username)) {
    return { ok: false, reason: "Usernames must start with a letter or number." };
  }
  if (!USERNAME_PATTERN.test(username)) {
    return {
      ok: false,
      reason: "Use lowercase letters, numbers and underscores only.",
    };
  }
  if (RESERVED.has(username)) return { ok: false, reason: "That username is reserved." };
  return { ok: true };
}

export async function isUsernameTaken(username: string, exceptUserId?: string): Promise<boolean> {
  const rows = await db()<{ id: string }[]>`
    select id from users
    where username_lower = ${username.trim().toLowerCase()}
      and (${exceptUserId ?? null}::uuid is null or id <> ${exceptUserId ?? null}::uuid)
    limit 1
  `;
  return rows.length > 0;
}
