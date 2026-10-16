import Link from "next/link";
import { TopBar } from "@/components/Nav";
import { currentUser } from "@/lib/session";

export const metadata = { title: "FAQ" };

const QA: [string, string][] = [
  ["Do I need a wallet extension?", "No. CloakPay creates an embedded wallet for you when you finish onboarding, and signing happens inside this browser. You never paste a seed phrase or an address anywhere."],
  ["How do I pay someone?", "Type their CloakPay username on the Send page. CloakPay resolves the username to the account it belongs to, so there is no address to copy, paste or check. Both sides see usernames, here and on the receipt."],
  ["Can I send funds to a wallet address outside CloakPay?", "Not at the moment. External Transfer is paused and labelled \u201cComing soon\u201d; the sending side of it is switched off. Receiving from an external wallet still works \u2014 the address for that is on the Receive page."],
  ["Can I sign in with an email and password?", "No. Google and X are the only options, by design. There is no password to reset or leak."],
  ["Can I recover my account if I lose my device?", "Yes, if you set a passphrase: your mnemonic is stored as an envelope only your passphrase can open. If you skip the passphrase, the key stays on that device and losing it means losing the wallet. The mnemonic is always shown during onboarding and is the real backup."],
  ["Why do I have to choose a passphrase and not a PIN?", "A six-digit PIN has a million possible values, which is nothing to an attacker who has the envelope. A longer passphrase moves the offline guessing cost into a range where it matters."],
  ["Does the recipient need an account?", "Yes. A payment is addressed to a CloakPay username, and the username is what resolves to the account. Someone without an account can still be sent a payment link, which takes them through sign-in first."],
  ["Are amounts hidden?", "No, not today. Every payment CloakPay makes is an ordinary transfer, so the amount is public on chain. Hiding it is what the shielded pool does \u2014 by moving fixed denominations rather than an exact figure \u2014 and the pool is paused."],
  ["Is my payment private?", "The transfer itself is not. It is visible on chain, like any other transfer. What CloakPay keeps out of public view is the link between a username and an address: you pay a person, not an address."],
  ["What is paused?", "External Transfer and the Shielded Pool. Both are labelled \u201cComing soon\u201d and neither can be started from the interface or by calling the API directly. The contracts, circuits and notes behind them are all intact."],
  ["What happens if I send a payment that fails?", "Nothing moves. The receipt is only issued once the network confirms the payment; until then the transaction is shown with the status it really has, and a failure says so."],
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
