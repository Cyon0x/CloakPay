import Link from "next/link";
import { TopBar } from "@/components/Nav";
import { currentUser } from "@/lib/session";

export const metadata = { title: "FAQ" };

const QA: [string, string][] = [
  ["Who is CloakPay for?", "People, companies, DAOs and organisations that would rather not make every financial interaction public. Payments should work quietly in the background rather than turning each one into a public statement."],
  ["Do I need a wallet extension?", "No. CloakPay creates an embedded wallet for you when you finish onboarding, and signing happens inside this browser. You never paste a seed phrase or an address anywhere."],
  ["How do I pay someone?", "Type their CloakPay username on the Send page. There is no address to copy, paste or check \u2014 both sides see usernames, here and on the receipt."],
  ["Can I send funds to a wallet address outside CloakPay?", "That is what External Transfer is for, and it is labelled \u201cComing soon\u201d. Receiving from an outside wallet works now \u2014 the address for that is on the Receive page."],
  ["Can I sign in with an email and password?", "No. Google and X are the only options, by design. There is no password to reset or leak."],
  ["Can I recover my account if I lose my device?", "Yes, if you set a passphrase: your mnemonic is stored in a form only your passphrase can open. If you skip the passphrase, the key stays on that device and losing it means losing the wallet. Write down the mnemonic during onboarding \u2014 it is the real backup."],
  ["Why a passphrase and not a PIN?", "A short PIN is easy to guess offline by anyone who gets hold of your encrypted wallet. A longer passphrase makes that impractical."],
  ["Does the recipient need an account?", "Yes. A payment is addressed to a CloakPay username, and that is what identifies the account. Someone without an account can still be sent a payment link, which takes them through sign-in first."],
  ["Are amounts hidden?", "No. A payment settles on a public test network, so the amount stays visible on chain like any ordinary transfer. What CloakPay keeps to itself is who owns the addresses involved."],
  ["Is my payment private?", "Yes, in the way that matters day to day. A payment between two CloakPay users travels by username: no wallet address is shown to the person you pay, and no address or transaction hash appears on your screen or on the receipt. It is not hidden on chain \u2014 the two addresses and the amount are visible there \u2014 but the person on the other side of the payment never learns yours."],
  ["What is coming soon?", "External Transfer, for paying out to a wallet that is not a CloakPay account, and Swap, for exchanging between assets inside CloakPay. Both are labelled \u201cComing soon\u201d wherever they appear."],
  ["What happens if I send a payment that fails?", "Nothing moves. The receipt is only issued once the network confirms the payment; until then the transaction is shown with the status it really has, and a failure says so."],
  ["Is there a CloakPay token?", "No. There is no token, no sale, and no point system."],
  ["Which network is this?", "Elysium Testnet, using HYPE as gas. Test tokens only."],
];

export default async function FaqPage() {
  const user = await currentUser();
  return (
    <div className="app-shell">
      <TopBar user={user} />
      <main id="main" className="app-body">
        <div className="shell" style={{ maxWidth: 780, paddingTop: 48, paddingBottom: 90 }}>
          <h1 style={{ fontSize: 32 }}>Frequently asked questions</h1>
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
            <Link href="/security" className="link">security page</Link> has more detail.
          </p>
        </div>
      </main>
    </div>
  );
}
