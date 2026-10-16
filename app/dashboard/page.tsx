import Link from "next/link";
import { AuthedShell } from "@/components/AuthedShell";
import { WalletSummary } from "@/components/WalletSummary";
import { ComingSoon } from "@/components/ComingSoon";
import { Badge, Card, EmptyState } from "@/components/ui";
import { Icon } from "@/components/Icon";
import { db } from "@/lib/db";
import { currentUserOrRedirect } from "@/lib/session";
import { formatWei } from "@/lib/payments";
import { activeChain } from "@/config/chain";
import { EXTERNAL_TRANSFER_PAUSED } from "@/config/features";

export const metadata = { title: "Dashboard" };
export const dynamic = "force-dynamic";

/**
 * Home is about the two things a person opens it for: what they hold, and who
 * they are paying. It leads with the username, because that is the thing a
 * CloakPay payment is addressed to, and with the balance that a payment is
 * actually spent from. The two features that are paused are listed at the
 * bottom as paused, so nothing here suggests they are available -- stated in
 * one line each, because a user needs to know a feature is not there yet, not
 * how it is built or what state its implementation is in.
 */
export default async function DashboardPage() {
  const user = await currentUserOrRedirect();
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

        <section className="grid-3" style={{ marginTop: 22 }}>
          <Card className="card-quiet">
            <div style={{ padding: 20 }}>
              <p className="table-head">Pay someone</p>
              <p className="tiny muted" style={{ marginTop: 8 }}>
                Send {activeChain.nativeToken.symbol} to another CloakPay user by typing their username —
                their wallet address stays private.
              </p>
              <Link href="/send" className="btn btn-primary btn-sm" style={{ marginTop: 14 }}>
                <Icon name="send" size={14} />
                Send a payment
              </Link>
            </div>
          </Card>
          <Card className="card-quiet">
            <div style={{ padding: 20 }}>
              <p className="table-head">Receipts</p>
              <p className="tiny muted" style={{ marginTop: 8 }}>
                Download a receipt for any confirmed payment.
              </p>
              <Link href="/transactions" className="btn btn-secondary btn-sm" style={{ marginTop: 14 }}>
                <Icon name="list" size={14} />
                All transactions
              </Link>
            </div>
          </Card>
          <Card className="card-quiet">
            <div style={{ padding: 20 }}>
              <p className="table-head">Get paid</p>
              <p className="tiny muted" style={{ marginTop: 8 }}>
                Share @{user.username} and other CloakPay users can pay you without ever seeing your wallet
                address.
              </p>
              <Link href="/receive" className="btn btn-secondary btn-sm" style={{ marginTop: 14 }}>
                <Icon name="receive" size={14} />
                Receiving details
              </Link>
            </div>
          </Card>
        </section>

        <section style={{ marginTop: 28 }}>
          <div className="row-between" style={{ marginBottom: 12 }}>
            <h2 style={{ fontSize: 17 }}>Recent activity</h2>
            <div className="row" style={{ gap: 10 }}>
              <Link href="/activity" className="link tiny">
                View all
              </Link>
              <Link href="/transactions" className="link tiny">
                All transactions
              </Link>
            </div>
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
                    {row.status === "confirmed" ? (
                      <Link href={`/transactions/${row.id}`} className="btn btn-ghost btn-sm">
                        Receipt
                      </Link>
                    ) : null}
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </section>

        <section style={{ marginTop: 28 }}>
          <div className="stack">
            <ComingSoon
              title="Swap"
              icon="swap"
              body="Exchange between assets inside CloakPay."
            />
            <ComingSoon
              title="External Transfer"
              icon="external"
              body={EXTERNAL_TRANSFER_PAUSED}
            />
          </div>
        </section>
      </>
    </AuthedShell>
  );
}
