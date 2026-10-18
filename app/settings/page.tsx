import Link from "next/link";
import { AuthedShell } from "@/components/AuthedShell";
import { Card, Notice, PageHeader } from "@/components/ui";
import { listIdentities } from "@/lib/auth/accounts";
import { db } from "@/lib/db";
import { currentUserOrRedirect } from "@/lib/session";

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
        <div className="settings-grid">
          <div className="stack">
            <Card className="settings-card">
              <div className="card-pad">
                <p className="table-head">Profile</p>
                <dl className="kv settings-kv">
                  <dt>Username</dt>
                  <dd className="mono">@{user.username}</dd>
                  <dt>Display name</dt>
                  <dd>{user.displayName ?? "—"}</dd>
                  <dt>Public page</dt>
                  <dd><Link className="link" href={`/u/${user.username}`}>/u/{user.username}</Link></dd>
                </dl>
              </div>
            </Card>

            <Card className="settings-card">
              <div className="card-pad">
                <p className="table-head">Connected accounts</p>
                <ul className="settings-list">
                  {identities.map((identity) => (
                    <li key={identity.provider} className="row-between">
                      <span className="settings-list-name">
                        <span className="settings-provider">{identity.provider === "x" ? "X" : "Google"}</span>
                      </span>
                      <span className="tiny muted">{identity.handle ? `@${identity.handle}` : "linked"}</span>
                    </li>
                  ))}
                </ul>
                <p className="tiny muted settings-copy">
                  Your sign-in identity is separate from your wallet. CloakPay does not keep provider access
                  tokens.
                </p>
              </div>
            </Card>

            <Card className="settings-card">
              <div className="card-pad">
                <p className="table-head">Security and recovery</p>
                <div className="stack-sm settings-stack">
                  <div className="row-between">
                    <span style={{ fontSize: 14 }}>Wallet</span>
                    <span className="tiny muted">
                      {wallet ? "set up and self-custodial" : "not set up yet"}
                    </span>
                  </div>
                  <p className="tiny muted">
                    View or copy your receiving address on the{" "}
                    <Link className="link" href="/receive">
                      Receive page
                    </Link>
                    .
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
            <Card className="settings-card">
              <div className="card-pad">
                <p className="table-head">Privacy preferences</p>
                <p className="tiny muted settings-copy">
                  Your public page shows a username and a payment link. It never shows a wallet address,
                  email, or account id. Visibility controls are stored per account and default to the most
                  private setting.
                </p>
                <p className="tiny muted settings-copy">
                  Payments are ordinary transfers on a public testnet, so they can be seen on chain.
                </p>
              </div>
            </Card>
            <Card className="settings-card">
              <div id="notifications" className="anchor-target card-pad">
                <p className="table-head">Notifications</p>
                <p className="tiny muted settings-copy">
                  Payment and confirmation notices live in your inbox, with an unread count in the header
                  bell. Amounts are never included in the preview.
                </p>
                <Link href="/notifications" className="btn btn-secondary btn-sm settings-action">
                  Open notifications
                </Link>
              </div>
            </Card>
            <Card className="settings-card">
              <div className="card-pad">
                <p className="table-head">Session</p>
                <form action="/api/auth/signout" method="post" className="settings-signout">
                  <button className="btn btn-danger btn-sm" type="submit">Sign out</button>
                </form>
                <p className="tiny muted settings-copy">
                  Signing out ends your session.
                </p>
              </div>
            </Card>
          </div>
        </div>
      </>
    </AuthedShell>
  );
}
