import { TopBar } from "@/components/Nav";
import { currentUser } from "@/lib/session";
import { activeChain } from "@/config/chain";

export const metadata = { title: "Security and privacy" };

/**
 * What CloakPay protects, and what it does not.
 *
 * Written for a user making a decision, so each line says what it means for
 * them rather than how it is implemented. The construction — key derivation,
 * session storage, the pool's circuits — is in `docs/ARCHITECTURE.md`, where it
 * is useful to the people who need it and invisible to everyone else.
 */
const THREATS: [string, string][] = [
  [
    "Account takeover",
    "Sessions are revocable, expire after fourteen days, and are stored in a form that cannot be replayed at Google or X. Signing out ends the session on the server, not just in your browser.",
  ],
  [
    "Sign-in tampering",
    "Every sign-in attempt is verified against the provider before an account is created. An expired, reused or altered response is rejected, and nothing is created.",
  ],
  [
    "Username probing",
    "Usernames are unique, availability checks are rate limited, and the answer for a taken name and a reserved one is worded identically — so a name cannot be discovered by probing.",
  ],
  [
    "Duplicate payments",
    "Every payment carries a key that a repeated tap or a retried request resolves to, so a retry returns the original payment instead of sending a second one.",
  ],
  [
    "Payment link misuse",
    "Usage is counted on the server. A one-time link stops after the first payment, and a link that is disabled or expired cannot be paid.",
  ],
  [
    "Wallet key compromise",
    "Your mnemonic is generated on your device and never sent anywhere in the clear. CloakPay keeps only an encrypted copy, and your passphrase is what opens it — which is why a short or reused passphrase is the weakest link.",
  ],
  [
    "Network interference",
    "A malicious RPC node can withhold data or lie about the state of the chain, but it cannot move your funds or sign for you.",
  ],
  [
    "Notification leakage",
    "Notifications never include an amount, so a locked screen cannot show what you were paid.",
  ],
  [
    "What CloakPay can see",
    "Because CloakPay routes each payment, it knows which account is paying which and when, and it holds the link between a username and an address. That link is never published: no page and no receipt prints an address.",
  ],
];

export const dynamic = "force-dynamic";

export default async function SecurityPage() {
  const user = await currentUser();
  return (
    <div className="app-shell">
      <TopBar user={user} />
      <main id="main" className="app-body">
        <div className="shell" style={{ maxWidth: 820, paddingTop: 48, paddingBottom: 90 }}>
          <h1 style={{ fontSize: 32 }}>Security and privacy</h1>
          <p className="lede" style={{ marginTop: 14 }}>
            What CloakPay protects against, and what it does not.
          </p>
          <dl className="stack" style={{ marginTop: 32 }}>
            {THREATS.map(([threat, mitigation]) => (
              <div key={threat} className="card-flat" style={{ padding: 20 }}>
                <dt style={{ fontWeight: 600, fontSize: 15 }}>{threat}</dt>
                <dd className="muted" style={{ marginTop: 6, fontSize: 14 }}>{mitigation}</dd>
              </div>
            ))}
          </dl>
          <section className="card-quiet" style={{ padding: 22, marginTop: 30 }}>
            <h2 style={{ fontSize: 17 }}>Honest limitations</h2>
            <ul className="stack-sm" style={{ marginTop: 10, paddingLeft: 18, fontSize: 14, color: "var(--color-slate-700)" }}>
              <li>CloakPay has not been independently audited.</li>
              <li>
                It runs on {activeChain.name}, a testnet with no monetary value. The network may be reset and
                balances may be wiped.
              </li>
              <li>
                A payment still settles on chain, so the two addresses and the amount are visible to anyone
                who looks. Keeping a username apart from an address is what CloakPay adds on top, and it is
                the whole of the privacy it offers today.
              </li>
              <li>
                The passphrase protecting your encrypted wallet is the weakest link; a short or reused one can
                be attacked offline.
              </li>
            </ul>
          </section>
        </div>
      </main>
    </div>
  );
}
