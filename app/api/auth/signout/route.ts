import { NextResponse } from "next/server";
import { destroySession } from "@/lib/session";
import { assertSameOrigin } from "@/lib/api";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  // Sign-out is state-changing, so it is same-origin only.
  if (!assertSameOrigin(request)) {
    return NextResponse.redirect(new URL("/signin?error=bad_origin", env.appUrl));
  }
  await destroySession();
  return NextResponse.redirect(new URL("/", env.appUrl), 303);
}
