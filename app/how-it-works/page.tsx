import Link from "next/link";
import { TopBar } from "@/components/Nav";
import { currentUser } from "@/lib/session";
import { activeChain } from "@/config/chain";

export const metadata = { title: "How it works" };
export const dynamic = "force-dynamic";

/**
 * How it works, for the person using it.
 *
 * This page used to walk through the shielded pool's construction — Poseidon
 * commitments, a Merkle tree, nullifiers and Groth16 proofs. That is a
 * description of how the software is built, and it belongs in
 * `docs/ARCHITECTURE.md` alongside the rest of the engineering, not in front of
 * someone deciding whether to send a payment. What a user needs here is the
 * five things they will actually do, and one honest line about what is not
 * available yet.
 */
const STEPS = [
  {
    title: "Sign in",
    body: "Sign in with Google or X. CloakPay never asks for a password.",
  },
  {
    title: "Choose a username",
    body: "Your username is your payment address. People pay @you, so nobody copies or checks a wallet address.",
  },
  {
    title: "Send a payment",
    body: `On the Send page, type the other person's CloakPay username and an amount, review the details, and confirm with your passphrase. The payment settles in ${activeChain.nativeToken.symbol} and the recipient is credited once the network confirms it.`,
  },
  {
    title: "Get paid",
    body: "Share your username, or create a payment link with an optional amount, expiry and usage limit. The Receive page also shows the address to use for money sent from outside CloakPay.",
  },
  {
    title: "Keep the receipt",
    body: "Every confirmed payment has a receipt naming both usernames with the amount and the time. Download it again whenever you like from your transaction history.",
  },
];

export default async function HowItWorksPage() {
  const user = await currentUser();

  return (
    <div className="app-shell">
      <TopBar user={user} />
      <main id="main" className="app-body">
        <div className="shell" style={{ maxWidth: 760, paddingTop: 48, paddingBottom: 90 }}>
          <h1 style={{ fontSize: 32 }}>How CloakPay works</h1>
          <p className="lede" style={{ marginTop: 14 }}>
            CloakPay is a wallet with a username. You sign in, claim a name, and pay other CloakPay users by
            typing it.
          </p>

          <div className="stack" style={{ marginTop: 32 }}>
            {STEPS.map((step, index) => (
              <section key={step.title} className="card-flat" style={{ padding: 22 }}>
                <p className="mono tiny muted">{String(index + 1).padStart(2, "0")}</p>
                <h2 style={{ fontSize: 17, marginTop: 6 }}>{step.title}</h2>
                <p className="muted" style={{ marginTop: 7, fontSize: 14 }}>
                  {step.body}
                </p>
              </section>
            ))}
          </div>

          <section className="card-quiet" style={{ padding: 22, marginTop: 30 }}>
            <h2 style={{ fontSize: 17 }}>Not available yet</h2>
            <ul
              className="stack-sm"
              style={{ marginTop: 10, paddingLeft: 18, fontSize: 14, color: "var(--color-slate-700)" }}
            >
              <li>Shielded (private) payments — coming soon.</li>
              <li>Sending to a wallet outside CloakPay — coming soon.</li>
            </ul>
            <p className="muted" style={{ marginTop: 12, fontSize: 14 }}>
              A payment today is an ordinary transfer on {activeChain.name}, a public testnet, so it can be
              seen on chain and the amounts have no monetary value.
            </p>
          </section>

          <p style={{ marginTop: 26 }}>
            <Link href="/security" className="link">
              Security and privacy
            </Link>
          </p>
        </div>
      </main>
    </div>
  );
}
