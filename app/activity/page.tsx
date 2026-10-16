import Link from "next/link";
import { AuthedShell } from "@/components/AuthedShell";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui";
import { db } from "@/lib/db";
import { currentUserOrRedirect } from "@/lib/session";
import { formatWei } from "@/lib/payments";
import { explorerTx } from "@/config/chain";

export const metadata = { title: "Activity" };
export const dynamic = "force-dynamic";

export default async function ActivityPage() {
  const user = await currentUserOrRedirect();

  const rows = await db()<
    {
      id: string; privacy: string; status: string; amount_wei: string | null; note: string | null;
      tx_hash: string | null; created_at: Date; direction: string; counterparty: string | null;
    }[]
  >`
    select p.id, p.privacy, p.status, p.amount_wei, p.note, p.tx_hash, p.created_at,
           case when p.from_user_id = ${user.userId} then 'sent' else 'received' end as direction,
           case when p.from_user_id = ${user.userId}
                then coalesce(tu.username, 'unknown')
                else coalesce(fu.username, 'unknown') end as counterparty
    from payments p
    left join users fu on fu.id = p.from_user_id
    left join users tu on tu.id = p.to_user_id
    where p.from_user_id = ${user.userId} or p.to_user_id = ${user.userId}
    order by p.created_at desc
    limit 100
  `;

  return (
    <AuthedShell>
      <>
        <PageHeader
          title="Activity"
          subtitle="Every payment you sent or received. Private payments carry a Private badge; ordinary transfers are labelled Public."
        />
        {rows.length === 0 ? (
          <EmptyState
            title="Nothing here yet"
            body="Once you send or receive a payment it appears here with its real status."
            action={<Link href="/receive" className="btn btn-primary btn-sm">Get paid</Link>}
          />
        ) : (
          <Card>
            <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
              {rows.map((row) => (
                <li key={row.id} className="list-row divide-row">
                  <div className="grow">
                    <div className="row" style={{ gap: 8 }}>
                      <span style={{ fontWeight: 500, fontSize: 14 }}>
                        {row.direction === "sent" ? "To" : "From"} @{row.counterparty}
                      </span>
                      <Badge kind={row.privacy} />
                      <Badge kind={row.status} />
                    </div>
                    <p className="tiny muted" style={{ marginTop: 3 }}>
                      {row.created_at.toISOString().replace("T", " ").slice(0, 16)}
                      {row.note ? ` · ${row.note}` : ""}
                    </p>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <p className="mono" style={{ fontSize: 14 }}>
                      {row.direction === "sent" ? "−" : "+"}
                      {row.amount_wei ? formatWei(BigInt(row.amount_wei)) : "—"} HYPE
                    </p>
                    {row.tx_hash ? (
                      <a className="tiny link" href={explorerTx(row.tx_hash)} target="_blank" rel="noreferrer noopener">
                        Explorer
                      </a>
                    ) : (
                      <span className="tiny muted">No on-chain record yet</span>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        )}
        <p className="tiny muted" style={{ marginTop: 16 }}>
          A private payment has no single public transfer that corresponds to it. Where a transaction hash
          exists it is the deposit into the pool; the withdrawal that pays the recipient is a separate
          transaction the chain cannot connect to it.
        </p>
      </>
    </AuthedShell>
  );
}
