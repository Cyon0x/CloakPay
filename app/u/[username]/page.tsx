import { notFound } from "next/navigation";
import Link from "next/link";
import { TopBar } from "@/components/Nav";
import { QrCode } from "@/components/QrCode";
import { CopyField } from "@/components/CopyField";
import { Badge } from "@/components/ui";
import { Icon } from "@/components/Icon";
import { db } from "@/lib/db";
import { currentUser } from "@/lib/session";
import { env } from "@/lib/env";
import { activeChain } from "@/config/chain";

export const dynamic = "force-dynamic";

/** The public payment identity: username, display name, and a link people can pay. */
export default async function PublicProfilePage({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const { username } = await params;
  const normalised = username.trim().toLowerCase().replace(/^@/, "");
  if (!/^[a-z0-9_]{3,20}$/.test(normalised)) notFound();

  const viewer = await currentUser();
  const rows = await db()<
    {
      username: string; display_name: string | null; avatar_url: string | null;
      profile_visibility: string; viewing_key_id: string | null;
    }[]
  >`
    select u.username, u.display_name, u.avatar_url, u.profile_visibility, w.viewing_key_id
    from users u left join wallets w on w.user_id = u.id
    where u.username_lower = ${normalised} limit 1
  `;

  const profile = rows[0];
  if (!profile || profile.profile_visibility === "private") notFound();

  const identity = `${env.appUrl}/u/${profile.username}`;

  return (
    <div className="app-shell">
      <TopBar user={viewer} />
      <main id="main" className="app-body">
        <div className="shell public-pay-page">
          <div className="pay-page-head">
            <div>
              <p className="eyebrow">CloakPay payment identity</p>
            </div>
            <Badge kind="info">By username only</Badge>
          </div>

          <div className="pay-identity-grid">
            <section className="pay-identity-card" aria-labelledby="pay-identity-name">
              <div className="pay-identity-top">
                <span className="pay-avatar" aria-hidden="true">
                  {profile.avatar_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={profile.avatar_url} alt="" />
                  ) : (
                    profile.username.slice(0, 1).toUpperCase()
                  )}
                </span>
                <div style={{ minWidth: 0 }}>
                  <p className="pay-eyebrow">Pay this account</p>
                  <h1 id="pay-identity-name" className="pay-name">@{profile.username}</h1>
                  {profile.display_name ? <p className="pay-display-name">{profile.display_name}</p> : null}
                </div>
              </div>

              <div className="pay-methods" aria-label="Payment details">
                <div className="pay-method">
                  <span>Payment method</span>
                  <strong>CloakPay username</strong>
                </div>
                <div className="pay-method">
                  <span>Network</span>
                  <strong>{activeChain.name} · {activeChain.nativeToken.symbol}</strong>
                </div>
              </div>

              <div className="pay-link-block">
                <CopyField label="Payment link" value={identity} />
              </div>

              <div className="pay-cta">
                <Link href={`/send?to=${profile.username}`} className="btn btn-primary">
                  Pay @{profile.username}
                  <Icon name="arrowRight" size={16} strokeWidth={1.9} />
                </Link>
                <Link href="/how-it-works" className="btn btn-secondary">
                  How it works
                </Link>
              </div>

              <p className="pay-private-note">
                <Icon name="shield" size={14} strokeWidth={1.7} />
                <span>
                  Your wallet address is not shown to the recipient. A payment to this username is resolved
                  inside CloakPay.
                </span>
              </p>
            </section>

            <aside className="pay-qr-card" aria-label={`QR code to pay @${profile.username}`}>
              <QrCode value={identity} size={224} />
              <h2 className="pay-qr-title">Scan to pay @{profile.username}</h2>
              <p className="pay-qr-copy">
                Opens this payment identity and pre-fills the recipient. The QR contains this public link
                only.
              </p>
              <Badge kind="public">Username payment</Badge>
            </aside>
          </div>

          <p className="pay-page-note">This page shows a payment identity only — no wallet address.</p>
        </div>
      </main>
    </div>
  );
}
