import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { TopBar } from "@/components/Nav";
import { Card, Notice } from "@/components/ui";
import { CheckoutPanel, type CheckoutLink } from "@/components/CheckoutPanel";
import { db } from "@/lib/db";
import { currentUser } from "@/lib/session";
import { activeChain } from "@/config/chain";
import { getPoolDeployment } from "@/config/pool";

export const dynamic = "force-dynamic";

async function loadLink(code: string) {
  const rows = await db()<
    {
      code: string;
      title: string | null;
      description: string | null;
      amount_wei: string | null;
      denomination_id: string | null;
      mode: string;
      reusable: boolean;
      max_uses: number | null;
      uses: number;
      expires_at: Date | null;
      status: string;
      owner_user_id: string;
      username: string | null;
      display_name: string | null;
    }[]
  >`
    select l.code, l.title, l.description, l.amount_wei, l.denomination_id, l.mode, l.reusable,
           l.max_uses, l.uses, l.expires_at, l.status, l.owner_user_id, u.username, u.display_name
    from payment_links l
    join users u on u.id = l.owner_user_id
    where l.code = ${code}
    limit 1
  `;
  return rows[0];
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ code: string }>;
}): Promise<Metadata> {
  const { code } = await params;
  const link = await loadLink(code);
  if (!link) return { title: "Payment link not found" };
  return {
    title: link.title ?? `Pay @${link.username ?? "a CloakPay account"}`,
    description: link.description ?? "A payment request on CloakPay.",
    robots: { index: false },
  };
}

export default async function CheckoutPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const link = await loadLink(code);
  if (!link) notFound();

  const viewer = await currentUser();
  const wallet = viewer
    ? (
        await db()<{ address: string }[]>`
          select address from wallets where user_id = ${viewer.userId}
        `
      )[0]
    : undefined;

  const expired = link.expires_at ? link.expires_at.getTime() < Date.now() : false;
  const exhausted = link.max_uses !== null && link.uses >= link.max_uses;
  const claimable = link.status === "active" && !expired && !exhausted;

  const payload: CheckoutLink = {
    code: link.code,
    title: link.title,
    description: link.description,
    amountWei: link.amount_wei,
    denominationId: link.denomination_id,
    mode: link.mode,
    reusable: link.reusable,
    maxUses: link.max_uses,
    uses: link.uses,
    expiresAt: link.expires_at ? link.expires_at.toISOString() : null,
    claimable,
    reason: expired ? "expired" : exhausted ? "exhausted" : claimable ? null : "disabled",
    recipientUsername: link.username ?? "unknown",
    recipientDisplayName: link.display_name,
  };

  return (
    <div className="app-shell">
      <TopBar user={viewer} />
      <main id="main" className="app-body">
        <div className="shell" style={{ maxWidth: 560, paddingTop: 40, paddingBottom: 90 }}>
          <p className="table-head" style={{ marginBottom: 12 }}>
            Payment request
          </p>
          <CheckoutPanel
            link={payload}
            signedIn={Boolean(viewer)}
            isOwner={viewer?.userId === link.owner_user_id}
            walletAddress={wallet?.address ?? null}
            poolDeployed={Boolean(getPoolDeployment(activeChain.chainId))}
            faucetUrl={activeChain.faucetUrl}
          />

          <Card className="card-quiet" style={{ marginTop: 16 }}>
            <div style={{ padding: 20 }}>
              <p className="table-head">Before you pay</p>
              <ul className="stack-sm" style={{ marginTop: 10, paddingLeft: 18, color: "var(--color-slate-700)" }}>
                <li>The link shows only what its owner chose to disclose.</li>
                <li>
                  Your wallet address is never sent to the recipient&apos;s profile. It is visible on chain
                  if the transfer is public, because every transfer is.
                </li>
                <li>The link never contains a key or a spending secret.</li>
              </ul>
            </div>
          </Card>

          <Notice tone="info" title="Testnet">
            {activeChain.name} has no monetary value. Nothing here should be treated as real money.
          </Notice>

          <p className="tiny muted" style={{ marginTop: 18, textAlign: "center" }}>
            <Link href="/how-it-works" className="link">
              How CloakPay handles privacy
            </Link>
          </p>
        </div>
      </main>
    </div>
  );
}
