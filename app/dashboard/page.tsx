import Link from "next/link";
import { AuthedShell } from "@/components/AuthedShell";
import { WalletSummary } from "@/components/WalletSummary";
import { Badge, Card, EmptyState } from "@/components/ui";
import { Icon } from "@/components/Icon";
import { db } from "@/lib/db";
import { currentUser } from "@/lib/session";
import { formatWei } from "@/lib/payments";
import { activeChain } from "@/config/chain";
import { poolStatusSentence } from "@/config/pool";

export const metadata = { title: "Dashboard" };
export const dynamic = "force-dynamic";

/**
 * Home is about the two things a person opens it for: what they hold, and who
 * they are paying. The shielded pool moved to its own Privacy section, so what
 * is left here is real balances and real payments rather than privacy figures
 * that are not in play yet.
 */
export default async function DashboardPage() {
  const user = await currentUser();
  if (!user) return null;
  const sql = db();

  const [wallet] = await sql<{ address: string }[]>`
    select address from wallets where user_id = ${user.userId}
  `;
  const recent = await sql<
    {
      id: string;
      privacy: string;
      status: string;
      amount_wei: string | null;
      direction: string;
      counterparty: string | null;
    }[]
  >`
    select p.id, p.privacy, p.status, p.amount_wei,
           case when p.from_user_id = ${user.userId} then 'sent' else 'received' end as direction,
           case when p.from_user_id = ${user.userId}
                then coalesce(tu.username, 'unknown') else coalesce(fu.username, 'unknown') end as counterparty
    from payments p
    left join users fu on fu.id = p.from_user_id
    left join users tu on tu.id = p.to_user_id
    where p.from_user_id = ${user.userId} or p.to_user_id = ${user.userId}
    order by p.created_at desc limit 5
  `;

  return (
    <AuthedShell>
      <>
        <div className="page-header page-header-tight">
          <div>
            <h1 className="page-title">Hello{user.displayName ? `, ${user.displayName}` : ""}</h1>
            {/* The balance panel below already names the wallet and the network,
                so repeating either here would just be noise. */}
            {wallet ? null : (
              <p className="page-subtitle">
                No wallet yet — finish setting up your account to send and receive.
              </p>
            )}
          </div>
        </div>

        <WalletSummary
          address={wallet?.address ?? null}
          username={user.username}
          symbol={activeChain.nativeToken.symbol}
          decimals={activeChain.nativeToken.decimals}
        />

        <section style={{ marginTop: 28 }}>
          <div className="row-between" style={{ marginBottom: 12 }}>
            <h2 style={{ fontSize: 17 }}>Recent activity</h2>
            <Link href="/activity" className="link tiny">
              View all
            </Link>
          </div>
          {recent.length === 0 ? (
            <EmptyState
              title="No payments yet"
              body="Create a payment link or share your username to receive your first payment."
              action={
                <Link href="/links" className="btn btn-primary btn-sm">
                  Create a payment link
                </Link>
              }
            />
          ) : (
            <Card>
              <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
                {recent.map((row) => (
                  <li key={row.id} className="list-row divide-row">
                    <div className="grow">
                      <div className="row" style={{ gap: 8 }}>
                        <span style={{ fontSize: 14, fontWeight: 500 }}>
                          {row.direction === "sent" ? "To" : "From"} @{row.counterparty}
                        </span>
                        <Badge kind={row.privacy} />
                        <Badge kind={row.status} />
                      </div>
                    </div>
                    <span className="mono" style={{ fontSize: 14 }}>
                      {row.amount_wei ? formatWei(BigInt(row.amount_wei)) : "—"}{" "}
                      {activeChain.nativeToken.symbol}
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </section>

        <section style={{ marginTop: 28 }}>
          <Card className="card-quiet">
            <div className="privacy-teaser">
              <span className="feature-icon">
                <Icon name="shield" size={17} />
              </span>
              <div className="grow">
                <h3 style={{ fontSize: 15 }}>Privacy</h3>
                <p className="tiny muted" style={{ marginTop: 4 }}>
                  {poolStatusSentence(activeChain.chainId)}
                </p>
              </div>
              <Link href="/privacy" className="btn btn-secondary btn-sm">
                Open
                <Icon name="arrowRight" size={14} />
              </Link>
            </div>
          </Card>
        </section>
      </>
    </AuthedShell>
  );
}
