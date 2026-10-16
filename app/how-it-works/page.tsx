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
 * `docs/PRIVACY_PROTOCOL.md` and `docs/ARCHITECTURE.md` alongside the rest of
 * the engineering, not in front of someone deciding whether to send a payment.
 * What a user needs here is the five things they will actually do, why a
 * CloakPay payment is a private one, and what is still on the way.
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
    body: `On the Send page, type the other person's CloakPay username and an amount, review the details, and confirm with your passphrase. Their wallet address is never shown to you, and yours is never shown to them. The payment settles in ${activeChain.nativeToken.symbol} and the recipient is credited once the network confirms it.`,
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
            CloakPay is a privacy-focused way to pay. You sign in, claim a username, and pay other CloakPay
            users by typing it — a payment between two CloakPay users is a private payment, and no wallet
            address changes hands in either direction.
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
            <h2 style={{ fontSize: 17 }}>On the way</h2>
            <ul
              className="stack-sm"
              style={{ marginTop: 10, paddingLeft: 18, fontSize: 14, color: "var(--color-slate-700)" }}
            >
              <li>
                <strong>External transfer — coming soon.</strong> Paying out to a wallet that is not a
                CloakPay account.
              </li>
              <li>
                <strong>Swap — coming soon.</strong> Exchange between assets inside CloakPay.
              </li>
            </ul>
            <p className="muted" style={{ marginTop: 12, fontSize: 14 }}>
              A payment settles on {activeChain.name}, a public test network, so the two addresses and the
              amount remain visible on chain — what CloakPay keeps to itself is the link between a username
              and an address. The amounts have no monetary value.
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
