import { db } from "./db";

/**
 * Fixed-window rate limiting backed by the database.
 *
 * Deliberately simple and shared across instances rather than in-memory, so it
 * keeps working when the app scales out. It is a brake, not a defence in depth.
 */
export async function rateLimit(
  bucket: string,
  options: { limit: number; windowSeconds: number },
): Promise<{ allowed: boolean; remaining: number }> {
  const sql = db();
  const rows = await sql<
    { count: number; window_start: Date }[]
  >`
    insert into rate_limits (bucket, count, window_start)
    values (${bucket}, 1, now())
    on conflict (bucket) do update
      set count = case
            when rate_limits.window_start < now() - (${options.windowSeconds}::text || ' seconds')::interval
              then 1
            else rate_limits.count + 1
          end,
          window_start = case
            when rate_limits.window_start < now() - (${options.windowSeconds}::text || ' seconds')::interval
              then now()
            else rate_limits.window_start
          end
    returning count, window_start
  `;
  const count = rows[0]?.count ?? 1;
  return { allowed: count <= options.limit, remaining: Math.max(0, options.limit - count) };
}
