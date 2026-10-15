import postgres from "postgres";
import { env } from "./env";

/**
 * A single pooled client for the server runtime. Next.js dev reloads modules,
 * so the instance is cached on globalThis to avoid leaking connections.
 */
const globalForDb = globalThis as unknown as { __cloakpayDb?: postgres.Sql };

export function db(): postgres.Sql {
  if (!globalForDb.__cloakpayDb) {
    globalForDb.__cloakpayDb = postgres(env.databaseUrl, {
      max: env.isProduction ? 8 : 4,
      idle_timeout: 20,
      connect_timeout: 15,
      ssl: env.databaseUrl.includes("sslmode=require") ? "require" : undefined,
      onnotice: () => {},
    });
  }
  return globalForDb.__cloakpayDb;
}

export type Sql = postgres.Sql;

/**
 * The SQLSTATE codes a route is allowed to branch on, named so a bare "23505"
 * never turns up in a catch block without a reader knowing what it means.
 */
export const SQLSTATE = {
  uniqueViolation: "23505",
  checkViolation: "23514",
} as const;

/**
 * postgres.js hangs the SQLSTATE on the thrown error. Anything without one did
 * not come from the server, and treating it as a constraint failure is how an
 * outage gets dressed up as a validation message.
 */
export function sqlStateOf(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null) return undefined;
  const code = (error as { code?: unknown }).code;
  return typeof code === "string" ? code : undefined;
}
