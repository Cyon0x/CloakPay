import Link from "next/link";
import { AuthedShell } from "@/components/AuthedShell";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui";
import { Icon } from "@/components/Icon";
import { db } from "@/lib/db";
import { currentUserOrRedirect } from "@/lib/session";
import { formatWei } from "@/lib/payments";
import { activeChain } from "@/config/chain";

export const metadata = { title: "All transactions" };
export const dynamic = "force-dynamic";

/**
 * The complete ledger.
 *
 * Activity is the short feed you land on; this is every row CloakPay holds for
 * the account, with the status the network reported and a receipt for every
 * payment that confirmed. A receipt can be reopened from here at any time,
 * which is the point of keeping the ledger rather than a feed.
 */
export default async function TransactionsPage() {
  const user = await currentUserOrRedirect();

  const rows = await db()<
    {
      id: string;
      privacy: string;
      status: string;
      amount_wei: string | null;
      tx_hash: string | null;
      block_number: string | null;
      created_at: Date;
      direction: string;
      counterparty: string | null;
    }[]
  >`
    select p.id, p.privacy, p.status, p.amount_wei, p.tx_hash, p.block_number, p.created_at,
           case when p.from_user_id = ${user.userId} then 'sent' else 'received' end as direction,
           case when p.from_user_id = ${user.userId}
                then coalesce(tu.username, 'unknown') else coalesce(fu.username, 'unknown') end as counterparty
    from payments p
    left join users fu on fu.id = p.from_user_id
    left join users tu on tu.id = p.to_user_id
    where p.from_user_id = ${user.userId} or p.to_user_id = ${user.userId}
    order by p.created_at desc
    limit 200
  `;

  const settled = rows.filter((row) => row.status === "confirmed").length;
  const pending = rows.filter((row) => row.status === "submitted" || row.status === "pending").length;

  return (
    <AuthedShell>
      <PageHeader
        title="All transactions"
        subtitle="Every payment on this account, with its real status and its receipt. Nothing here is estimated."
        actions={
          <Link href="/activity" className="btn btn-secondary btn-sm">
            Activity feed
          </Link>
        }
      />

      <p className="tiny muted" style={{ marginBottom: 14 }}>
        {rows.length} recorded · {settled} confirmed · {pending} awaiting confirmation
      </p>

      {rows.length === 0 ? (
        <EmptyState
          title="Nothing recorded yet"
          body="Payments you send or receive appear here as soon as they are attempted, along with what happened to them."
          action={
            <Link href="/send" className="btn btn-primary btn-sm">
              Send a payment
            </Link>
          }
        />
      ) : (
        <Card>
          <ul className="ledger">
            {rows.map((row) => (
              <li key={row.id} className="ledger-row">
                <div className="ledger-main">
                  <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 14, fontWeight: 500 }}>
                      {row.direction === "sent" ? "To" : "From"} @{row.counterparty}
                    </span>
                    <Badge kind={row.privacy} />
                    <Badge kind={row.status} />
                  </div>
                  <p className="tiny muted" style={{ marginTop: 4 }}>
                    {new Date(row.created_at).toISOString().replace("T", " ").slice(0, 16)} UTC
                    {row.block_number ? ` · block ${row.block_number}` : ""}
                  </p>
                </div>
                <div className="ledger-side">
                  <span className="mono" style={{ fontSize: 14 }}>
                    {row.amount_wei ? formatWei(BigInt(row.amount_wei)) : "—"}{" "}
                    {activeChain.nativeToken.symbol}
                  </span>
                  {row.status === "confirmed" ? (
                    <Link className="btn btn-secondary btn-sm" href={`/transactions/${row.id}`}>
                      <Icon name="download" size={13} />
                      Receipt
                    </Link>
                  ) : (
                    <span className="tiny muted">
                      {row.tx_hash ? "awaiting confirmation" : "nothing on chain yet"}
                    </span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </AuthedShell>
  );
}
