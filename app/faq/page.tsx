import Link from "next/link";
import { TopBar } from "@/components/Nav";
import { currentUser } from "@/lib/session";

export const metadata = { title: "FAQ" };

const QA: [string, string][] = [
  ["Do I need a wallet extension?", "No. CloakPay creates an embedded wallet for you when you finish onboarding, and a wallet is only used to deposit and withdraw. Sending a private payment is a proof, not a signature from an extension."],
  ["Can I sign in with an email and password?", "No. Google and X are the only options, by design. There is no password to reset or leak."],
  ["Can I recover my account if I lose my device?", "Yes, if you set a passphrase: your mnemonic is stored as an envelope only your passphrase can open. If you skip the passphrase, the key stays on that device and losing it means losing the wallet. The mnemonic is always shown during onboarding and is the real backup."],
  ["Why do I have to choose a passphrase and not a PIN?", "A six-digit PIN has a million possible values, which is nothing to an attacker who has the envelope. A longer passphrase moves the offline guessing cost into a range where it matters."],
  ["Does the recipient need an account?", "To receive a private payment, yes. The note is sealed to their viewing key, which requires an account. A payment link still works: it sends them through sign-in first."],
  ["Are amounts hidden?", "Within the denomination you choose. The chain sees that a 1 HYPE note moved, not that you sent 1.0 HYPE. Exact amounts would require value commitments and range proofs, which are not implemented."],
  ["What happens if I send a public payment?", "It is an ordinary on-chain transfer and it is labelled Public everywhere in the app. CloakPay never presents it as private."],
  ["Is there a CloakPay token?", "No. There is no token, no sale, and no point system."],
  ["Which chain is this?", "Elysium Testnet, an Arbitrum Orbit chain using HYPE as gas. Test tokens only."],
];

export default async function FaqPage() {
  const user = await currentUser();
  return (
    <div className="app-shell">
      <TopBar user={user} />
      <main id="main" className="app-body">
        <div className="shell" style={{ maxWidth: 780, paddingTop: 48, paddingBottom: 90 }}>
          <h1 style={{ fontSize: 32 }}>Questions people actually ask</h1>
          <div className="stack" style={{ marginTop: 30 }}>
            {QA.map(([question, answer]) => (
              <section key={question} className="card-flat" style={{ padding: 20 }}>
                <h2 style={{ fontSize: 16 }}>{question}</h2>
                <p className="muted" style={{ marginTop: 7, fontSize: 14 }}>{answer}</p>
              </section>
            ))}
          </div>
          <p className="muted tiny" style={{ marginTop: 26 }}>
            Still stuck? The{" "}
            <Link href="/security" className="link">security page</Link> covers the technical detail.
          </p>
        </div>
      </main>
    </div>
  );
}
