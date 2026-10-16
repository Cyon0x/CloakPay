import Link from "next/link";
import { AuthedShell } from "@/components/AuthedShell";
import { Badge, Card, Notice, PageHeader } from "@/components/ui";
import { listIdentities } from "@/lib/auth/accounts";
import { db } from "@/lib/db";
import { currentUserOrRedirect } from "@/lib/session";
import { ComingSoon } from "@/components/ComingSoon";
import { poolStatusSentence } from "@/config/pool";
import { activeChain } from "@/config/chain";

export const metadata = { title: "Settings" };
export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const user = await currentUserOrRedirect();
  const identities = await listIdentities(user.userId);
  const [wallet] = await db()<{ address: string; viewing_key_id: string | null }[]>`
    select address, viewing_key_id from wallets where user_id = ${user.userId}
  `;

  return (
    <AuthedShell>
      <>
        <PageHeader title="Settings" subtitle="Identity, wallet, and privacy." />
        <div className="split">
          <div className="stack">
            <Card>
              <div style={{ padding: 20 }}>
                <p className="table-head">Profile</p>
                <dl className="kv" style={{ marginTop: 12 }}>
                  <dt>Username</dt>
                  <dd className="mono">@{user.username}</dd>
                  <dt>Display name</dt>
                  <dd>{user.displayName ?? "—"}</dd>
                  <dt>Public page</dt>
                  <dd><Link className="link" href={`/u/${user.username}`}>/u/{user.username}</Link></dd>
                </dl>
              </div>
            </Card>

            <Card>
              <div style={{ padding: 20 }}>
                <p className="table-head">Connected accounts</p>
                <ul style={{ listStyle: "none", margin: "12px 0 0", padding: 0 }} className="stack-sm">
                  {identities.map((identity) => (
                    <li key={identity.provider} className="row-between">
                      <span style={{ fontSize: 14, textTransform: "capitalize" }}>{identity.provider}</span>
                      <span className="tiny muted">{identity.handle ? `@${identity.handle}` : "linked"}</span>
                    </li>
                  ))}
                </ul>
                <p className="tiny muted" style={{ marginTop: 12 }}>
                  Your sign-in identity is separate from your wallet. CloakPay does not keep provider access
                  tokens.
                </p>
              </div>
            </Card>

            <Card>
              <div style={{ padding: 20 }}>
                <p className="table-head">Security and recovery</p>
                <div className="stack-sm" style={{ marginTop: 12 }}>
                  <div className="row-between">
                    <span style={{ fontSize: 14 }}>Wallet</span>
                    <span className="tiny muted">
                      {wallet ? "set up and self-custodial" : "not set up yet"}
                    </span>
                  </div>
                  <p className="tiny muted">
                    The address this wallet receives at is on the{" "}
                    <Link className="link" href="/receive">
                      Receive page
                    </Link>
                    . It is the only place in CloakPay that shows it: payments here are addressed to
                    usernames, not to addresses.
                  </p>
                </div>
                <Notice tone="warn" title="Recovery">
                  Your 12-word phrase is the only way to restore this wallet. Your passphrase only unlocks
                  the encrypted copy CloakPay stores. Losing both means losing the wallet.
                </Notice>
              </div>
            </Card>
          </div>

          <div className="stack">
            <Card>
              <div style={{ padding: 20 }}>
                <p className="table-head">Privacy preferences</p>
                <p className="tiny muted" style={{ marginTop: 10 }}>
                  Your public page shows a username and a payment link. It never shows a wallet address,
                  email, or account id. Visibility controls are stored per account and default to the most
                  private setting.
                </p>
                <p className="tiny muted" style={{ marginTop: 10 }}>
                  CloakPay keeps the link between your username and your wallet to itself, but the payments
                  themselves are ordinary transfers on a public test network: they can be seen on chain.
                </p>
              </div>
            </Card>
            <ComingSoon
              title="Shielded Pool"
              icon="shield"
              body="Private payments are paused, so your viewing key is not in use and no notes are being created or spent."
              note={poolStatusSentence(activeChain.chainId)}
            />
            <Card>
              <div style={{ padding: 20 }}>
                <p className="table-head">Notifications</p>
                <p className="tiny muted" style={{ marginTop: 10 }}>
                  In-app notifications are on. Amounts are deliberately left out of notification text so a
                  lock-screen preview cannot leak a payment.
                </p>
              </div>
            </Card>
            <Card>
              <div style={{ padding: 20 }}>
                <p className="table-head">Session</p>
                <form action="/api/auth/signout" method="post" style={{ marginTop: 12 }}>
                  <button className="btn btn-danger btn-sm" type="submit">Sign out</button>
                </form>
                <p className="tiny muted" style={{ marginTop: 10 }}>
                  Signing out revokes the session server-side.
                </p>
              </div>
            </Card>
          </div>
        </div>
      </>
    </AuthedShell>
  );
}
