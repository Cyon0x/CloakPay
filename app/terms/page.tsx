import { TopBar } from "@/components/Nav";
import { currentUser } from "@/lib/session";
import { activeChain } from "@/config/chain";

export const metadata = { title: "Terms of service" };

const SECTIONS: [string, string][] = [
  ["Testnet software", `CloakPay runs on ${activeChain.name}. It is experimental, unaudited software. The tokens it handles have no monetary value. Do not send anything you cannot afford to lose.`],
  ["No custody of your wallet", "Your wallet is self-custodial. CloakPay stores an encrypted envelope of your secret material, but it cannot decrypt it, cannot sign on your behalf, and cannot recover your funds if you lose both your passphrase and your mnemonic."],
  ["Your responsibilities", "Keep your mnemonic offline and your passphrase strong and unique. Anyone who obtains an unspent note or your secret material can spend the corresponding funds."],
  ["Paused features", "External transfers and the shielded pool are paused and labelled \u201cComing soon\u201d. Neither can be started from the interface or through the API, and the contracts and circuit code behind them are kept in place for a later release."],
  ["The shielded pool", "If the pool is switched back on, deposits and withdrawals would be made through a smart contract that CloakPay does not control after deployment. A contract defect could result in loss of funds. No audit has been performed."],
  ["Privacy limits", "CloakPay reduces what an observer can learn about a payment; it does not guarantee anonymity. Small anonymity sets, timing, gas payment, and your own behaviour can all reduce privacy."],
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
