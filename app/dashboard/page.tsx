import Link from "next/link";
import { AuthedShell } from "@/components/AuthedShell";
import { Badge, Card, EmptyState, Stat } from "@/components/ui";
import { db } from "@/lib/db";
import { currentUser } from "@/lib/session";
import { formatWei } from "@/lib/payments";
import { activeChain } from "@/config/chain";
import { DENOMINATIONS } from "@/config/pool";

export const metadata = { title: "Dashboard" };
export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const user = await currentUser();
  if (!user) return null;
  const sql = db();

  const [wallet] = await sql<{ address: string }[]>`select address from wallets where user_id = ${user.userId}`;
  const [notes] = await sql<{ unspent: number }[]>`
    select count(*) filter (where status = 'unspent')::int as unspent
    from shielded_notes where user_id = ${user.userId}
  `;
  const recent = await sql<
    { id: string; privacy: string; status: string; amount_wei: string | null; direction: string; counterparty: string | null }[]
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
        <div className="page-header">
          <div>
            <p className="tiny muted">@{user.username}</p>
            <h1 className="page-title">Hello{user.displayName ? `, ${user.displayName}` : ""}</h1>
            <p className="page-subtitle">
              {wallet
                ? `Wallet ${wallet.address.slice(0, 10)}…${wallet.address.slice(-6)} on ${activeChain.name}`
                : "No wallet yet."}
            </p>
          </div>
          <div className="page-actions">
            <Link href="/send" className="btn btn-primary">Send</Link>
            <Link href="/receive" className="btn btn-secondary">Receive</Link>
          </div>
        </div>

        <div className="grid-3">
          <Card>
            <Stat label="Private notes held" value={notes?.unspent ?? 0}
              hint={notes?.unspent ? "Ready to withdraw to your wallet" : "Nothing waiting to be claimed"} />
          </Card>
          <Card>
            <Stat label="Shielded denominations" value={DENOMINATIONS.length} hint="Fixed sizes the pool accepts" />
          </Card>
          <Card>
            <Stat label="Network" value={activeChain.nativeToken.symbol} hint={`Chain ${activeChain.chainId} · testnet`} />
          </Card>
        </div>

        <section style={{ marginTop: 26 }}>
          <div className="row-between" style={{ marginBottom: 12 }}>
            <h2 style={{ fontSize: 17 }}>Recent activity</h2>
            <Link href="/activity" className="link tiny">View all</Link>
          </div>
          {recent.length === 0 ? (
            <EmptyState title="No payments yet"
              body="Create a payment link or share your username to receive your first payment."
              action={<Link href="/links" className="btn btn-primary btn-sm">Create a payment link</Link>} />
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
                      {row.amount_wei ? formatWei(BigInt(row.amount_wei)) : "—"} HYPE
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </section>
      </>
    </AuthedShell>
  );
}
