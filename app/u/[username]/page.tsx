import { notFound } from "next/navigation";
import Link from "next/link";
import { TopBar } from "@/components/Nav";
import { QrCode } from "@/components/QrCode";
import { CopyField } from "@/components/CopyField";
import { Badge, Card } from "@/components/ui";
import { db } from "@/lib/db";
import { currentUser } from "@/lib/session";
import { env } from "@/lib/env";

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
        <div className="shell" style={{ maxWidth: 560, paddingTop: 44, paddingBottom: 90 }}>
          <Card>
            <div style={{ padding: 24 }}>
              <div className="row" style={{ gap: 14 }}>
                <span className="avatar" style={{ width: 48, height: 48, fontSize: 17 }}>
                  {profile.avatar_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={profile.avatar_url} alt="" />
                  ) : (
                    profile.username.slice(0, 1).toUpperCase()
                  )}
                </span>
                <div>
                  <h1 style={{ fontSize: 21 }}>@{profile.username}</h1>
                  {profile.display_name ? <p className="tiny muted">{profile.display_name}</p> : null}
                </div>
              </div>

              <div className="row" style={{ gap: 8, marginTop: 16 }}>
                <Badge kind="info">Pays by username</Badge>
                <span className="tiny muted">Private payments are paused.</span>
              </div>

              <div style={{ marginTop: 22 }}>
                <CopyField label="Payment link" value={identity} />
              </div>

              <div style={{ marginTop: 22, textAlign: "center" }}>
                <QrCode value={identity} />
                <p className="tiny muted" style={{ marginTop: 10 }}>
                  Scanning opens CloakPay and pre-fills the recipient.
                </p>
              </div>

              <div className="row" style={{ gap: 8, marginTop: 22, justifyContent: "center" }}>
                <Link href={`/send?to=${profile.username}`} className="btn btn-primary">
                  Pay @{profile.username}
                </Link>
              </div>
            </div>
          </Card>
          <p className="tiny muted" style={{ marginTop: 16, textAlign: "center" }}>
            This page shows a payment identity only. No wallet address, email, or account identifier is
            published here.
          </p>
        </div>
      </main>
    </div>
  );
}
