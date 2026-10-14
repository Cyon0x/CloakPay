import Link from "next/link";
import { redirect } from "next/navigation";
import { TopBar } from "@/components/Nav";
import { Lockup } from "@/components/Brand";
import { Notice } from "@/components/ui";
import { currentUser } from "@/lib/session";
import { providerAvailability } from "@/lib/env";

const ERRORS: Record<string, string> = {
  cancelled: "Sign-in was cancelled at the provider. Nothing was created.",
  state_mismatch: "That sign-in attempt expired or was tampered with. Try again.",
  invalid_callback: "The provider sent an incomplete response. Try again.",
  exchange_failed: "We could not complete the sign-in with the provider. Try again.",
  unknown_provider: "That sign-in method is not available.",
  rate_limited: "Too many attempts. Wait a minute and try again.",
  bad_origin: "That request did not come from CloakPay.",
  session_expired: "Your session ended. Sign in again.",
};

export const metadata = { title: "Sign in" };
export const dynamic = "force-dynamic";

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string }>;
}) {
  const user = await currentUser();
  const { error, next } = await searchParams;
  if (user) redirect(next && next.startsWith("/") ? next : "/dashboard");

  const available = providerAvailability();
  const nextParam = next && next.startsWith("/") ? `?next=${encodeURIComponent(next)}` : "";

  return (
    <div className="app-shell">
      <TopBar user={null} />
      <main id="main" className="app-body">
        <div className="shell" style={{ maxWidth: 460, paddingTop: 64, paddingBottom: 80 }}>
          <div style={{ display: "flex", justifyContent: "center", marginBottom: 22 }}>
            <Lockup markSize={38} />
          </div>
          <h1 style={{ fontSize: 25, textAlign: "center" }}>Sign in to CloakPay</h1>
          <p className="muted tiny" style={{ textAlign: "center", marginTop: 8 }}>
            Google and X are the only options. There is no password to forget.
          </p>

          {error ? (
            <div style={{ marginTop: 22 }}>
              <Notice tone="error" title="Sign-in did not finish">
                {ERRORS[error] ?? "Something went wrong. Try again."}
              </Notice>
            </div>
          ) : null}

          <div className="stack" style={{ marginTop: 26 }}>
            <a
              href={`/api/auth/google/start${nextParam}`}
              className="btn btn-secondary btn-lg btn-block"
              aria-disabled={!available.google}
              style={!available.google ? { opacity: 0.5, pointerEvents: "none" } : undefined}
            >
              <svg width="17" height="17" viewBox="0 0 24 24" aria-hidden="true">
                <path fill="#4285F4" d="M23.5 12.3c0-.9-.1-1.5-.2-2.2H12v4.1h6.5c-.1 1.1-.8 2.7-2.4 3.8l3.7 2.9c2.2-2 3.7-5 3.7-8.6z" />
                <path fill="#34A853" d="M12 24c3.2 0 5.9-1.1 7.8-2.9l-3.7-2.9c-1 .7-2.4 1.2-4.1 1.2-3.2 0-5.9-2.1-6.8-5l-3.9 3C3.2 21.3 7.3 24 12 24z" />
                <path fill="#FBBC05" d="M5.2 14.4A7.4 7.4 0 0 1 4.8 12c0-.8.2-1.7.4-2.4l-3.9-3A12 12 0 0 0 0 12c0 1.9.5 3.8 1.3 5.4l3.9-3z" />
                <path fill="#EA4335" d="M12 4.8c2.3 0 3.8 1 4.7 1.8l3.4-3.3C18.1 1.3 15.2 0 12 0 7.3 0 3.2 2.7 1.3 6.6l3.9 3C6.1 6.9 8.8 4.8 12 4.8z" />
              </svg>
              Continue with Google
            </a>
            <a
              href={`/api/auth/x/start${nextParam}`}
              className="btn btn-primary btn-lg btn-block"
              aria-disabled={!available.x}
              style={!available.x ? { opacity: 0.5, pointerEvents: "none" } : undefined}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M18.24 2.25h3.31l-7.23 8.26 8.5 11.24h-6.65l-5.21-6.82-5.97 6.82H1.68l7.73-8.84L1.25 2.25h6.82l4.71 6.23 5.46-6.23zm-1.16 17.52h1.83L7.02 4.13H5.05l12.03 15.64z" />
              </svg>
              Continue with X
            </a>
          </div>

          {!available.google || !available.x ? (
            <div style={{ marginTop: 18 }}>
              <Notice
                tone="warn"
                title={
                  !available.google && !available.x
                    ? "Sign-in is not configured yet"
                    : "One provider is not configured yet"
                }
              >
                {!available.google && !available.x
                  ? "Neither provider has credentials configured on this deployment. Set GOOGLE_CLIENT_ID/SECRET and X_CLIENT_ID/SECRET."
                  : !available.google
                    ? "Google is unavailable: GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are not set."
                    : "X is unavailable: X_CLIENT_ID and X_CLIENT_SECRET are not set."}{" "}
                The buttons are disabled rather than failing after a redirect.
              </Notice>
            </div>
          ) : null}

          <p className="tiny muted" style={{ marginTop: 24, textAlign: "center" }}>
            By continuing you agree to the{" "}
            <Link href="/terms" className="link">
              terms
            </Link>{" "}
            and{" "}
            <Link href="/privacy" className="link">
              privacy policy
            </Link>
            .
          </p>
        </div>
      </main>
    </div>
  );
}
