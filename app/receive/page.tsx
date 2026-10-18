import Link from "next/link";
import { AuthedShell } from "@/components/AuthedShell";
import { QrCode } from "@/components/QrCode";
import { CopyField } from "@/components/CopyField";
import { CopyButton } from "@/components/CopyButton";
import { Icon } from "@/components/Icon";
import { Card, Notice, PageHeader } from "@/components/ui";
import { db } from "@/lib/db";
import { currentUserOrRedirect } from "@/lib/session";
import { env } from "@/lib/env";
import { activeChain } from "@/config/chain";

export const metadata = { title: "Receive" };
export const dynamic = "force-dynamic";

/**
 * Receive.
 *
 * Two ways in, and this is the only screen in CloakPay that prints either of
 * them:
 *
 *   * the username, which is how another CloakPay user pays you.
 *   * the wallet address, and only so funds from an external wallet can land in
 *     this account. It is labelled for what it is for, so nobody reads it as
 *     the way to pay someone.
 *
 * Each value gets its own copy button, because copying is the only thing
 * anybody does with either one.
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
          subtitle="Share your username to get paid by other CloakPay users."
        />

        <div className="receive-grid">
          <Card className="receive-card receive-primary">
            <div className="receive-card-inner">
              <p className="table-head">Your CloakPay username</p>
              <div className="receive-identity">
                <span className="receive-username mono" title={`@${username}`}>
                  @{username}
                </span>
                <CopyButton value={username} label="the username" />
              </div>
              <p className="tiny muted receive-hint">
                You are paid at this username. It is the only thing another CloakPay user needs to send you
                money.
              </p>

              <div className="receive-divider">
                <CopyField label="Your payment link" value={identity} />
                <div className="receive-qr">
                  <QrCode value={identity} />
                  <p className="tiny muted receive-qr-caption">
                    Scanning opens your page, pre-filled with you as the recipient.
                  </p>
                </div>
              </div>

              <div className="receive-cta-row">
                <Link href="/links/new" className="btn btn-primary btn-lg receive-cta">
                  <Icon name="plus" size={16} strokeWidth={1.9} />
                  Create a payment link
                </Link>
              </div>
            </div>
          </Card>

          <div className="stack receive-side">
            <Card className="receive-address-card">
              <div className="receive-side-inner">
                <p className="table-head">Receive from external wallet</p>
                {wallet ? (
                  <>
                    <div className="receive-address">
                      <span className="mono receive-address-value">{wallet.address}</span>
                      <CopyButton value={wallet.address} label="the address" />
                    </div>
                    <p className="tiny muted receive-hint">
                      Use this address to receive {activeChain.nativeToken.symbol} from outside CloakPay.
                    </p>
                  </>
                ) : (
                  <p className="tiny muted receive-hint">
                    No wallet on this account yet. Finish setting up your account and the address appears here.
                  </p>
                )}
              </div>
            </Card>

            <Notice tone="info" title="Money coming in">
              Payments arrive as soon as the network confirms them. Funds sent from outside CloakPay land at
              the address above.
            </Notice>

            <div className="receive-assurance">
              <span className="receive-assurance-icon"><Icon name="shield" size={18} strokeWidth={1.6} /></span>
              <div>
                <p>Names stay in front. Addresses stay behind.</p>
                <span>Your public page never prints a wallet address, account id, or email.</span>
              </div>
            </div>
          </div>
        </div>
      </>
    </AuthedShell>
  );
}
