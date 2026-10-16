import Link from "next/link";
import { TopBar } from "@/components/Nav";
import { ComingSoon } from "@/components/ComingSoon";
import { Notice } from "@/components/ui";
import { currentUser } from "@/lib/session";

export const metadata = { title: "Privacy" };
export const dynamic = "force-dynamic";

/**
 * Privacy, stated for a user rather than an engineer.
 *
 * The pool is off, so there is nothing here to operate and nothing to report a
 * balance for. What is left is the one thing worth saying plainly: paying by
 * username hides who an address belongs to, not the transfer itself.
 */
export default async function PrivacyPage() {
  const user = await currentUser();

  return (
    <div className="app-shell">
      <TopBar user={user} />
      <main id="main" className="app-body">
        <div className="shell page">
          <div className="page-header">
            <div>
              <h1 className="page-title">Privacy</h1>
              <p className="page-subtitle">Where CloakPay stands on privacy today.</p>
            </div>
          </div>

          <div className="stack">
            <ComingSoon
              title="Shielded Pool"
              icon="shield"
              body="Private payments are coming soon. When the shielded pool arrives, a payment will no longer show who paid whom."
            />

            <Notice tone="info" title="A username is not a privacy feature">
              Paying by username keeps the link between a person and their wallet inside CloakPay, but it does
              not make a transfer private: a payment today is an ordinary transfer on a public testnet, so it
              can be seen on chain. The{" "}
              <Link href="/security" className="link">
                security
              </Link>{" "}
              page and the{" "}
              <Link href="/privacy/policy" className="link">
                privacy policy
              </Link>{" "}
              have the details.
            </Notice>
          </div>
        </div>
      </main>
    </div>
  );
}
