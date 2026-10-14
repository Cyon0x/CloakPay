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
