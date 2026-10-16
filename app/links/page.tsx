import Link from "next/link";
import { AuthedShell } from "@/components/AuthedShell";
import { Badge, Card, EmptyState, PageHeader, Stat } from "@/components/ui";
import { Icon } from "@/components/Icon";
import { LinkActions } from "@/components/LinkActions";
import { db } from "@/lib/db";
import { currentUserOrRedirect } from "@/lib/session";
import { env } from "@/lib/env";
import { formatWei } from "@/lib/format";

export const metadata = { title: "Payment links" };
export const dynamic = "force-dynamic";

export default async function LinksPage() {
  const user = await currentUserOrRedirect();

  const links = await db()<
    {
      code: string;
      title: string | null;
      amount_wei: string | null;
      mode: string;
      reusable: boolean;
      max_uses: number | null;
      uses: number;
      expires_at: Date | null;
      status: string;
      paid_count: number;
    }[]
  >`
    select l.code, l.title, l.amount_wei, l.mode, l.reusable, l.max_uses, l.uses, l.expires_at, l.status,
           (select count(*)::int from payments p where p.link_id = l.id and p.status = 'confirmed') as paid_count
    from payment_links l
    where l.owner_user_id = ${user.userId}
    order by l.created_at desc
    limit 50
  `;

  const active = links.filter((link) => link.status === "active").length;
  const settled = links.reduce((total, link) => total + link.paid_count, 0);

  return (
    <AuthedShell>
      <PageHeader
        title="Payment links"
        subtitle="A link is a request with a rule set. Share it anywhere; the payer signs in only when they pay."
        actions={
          <Link href="/links/new" className="btn btn-primary btn-sm">
            <Icon name="plus" size={15} />
            New link
          </Link>
        }
      />

      {links.length > 0 ? (
        <div className="grid-3" style={{ marginBottom: 22 }}>
          <Card>
            <Stat label="Links" value={links.length} hint={`${active} active`} />
          </Card>
          <Card>
            <Stat label="Payments settled" value={settled} hint="Confirmed against the chain" />
          </Card>
          <Card>
            <Stat label="Disabled" value={links.length - active} hint="Off, but kept for the record" />
          </Card>
        </div>
      ) : null}

      {links.length === 0 ? (
        <EmptyState
          title="No links yet"
          body="A link is the fastest way to get paid by someone who has never used CloakPay. They get a page, a price and a sign-in prompt."
          action={
            <Link href="/links/new" className="btn btn-primary btn-sm">
              Create your first link
            </Link>
          }
        />
      ) : (
        <div className="stack">
          {links.map((link) => {
            const expired = link.expires_at ? link.expires_at.getTime() < Date.now() : false;
            const exhausted = link.max_uses !== null && link.uses >= link.max_uses;
            const state = link.status !== "active" ? "disabled" : expired ? "expired" : exhausted ? "exhausted" : "active";
            const url = `${env.appUrl}/pay/${link.code}`;
            return (
              <Card key={link.code}>
                <div className="link-row">
                  <div className="grow">
                    <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
                      <span style={{ fontWeight: 500 }}>{link.title ?? `Link ${link.code}`}</span>
                      <Badge
                        kind={
                          state === "active" ? "ok" : state === "expired" || state === "exhausted" ? "failed" : "info"
                        }
                      >
                        {state}
                      </Badge>
                      <Badge kind={link.mode === "private" ? "private" : "public"}>
                        {link.mode === "private" ? "Private" : "Direct transfer"}
                      </Badge>
                    </div>
                    <p className="tiny muted" style={{ marginTop: 4 }}>
                      <span className="mono">/pay/{link.code}</span>
                      {link.amount_wei ? ` · ${formatWei(BigInt(link.amount_wei))} HYPE` : " · payer chooses"}
                      {` · ${link.uses}${link.max_uses === null ? "" : `/${link.max_uses}`} uses`}
                      {link.expires_at
                        ? ` · expires ${link.expires_at.toISOString().slice(0, 10)}`
                        : " · no expiry"}
                    </p>
                  </div>
                  <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
                    <Link href={`/pay/${link.code}`} className="btn btn-secondary btn-sm">
                      Open
                    </Link>
                    <LinkActions code={link.code} url={url} status={link.status} />
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </AuthedShell>
  );
}
