import { TopBar } from "@/components/Nav";
import { currentUser } from "@/lib/session";
import { activeChain } from "@/config/chain";

export const metadata = { title: "Security and privacy" };

const THREATS: [string, string][] = [
  ["Account takeover", "Sessions are opaque 256-bit tokens; only a SHA-256 hash is stored. Cookies are HttpOnly, SameSite=Lax, and Secure in production. Sign-out revokes server-side."],
  ["OAuth callback manipulation", "State is generated per attempt, stored server-side, single-use, and expires in ten minutes. PKCE S256 is used with both providers. A mismatched state is rejected as the same error as an unknown one."],
  ["Session theft", "Sessions are revocable and expire after fourteen days. No provider token is retained, so a stolen CloakPay session cannot be replayed against Google or X."],
  ["Username enumeration", "Availability checks are rate limited per IP and answers for reserved and taken names are worded identically in the UI."],
  ["Duplicate payment submission", "Every payment carries a client-generated idempotency key with a unique index, so a retried request returns the original record rather than creating a second one."],
  ["Link replay", "Link usage is incremented under a row lock. One-time links are bound to their first claimant, and a partial unique index allows only one live payment per link."],
  ["Private note theft", "Notes are AEAD-sealed to the recipient's P-256 viewing key. The server stores ciphertext it cannot open, and the viewing key cannot move funds."],
  ["Wallet key compromise", "The mnemonic is generated on the device and never transmitted in the clear. The server holds only an AES-256-GCM envelope keyed by PBKDF2-SHA256 at 600,000 iterations. That envelope is offline-guessable if the passphrase is weak, which is why a passphrase rather than a short PIN is required."],
  ["Double spending a note", "The nullifier is the guard and it lives in the contract. A second withdrawal with the same nullifier reverts, whether or not the frontend cooperates."],
  ["Invalid proof or wrong public inputs", "The verifier is the authority. Recipient, relayer, fee and root are public inputs, so altering any of them invalidates the proof. This is covered by tests."],
  ["Incorrect token accounting", "One tree per denomination, and the contract can only ever pay out the denomination whose tree accepted the note's root. A test asserts the pool never owes more than it holds."],
  ["RPC interference", "A malicious RPC can withhold data or lie about state, but it cannot forge a proof or move funds. Deployments can point at another Elysium RPC endpoint."],
  ["Metadata leakage", "Notifications deliberately omit amounts. Note secrets are kept out of URLs, logs, and analytics. The backend does learn which account is being paid, because it routes the payment."],
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
            What CloakPay defends against, and what it does not. The list below is the threat model; it is
            the same one the tests exercise.
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
              <li>Not audited. No independent review has happened, and nothing here should be treated as production-grade.</li>
              <li>The trusted setup was generated locally for development. A real deployment needs a multi-party ceremony.</li>
              <li>Notes are bearer instruments; the recipient should claim promptly.</li>
              <li>Amounts are hidden only within the fixed denomination set, and only as well as the number of outstanding notes allows.</li>
              <li>Running on {activeChain.name}, which is a testnet. Its sequencer is centralised.</li>
              <li>The passphrase protecting a backed-up wallet is the weakest link; a short or reused one can be attacked offline.</li>
            </ul>
          </section>
        </div>
      </main>
    </div>
  );
}
