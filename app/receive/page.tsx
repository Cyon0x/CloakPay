import Link from "next/link";
import { AuthedShell } from "@/components/AuthedShell";
import { QrCode } from "@/components/QrCode";
import { CopyField } from "@/components/CopyField";
import { Badge, Card, Notice, PageHeader } from "@/components/ui";
import { db } from "@/lib/db";
import { currentUserOrRedirect } from "@/lib/session";
import { env } from "@/lib/env";
import { activeChain, explorerAddress } from "@/config/chain";
import { poolStatus, poolStatusSentence, privatePaymentsAvailable } from "@/config/pool";

export const metadata = { title: "Receive" };
export const dynamic = "force-dynamic";

export default async function ReceivePage() {
  const user = await currentUserOrRedirect();
  const rows = await db()<{ address: string; viewing_key_id: string | null }[]>`
    select address, viewing_key_id from wallets where user_id = ${user.userId}
  `;
  const wallet = rows[0];
  const identity = `${env.appUrl}/u/${user.username}`;
  const poolLive = poolStatus(activeChain.chainId) === "ready";
  // "Accepting private payments" is only true when both halves exist: a
  // registered viewing key and a pool to route the payment through.
  const acceptingPrivately = privatePaymentsAvailable(activeChain.chainId) && Boolean(wallet?.viewing_key_id);
  const poolSentence = poolStatusSentence(activeChain.chainId);

  return (
    <AuthedShell>
      <>
        <PageHeader
          title="Receive"
          subtitle="Share your username or link. People pay @you; they never need your wallet address."
        />
        <div className="split">
          <Card>
            <div style={{ padding: 24 }}>
              <CopyField label="Your payment link" value={identity} />
              <div style={{ marginTop: 22, textAlign: "center" }}>
                <QrCode value={identity} />
                <p className="tiny muted" style={{ marginTop: 10 }}>
                  Anyone scanning this can pay you, and will be asked to sign in first.
                </p>
              </div>
              <div className="row" style={{ gap: 8, marginTop: 20, justifyContent: "center" }}>
                <Link href="/links" className="btn btn-primary">
                  Create a payment link
                </Link>
              </div>
            </div>
          </Card>

          <div className="stack">
            <Card>
              <div style={{ padding: 20 }}>
                <p className="table-head">Privacy status</p>
                <div style={{ marginTop: 12 }}>
                  <Badge kind={acceptingPrivately ? "private" : "setup"}>
                    {acceptingPrivately ? "Accepting private payments" : "Private payments unavailable"}
                  </Badge>
                </div>
                <p className="tiny muted" style={{ marginTop: 12 }}>
                  {acceptingPrivately
                    ? "Your viewing key is registered and the pool is live. Payers seal notes to your key, and only you can open them."
                    : poolLive
                      ? "Finish onboarding to register a viewing key. Until then nobody can pay you privately."
                      : `${poolSentence} Your viewing key is ready, so private payments switch on the moment the flow ships. Until then everything settles as a direct transfer and is labelled Public.`}
                </p>
              </div>
            </Card>

            <Card>
              <div style={{ padding: 20 }}>
                <p className="table-head">Wallet</p>
                {wallet ? (
                  <>
                    <p className="mono tiny" style={{ marginTop: 10, wordBreak: "break-all" }}>
                      {wallet.address}
                    </p>
                    <a
                      className="tiny link"
                      href={explorerAddress(wallet.address)}
                      target="_blank"
                      rel="noreferrer noopener"
                    >
                      View on the explorer
                    </a>
                    <p className="tiny muted" style={{ marginTop: 10 }}>
                      This is where funds land when you withdraw a private note. It is never shown on your
                      public profile.
                    </p>
                  </>
                ) : (
                  <p className="tiny muted" style={{ marginTop: 10 }}>
                    No wallet on this account yet.
                  </p>
                )}
              </div>
            </Card>

            <Notice tone="info" title="Claim promptly">
              A private payment is a bearer note. Whoever can produce the proof can spend it, so claim
              payments rather than leaving them unspent.
            </Notice>
          </div>
        </div>
      </>
    </AuthedShell>
  );
}
