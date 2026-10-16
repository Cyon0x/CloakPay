import Link from "next/link";
import { TopBar } from "@/components/Nav";
import { Card, Notice } from "@/components/ui";
import { currentUser } from "@/lib/session";
import { activeChain } from "@/config/chain";

export const metadata = { title: "Privacy" };
export const dynamic = "force-dynamic";

/**
 * Privacy, stated for the person paying rather than the person building it.
 *
 * A payment between two CloakPay users is a private payment, because it travels
 * by username and no address or transaction hash is handed over. That is the
 * whole of what this page has to say; how the settlement underneath works is in
 * `docs/PRIVACY_PROTOCOL.md`.
 */
const TODAY = [
  {
    title: "You pay a username",
    body: "The recipient's wallet address never appears on the Send page, in the payment, or on the receipt.",
  },
  {
    title: "The other side never learns your address",
    body: "Not the person you pay, and not the person who pays you. Names are what move between CloakPay accounts.",
  },
  {
    title: "Your address stays your own",
    body: "It lives on your Receive page, for funds arriving from outside CloakPay, and nowhere else in the app.",
  },
  {
    title: "You keep a clear record",
    body: "Every confirmed payment has a downloadable receipt naming both usernames, the amount and the time.",
  },
];

export default async function PrivacyPage() {
  const user = await currentUser();

  return (
    <div className="app-shell">
      <TopBar user={user} />
      <main id="main" className="app-body">
        <div className="shell page">
          <div className="page-header">
            <div>
              <h1 className="page-title">Privacy</h1>
              <p className="page-subtitle">What CloakPay keeps private, and what it does not.</p>
            </div>
          </div>

          <div className="stack">
            <Card>
              <div style={{ padding: 22 }}>
                <p className="table-head">Paying another CloakPay user</p>
                <p className="muted" style={{ marginTop: 10, fontSize: 14 }}>
                  CloakPay is a privacy-focused way to pay. A payment between two CloakPay users is a private
                  payment: it is addressed to a username, and the wallet addresses behind those usernames stay
                  with their owners. That is the whole point — sending money should not mean handing over your
                  financial history.
                </p>
                <div className="grid-2" style={{ marginTop: 18 }}>
                  {TODAY.map((item) => (
                    <div key={item.title}>
                      <p style={{ fontSize: 14, fontWeight: 500 }}>{item.title}</p>
                      <p className="tiny muted" style={{ marginTop: 4 }}>{item.body}</p>
                    </div>
                  ))}
                </div>
              </div>
            </Card>

            <Notice tone="info" title="Who it is being built for">
              People, companies, DAOs and organisations that would rather not make every financial
              interaction public. Payments should work quietly in the background, without turning each one
              into a public statement.
            </Notice>

            <Card className="card-quiet">
              <div style={{ padding: 20 }}>
                <p className="table-head">What CloakPay does not hide</p>
                <p className="tiny muted" style={{ marginTop: 10 }}>
                  A payment still settles on {activeChain.name}, a public test network, so the two addresses
                  involved and the amount remain visible on chain to anyone who looks. What CloakPay keeps to
                  itself is the link between a username and an address, and that is the part that makes a
                  payment here private: no screen in the app shows an address or a transaction hash, and no
                  receipt prints one.
                </p>
                <p className="tiny muted" style={{ marginTop: 10 }}>
                  More detail in the{" "}
                  <Link href="/security" className="link">
                    security notes
                  </Link>{" "}
                  and the{" "}
                  <Link href="/privacy/policy" className="link">
                    privacy policy
                  </Link>
                  .
                </p>
              </div>
            </Card>
          </div>
        </div>
      </main>
    </div>
  );
}
