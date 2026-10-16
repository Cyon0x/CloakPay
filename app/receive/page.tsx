import Link from "next/link";
import { AuthedShell } from "@/components/AuthedShell";
import { QrCode } from "@/components/QrCode";
import { CopyField } from "@/components/CopyField";
import { ComingSoon } from "@/components/ComingSoon";
import { CopyButton } from "@/components/CopyButton";
import { Card, Notice, PageHeader } from "@/components/ui";
import { db } from "@/lib/db";
import { currentUserOrRedirect } from "@/lib/session";
import { env } from "@/lib/env";
import { activeChain } from "@/config/chain";
import { poolStatusSentence } from "@/config/pool";

export const metadata = { title: "Receive" };
export const dynamic = "force-dynamic";

/**
 * Receive.
 *
 * Two ways in, and this is the only screen in CloakPay that prints either of
 * them:
 *
 *   * the username, which is how another CloakPay user pays you. Nothing else
 *     is needed, and no address is exchanged.
 *   * the wallet address, and only so funds from an external wallet can land in
 *     this account. Nothing else in the product shows an address — not the
 *     dashboard, not settings, not a receipt — because paying by username is
 *     the whole payment experience. It is labelled for what it is for, so
 *     nobody reads it as the way to pay someone.
 */
export default async function ReceivePage() {
  const user = await currentUserOrRedirect();
  const rows = await db()<{ address: string }[]>`
    select address from wallets where user_id = ${user.userId}
  `;
  const wallet = rows[0];
  const identity = `${env.appUrl}/u/${user.username}`;
  const username = user.username ?? "";

  return (
    <AuthedShell>
      <>
        <PageHeader
          title="Receive"
          subtitle="Share your username and people pay you inside CloakPay. No address changes hands, in either direction."
        />

        <div className="split">
          <Card>
            <div style={{ padding: 24 }}>
              <p className="table-head">Your CloakPay username</p>
              <div className="receive-identity">
                <span className="receive-username mono" title={`@${username}`}>
                  @{username}
                </span>
                <CopyButton value={username} label="the username" />
              </div>
              <p className="tiny muted" style={{ marginTop: 10 }}>
                Another CloakPay user types this on their Send page. It resolves to this account, which is why
                a payment needs nothing else.
              </p>

              <div style={{ marginTop: 22, paddingTop: 20, borderTop: "1px solid var(--color-line-soft)" }}>
                <CopyField label="Your payment link" value={identity} />
                <div style={{ marginTop: 20, textAlign: "center" }}>
                  <QrCode value={identity} />
                  <p className="tiny muted" style={{ marginTop: 10 }}>
                    Anyone scanning this is taken to your page signed in as themselves, and pays by username.
                  </p>
                </div>
              </div>

              <div className="row" style={{ gap: 8, marginTop: 20, justifyContent: "center" }}>
                <Link href="/links" className="btn btn-primary">
                  Create a payment link
                </Link>
              </div>
            </div>
          </Card>

          <div className="stack">
            <Card>
              <div style={{ padding: 20 }}>
                <p className="table-head">Receive from external wallet</p>
                {wallet ? (
                  <>
                    <div className="receive-address">
                      <span className="mono receive-address-value">{wallet.address}</span>
                      <CopyButton value={wallet.address} label="the address" />
                    </div>
                    <p className="tiny muted" style={{ marginTop: 10 }}>
                      This address is where funds land when somebody sends {activeChain.nativeToken.symbol} to
                      this account from outside CloakPay. It is shown here and nowhere else in the app — no
                      receipt, no profile and no transaction record prints it.
                    </p>
                  </>
                ) : (
                  <p className="tiny muted" style={{ marginTop: 10 }}>
                    No wallet on this account yet. Finish setting up your account and the address appears here.
                  </p>
                )}
              </div>
            </Card>

            <ComingSoon
              title="Shielded Pool"
              icon="shield"
              body="Nothing arriving here is shielded today, and nothing on this page operates the pool."
              note={poolStatusSentence(activeChain.chainId)}
            />

            <Notice tone="info" title="Money coming in">
              A payment from another CloakPay user arrives the moment the network confirms it. Anything
              arriving from an external wallet lands at the address above.
            </Notice>
          </div>
        </div>
      </>
    </AuthedShell>
  );
}
