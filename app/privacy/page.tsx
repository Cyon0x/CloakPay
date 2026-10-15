import Link from "next/link";
import { TopBar } from "@/components/Nav";
import { PrivacyPoolPanel } from "@/components/PrivacyPoolPanel";
import { Badge, Card, Notice } from "@/components/ui";
import { Icon } from "@/components/Icon";
import { db } from "@/lib/db";
import { currentUser } from "@/lib/session";
import { activeChain, explorerAddress } from "@/config/chain";
import {
  DENOMINATIONS,
  getPoolDeployment,
  poolStatus,
  poolStatusSentence,
} from "@/config/pool";
import { HIDDEN, NEVER, USERNAME_IS_NOT_PRIVACY, VISIBLE } from "@/config/privacy";

export const metadata = { title: "Privacy" };
export const dynamic = "force-dynamic";

interface NoteCounts {
  unspent: number;
  spending: number;
  spent: number;
}

/**
 * The privacy section.
 *
 * Private notes and the pool's denominations used to sit on the dashboard,
 * where they read as live figures even though the pool is not running. They
 * live here now, labelled with the state they are actually in: this page
 * reports what exists and says plainly when something does not.
 */
export default async function PrivacyPage() {
  const user = await currentUser();
  const status = poolStatus(activeChain.chainId);
  const deployment = getPoolDeployment(activeChain.chainId);

  let notes: NoteCounts | null = null;
  let walletAddress: string | null = null;
  if (user) {
    const [row] = await db()<NoteCounts[]>`
      select
        count(*) filter (where status = 'unspent')::int as unspent,
        count(*) filter (where status = 'spending')::int as spending,
        count(*) filter (where status = 'spent')::int as spent
      from shielded_notes where user_id = ${user.userId} and chain_id = ${activeChain.chainId}
    `;
    notes = row ?? { unspent: 0, spending: 0, spent: 0 };

    const [wallet] = await db()<{ address: string }[]>`
      select address from wallets where user_id = ${user.userId}
    `;
    walletAddress = wallet?.address ?? null;
  }

  return (
    <div className="app-shell">
      <TopBar user={user} />
      <main id="main" className="app-body">
        <div className="shell page">
          <div className="page-header">
            <div>
              <h1 className="page-title">Privacy</h1>
              <p className="page-subtitle">
                What the shielded pool hides, what it does not, and where this feature currently stands.
              </p>
            </div>
          </div>

          <div className="stack">
            <Card>
              <div style={{ padding: 22 }}>
                <div className="row-between">
                  <p className="table-head">Shielded pool</p>
                  <Badge
                    kind={status === "ready" ? "private" : status === "in-development" ? "pending" : "setup"}
                  >
                    {status === "ready" ? "Live" : status === "in-development" ? "In development" : "Not deployed"}
                  </Badge>
                </div>
                <p className="muted" style={{ marginTop: 10, fontSize: 14 }}>
                  {poolStatusSentence(activeChain.chainId)}
                </p>
                {deployment ? (
                  <dl className="kv" style={{ marginTop: 14 }}>
                    <dt>Pool</dt>
                    <dd className="mono" style={{ wordBreak: "break-all" }}>
                      {deployment.pool}
                    </dd>
                    <dt>Verifier</dt>
                    <dd className="mono" style={{ wordBreak: "break-all" }}>
                      {deployment.verifier}
                    </dd>
                    <dt>Chain</dt>
                    <dd className="mono">{deployment.chainId}</dd>
                    <dt>Explorer</dt>
                    <dd>
                      <a
                        className="link tiny"
                        href={explorerAddress(deployment.pool)}
                        target="_blank"
                        rel="noreferrer noopener"
                      >
                        View the contract
                      </a>
                    </dd>
                  </dl>
                ) : null}
                {status !== "ready" ? (
                  <p className="tiny muted" style={{ marginTop: 12 }}>
                    Every payment you make today is a direct transfer and is labelled Public, on this page and
                    everywhere else.
                  </p>
                ) : null}
              </div>
            </Card>

            {/* The pool itself, once a deployment is recorded. The panel derives
                every figure it shows from the pool's own events and the chain's
                nullifier set, so nothing below is a cached number. */}
            {deployment ? (
              <PrivacyPoolPanel
                denominations={DENOMINATIONS.map((denomination) => ({
                  id: denomination.id,
                  label: denomination.label,
                  wei: denomination.wei.toString(),
                }))}
                symbol={activeChain.nativeToken.symbol}
                walletAddress={walletAddress}
              />
            ) : null}

            <div className="grid-3">
              <Card>
                <div style={{ padding: 20 }}>
                  <p className="table-head">Private notes held</p>
                  <p className="stat-value mono" style={{ marginTop: 10 }}>
                    {notes ? notes.unspent : "—"}
                  </p>
                  <p className="tiny muted" style={{ marginTop: 8 }}>
                    {notes
                      ? notes.unspent > 0
                        ? "Each one is a bearer note. Whoever can produce the proof can spend it, so claim them rather than leaving them. This count is what CloakPay has recorded; the shielded balance above is what the pool itself agrees is spendable."
                        : "No unspent notes. Nothing is waiting to be claimed."
                      : "Sign in to see the notes addressed to your viewing key."}
                  </p>
                  {notes && (notes.spending > 0 || notes.spent > 0) ? (
                    <p className="tiny muted" style={{ marginTop: 8 }}>
                      {notes.spending} in progress · {notes.spent} already spent
                    </p>
                  ) : null}
                </div>
              </Card>

              <Card>
                <div style={{ padding: 20 }}>
                  <p className="table-head">Shielded denominations</p>
                  <ul className="stack-sm" style={{ marginTop: 12, listStyle: "none", padding: 0 }}>
                    {DENOMINATIONS.map((denomination) => (
                      <li key={denomination.id} className="row" style={{ gap: 8 }}>
                        <span className="badge badge-private">
                          <span className="dot" aria-hidden="true" />
                          {denomination.label}
                        </span>
                      </li>
                    ))}
                  </ul>
                  <p className="tiny muted" style={{ marginTop: 10 }}>
                    Fixed sizes are what make an anonymity set mean something: every note of a given size is
                    interchangeable, so a withdrawal cannot be narrowed down by comparing amounts.
                  </p>
                </div>
              </Card>

              <Card>
                <div style={{ padding: 20 }}>
                  <p className="table-head">Your viewing key</p>
                  <p className="tiny muted" style={{ marginTop: 10 }}>
                    {user
                      ? "Registered during onboarding. Payers seal notes to its public half; only your device holds the private half."
                      : "Created during onboarding. It lets other people send you a private payment without learning anything they should not."}
                  </p>
                  <Link href="/receive" className="btn btn-secondary btn-sm" style={{ marginTop: 14 }}>
                    Receiving details
                    <Icon name="arrowRight" size={14} />
                  </Link>
                </div>
              </Card>
            </div>

            <div className="grid-3">
              <Card className="card-flat privacy-col">
                <p className="table-head">Hidden by the pool</p>
                <ul className="stack-sm privacy-list">
                  {HIDDEN.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </Card>
              <Card className="card-flat privacy-col">
                <p className="table-head">Still visible on chain</p>
                <ul className="stack-sm privacy-list">
                  {VISIBLE.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </Card>
              <Card className="card-flat privacy-col">
                <p className="table-head">Never on chain</p>
                <ul className="stack-sm privacy-list">
                  {NEVER.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </Card>
            </div>

            <Notice tone="info" title="A username is not a privacy feature">
              {USERNAME_IS_NOT_PRIVACY} Read the{" "}
              <Link href="/security" className="link">
                threat model
              </Link>{" "}
              for the full list, or the{" "}
              <Link href="/privacy/policy" className="link">
                privacy policy
              </Link>{" "}
              for what CloakPay stores.
            </Notice>
          </div>
        </div>
      </main>
    </div>
  );
}
