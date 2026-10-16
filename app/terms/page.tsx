import { TopBar } from "@/components/Nav";
import { currentUser } from "@/lib/session";
import { activeChain } from "@/config/chain";

export const metadata = { title: "Terms of service" };

const SECTIONS: [string, string][] = [
  ["Testnet software", `CloakPay runs on ${activeChain.name}. It is experimental, unaudited software. The tokens it handles have no monetary value. Do not send anything you cannot afford to lose.`],
  ["No custody of your wallet", "Your wallet is self-custodial. CloakPay stores an encrypted copy of your secret material, but it cannot open it, cannot sign on your behalf, and cannot recover your funds if you lose both your passphrase and your mnemonic."],
  ["Your responsibilities", "Keep your mnemonic offline and your passphrase strong and unique. Anyone who obtains them can spend your funds."],
  ["Coming soon", "External transfers and the shielded pool are not available yet. Neither can be started from the interface or through the API. When the shielded pool is offered, private payments will be handled by a smart contract, and a defect in it could cause loss of funds."],
  ["Privacy limits", "CloakPay does not guarantee anonymity. A payment made today is an ordinary transfer on a public testnet and can be seen on chain."],
  ["Acceptable use", "Do not use CloakPay to break the law, to evade lawful obligations, or to move funds you do not own. You are responsible for complying with the rules that apply to you."],
  ["Availability", "The service may be unavailable, the testnet may be reset, and balances may be wiped by the network. No warranty is given of any kind."],
  ["Changes", "These terms may change as the project develops. Continued use after a change means you accept it."],
];

export default async function TermsPage() {
  const user = await currentUser();
  return (
    <div className="app-shell">
      <TopBar user={user} />
      <main id="main" className="app-body">
        <div className="shell" style={{ maxWidth: 760, paddingTop: 48, paddingBottom: 90 }}>
          <h1 style={{ fontSize: 32 }}>Terms of service</h1>
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
