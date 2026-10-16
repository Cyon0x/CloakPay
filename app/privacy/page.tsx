import Link from "next/link";
import { TopBar } from "@/components/Nav";
import { ComingSoon } from "@/components/ComingSoon";
import { Badge, Card, Notice } from "@/components/ui";
import { currentUser } from "@/lib/session";
import { activeChain } from "@/config/chain";
import { getPoolDeployment, poolStatusSentence } from "@/config/pool";
import { HIDDEN, NEVER, USERNAME_IS_NOT_PRIVACY, VISIBLE } from "@/config/privacy";

export const metadata = { title: "Privacy" };
export const dynamic = "force-dynamic";

/**
 * The privacy section.
 *
 * The shielded pool is built and working, and CloakPay is not offering it while
 * username-to-username payments are the whole product. So this page no longer
 * operates anything: it explains what the pool does, states plainly that it is
 * paused, and keeps the honest columns about what such a pool hides and what it
 * does not — because that explanation is the part that is still true.
 *
 * Nothing here is interactive and nothing here reports a balance, a note or a
 * key: a paused feature that displays live-looking figures would be the same
 * mistake as offering it.
 */
export default async function PrivacyPage() {
  const user = await currentUser();
  const deployment = getPoolDeployment(activeChain.chainId);

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
                  <Badge kind="pending">Paused</Badge>
                </div>
                <p className="muted" style={{ marginTop: 10, fontSize: 14 }}>
                  {poolStatusSentence(activeChain.chainId)}
                </p>
                <p className="tiny muted" style={{ marginTop: 12 }}>
                  Every payment CloakPay makes today is an ordinary transfer to another CloakPay username, and
                  it is labelled that way — here and everywhere else. Nothing is described as private while the
                  pool is switched off, and no payment is quietly routed through it.
                </p>
              </div>
            </Card>

            <ComingSoon
              title="Shielded Pool"
              icon="shield"
              body="Deposits, private transfers and withdrawals are all paused. There is nothing to operate on this page until the feature returns."
              note={
                deployment
                  ? "The pool contract is still deployed and the notes you hold are untouched. Nothing was deleted and no note was invalidated to switch this off."
                  : "The implementation is still in the repository and nothing was removed to switch this off."
              }
            />

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
              {USERNAME_IS_NOT_PRIVACY} Paying by username keeps the link between a person and their wallet
              inside CloakPay, and it does not make the transfer on chain private — an ordinary transfer is
              still an ordinary transfer. Read the{" "}
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
