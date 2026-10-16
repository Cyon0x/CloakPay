import { TopBar } from "@/components/Nav";
import { currentUser } from "@/lib/session";

export const metadata = { title: "Privacy policy" };

const SECTIONS: [string, string][] = [
  ["What we store", "Your Google or X account identifier (never your handle as the primary key), your username, a display name and avatar if you provide them, wallet metadata including your public address, the encrypted envelope holding your wallet secrets, the public half of your viewing key, payment records, payment links, sealed note ciphertexts, notifications, and an operational audit log."],
  ["What we cannot read", "Your mnemonic, your wallet private key, your viewing private key, and the contents of any note. These are encrypted on your device. We hold ciphertext and a public key."],
  ["What we never store", "Passwords, provider access or refresh tokens, note secrets in plaintext, private keys in plaintext, and your database credentials in the client bundle."],
  ["Provider tokens", "Google and X access tokens are used once, to read your account identifier and profile, and then discarded. CloakPay does not keep them and cannot act on your behalf at those providers."],
  ["What the blockchain records", "Every payment CloakPay makes today is an ordinary transfer: the chain records the two addresses involved, the amount, and the time. It does not record a username, and it does not record who the addresses belong to. If the shielded pool is switched back on, its deposits and withdrawals would record a fixed denomination, the addresses involved and a spent nullifier instead of an exact amount."],
  ["What the backend can infer", "Because CloakPay routes a payment to a recipient account, the backend knows which account you are paying and when, and it holds the link between a username and an address. That link is not published: no page in the app and no receipt prints an address. It cannot read your mnemonic, your private key or a note's contents."],
  ["Analytics and logs", "No third-party analytics run on CloakPay. Server logs record the request path and status, never note secrets, tokens, or database credentials."],
  ["Deleting your data", "Deleting your account removes your rows, including your wallet envelope. If you did not write down your mnemonic, deletion means the wallet is unrecoverable. On-chain history cannot be deleted by anyone."],
  ["Contact", "This is a testnet project under active development. Do not treat it as a regulated financial service."],
];

export default async function PrivacyPage() {
  const user = await currentUser();
  return (
    <div className="app-shell">
      <TopBar user={user} />
      <main id="main" className="app-body">
        <div className="shell" style={{ maxWidth: 760, paddingTop: 48, paddingBottom: 90 }}>
          <h1 style={{ fontSize: 32 }}>Privacy policy</h1>
          <p className="lede" style={{ marginTop: 12 }}>
            Written to be read. Last updated on the build date of this deployment.
          </p>
          <div className="stack" style={{ marginTop: 30 }}>
            {SECTIONS.map(([heading, body]) => (
              <section key={heading}>
                <h2 style={{ fontSize: 16 }}>{heading}</h2>
                <p className="muted" style={{ marginTop: 6, fontSize: 14 }}>{body}</p>
              </section>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
