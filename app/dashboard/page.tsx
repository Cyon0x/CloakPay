import Link from "next/link";
import { AuthedShell } from "@/components/AuthedShell";
import { WalletSummary } from "@/components/WalletSummary";
import { GetPaidCard } from "@/components/GetPaidCard";
import { ComingSoon } from "@/components/ComingSoon";
import { Badge, EmptyState } from "@/components/ui";
import { Icon } from "@/components/Icon";
import { db } from "@/lib/db";
import { currentUserOrRedirect } from "@/lib/session";
import { formatWei } from "@/lib/payments";
import { activeChain } from "@/config/chain";
import { EXTERNAL_TRANSFER_PAUSED } from "@/config/features";
import { env } from "@/lib/env";

export const metadata = { title: "Dashboard" };
export const dynamic = "force-dynamic";

/**
 * Home is about the two things a person opens it for: what they hold, and who
 * they are paying. It leads with the username, because that is the thing a
 * CloakPay payment is addressed to, and with the balance that a payment is
 * actually spent from. Every action below it opens a route that exists; the two
 * paused features stay at the bottom, stated in one line each, so nothing here
 * suggests they are available.
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

  const symbol = activeChain.nativeToken.symbol;
  const receiveLink = user.username ? `${env.appUrl}/u/${user.username}` : null;

  return (
    <AuthedShell>
      <div className="dashboard">
        <header className="dashboard-greeting">
          <h1>Hello{user.displayName ? `, ${user.displayName}` : user.username ? `, @${user.username}` : ""}</h1>
          <p>Your wallet, your control.</p>
          {wallet ? null : (
            <p className="tiny muted dashboard-note">
              No wallet yet — finish setting up your account to send and receive.
            </p>
          )}
        </header>

        <WalletSummary
          address={wallet?.address ?? null}
          username={user.username}
          symbol={symbol}
          decimals={activeChain.nativeToken.decimals}
        />

        <section className="dash-cards" aria-label="Payments and receipts">
          <article className="dash-card">
            <div className="dash-card-head">
              <span className="dash-icon">
                <Icon name="send" size={17} strokeWidth={1.8} />
              </span>
              <h2>Pay Someone</h2>
            </div>
            <p>
              Send {symbol} to another CloakPay user by typing their username — their wallet address stays
              private.
            </p>
            <Link href="/send" className="dash-card-action">
              Send a payment
              <Icon name="chevronRight" size={15} />
            </Link>
          </article>

          <article className="dash-card">
            <div className="dash-card-head">
              <span className="dash-icon">
                <Icon name="list" size={17} strokeWidth={1.8} />
              </span>
              <h2>Receipts</h2>
            </div>
            <p>Download a receipt for any confirmed payment.</p>
            <Link href="/transactions" className="dash-card-action">
              All transactions
              <Icon name="chevronRight" size={15} />
            </Link>
          </article>

          <article className="dash-card">
            <div className="dash-card-head">
              <span className="dash-icon">
                <Icon name="link" size={17} strokeWidth={1.8} />
              </span>
              <h2>Get Paid</h2>
            </div>
            <p>
              Share @{user.username ?? "your username"} and other CloakPay users can pay you without ever
              seeing your wallet address.
            </p>
            <GetPaidCard username={user.username} link={receiveLink} />
          </article>
        </section>

        <section className="dash-recent" aria-labelledby="recent-heading">
          <div className="activity-head">
            <h2 id="recent-heading">Recent activity</h2>
            <div className="activity-head-actions">
              <Link href="/activity" className="link">
                View all
              </Link>
              <Link href="/transactions" className="link">
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
            <div className="activity-card">
              <ul className="activity-list">
                {recent.map((row) => {
                  const confirmed = row.status === "confirmed";
                  const content = (
                    <>
                      <div className="activity-main">
                        <div className="activity-who">
                          <span>
                            {row.direction === "sent" ? "To" : "From"} @{row.counterparty}
                          </span>
                          <Badge kind={row.privacy} />
                          <Badge kind={row.status} />
                        </div>
                      </div>
                      <div className="activity-side">
                        <span className="activity-amount">
                          <span className="sign">{row.direction === "sent" ? "−" : "+"}</span>
                          {row.amount_wei ? formatWei(BigInt(row.amount_wei)) : "—"} {symbol}
                        </span>
                        {confirmed ? (
                          <span className="activity-receipt">
                            <span>Receipt</span>
                            <Icon name="chevronRight" size={14} />
                          </span>
                        ) : null}
                      </div>
                    </>
                  );

                  return (
                    <li key={row.id}>
                      {confirmed ? (
                        <Link href={`/transactions/${row.id}`} className="activity-row">
                          {content}
                        </Link>
                      ) : (
                        <div className="activity-row">{content}</div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </section>

        <section className="paused-stack" aria-label="Not available yet">
          <div className="stack">
            <ComingSoon title="Swap" icon="swap" body="Exchange between assets inside CloakPay." />
            <ComingSoon title="External Transfer" icon="external" body={EXTERNAL_TRANSFER_PAUSED} />
          </div>
        </section>
      </div>
    </AuthedShell>
  );
}
