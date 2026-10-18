import { NextResponse } from "next/server";

/**
 * One response shape for every endpoint, so the client never has to guess.
 * Errors carry a stable code plus a human message that is safe to display.
 */
export function ok<T>(data: T, init?: ResponseInit) {
  return NextResponse.json({ ok: true, data }, init);
}

export function fail(
  status: number,
  code: string,
  message: string,
  extra?: Record<string, unknown>,
) {
  return NextResponse.json({ ok: false, error: { code, message, ...extra } }, { status });
}

export const UNAUTHENTICATED = () =>
  fail(401, "unauthenticated", "Sign in to continue.");

export function handle(error: unknown) {
  if (error instanceof Error && error.message === "UNAUTHENTICATED") {
    return UNAUTHENTICATED();
  }
  // Never leak internals to the client; log server-side instead.
  console.error("[api]", error);
  return fail(500, "internal_error", "Something went wrong. Try again.");
}

/** Rejects cross-site form posts. Same-origin is the only allowed source. */
export function assertSameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return true; // same-origin fetches may omit it
  try {
    const originHost = new URL(origin).host;
    // `request.url` is not guaranteed to preserve the public host in every
    // deployment (and a local 127.0.0.1 request can be reconstructed with the
    // machine name). Compare every trustworthy host form the request carries.
    const candidates = [
      new URL(request.url).host,
      request.headers.get("host"),
      request.headers.get("x-forwarded-host")?.split(",")[0]?.trim(),
    ].filter((host): host is string => Boolean(host));
    return candidates.includes(originHost);
  } catch {
    return false;
  }
}
