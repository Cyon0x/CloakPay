import Link from "next/link";
import { TopBar } from "@/components/Nav";
import { Mark, Wordmark } from "@/components/Brand";
import { Icon } from "@/components/Icon";
import { currentUser } from "@/lib/session";
import { activeChain } from "@/config/chain";
import { DENOMINATIONS, poolIsDeployed } from "@/config/pool";

const LIVE = [
  {
    icon: "user",
    title: "Sign in with Google or X",
    body: "Real OAuth with PKCE. No password, no email link, no third provider.",
  },
  {
    icon: "wallet",
    title: "A wallet you actually own",
    body: "Twelve words generated in your browser, sealed with a passphrase. The server stores a ciphertext it cannot open.",
  },
  {
    icon: "send",
    title: "Pay by username",
    body: "Search for @someone, pick an amount, confirm. Nothing to paste, nothing to look up.",
  },
  {
    icon: "link",
    title: "Payment links and QR",
    body: "One URL with an optional price, expiry and usage limit. Anyone can pay it, including people who have never used CloakPay.",
  },
];

const STEPS = [
  { title: "Sign in", body: "Google or X. Those are the only two options and no password is created." },
  { title: "Pick a username", body: "That becomes your payment address. People pay @you, not 0x8f3a…" },
  { title: "Send or request", body: "Pay a username, or publish a link that anyone can settle." },
  { title: "Keep the receipt", body: "Every payment records its real status and links to the transaction that settled it." },
];

export default async function LandingPage() {
  const user = await currentUser();
  const poolLive = poolIsDeployed(activeChain.chainId);

  return (
    <div className="app-shell">
      <TopBar user={user} />
      <main id="main" className="app-body">
        <section className="hero">
          <div className="shell">
            <h1>Pay someone by username, not by wallet address.</h1>
            <p className="lede">
              CloakPay is a payments app on {activeChain.name}. Sign in with Google or X, claim a username,
              and send money by typing it. Behind the simple screen sits a shielded pool designed to keep
              the link between payer and recipient off the public chain.
            </p>
            <div className="hero-actions">
              <Link href="/signin" className="btn btn-primary btn-lg">
                Create an account
              </Link>
              <Link href="/how-it-works" className="btn btn-secondary btn-lg">
                How the privacy works
              </Link>
            </div>
            <p className="status-line">
              <span className={`dot ${poolLive ? "dot-ok" : "dot-warn"}`} aria-hidden="true" />
              {poolLive
                ? `Shielded pool live on ${activeChain.name}. Chain ${activeChain.chainId}, testnet only.`
                : `Wallet, usernames, links and direct transfers are live on ${activeChain.name}. The shielded pool is built and tested but not yet deployed, so private payments are not offered.`}
            </p>
          </div>
        </section>

        <section className="section">
          <div className="shell">
            <div className="row" style={{ gap: 14, marginBottom: 26 }}>
              <Mark size={40} />
              <Wordmark height={16} />
            </div>
            <h2>What you can do today</h2>
            <p className="lede">
              Everything below runs against {activeChain.name} and a real database. No mock data, no
              placeholder buttons.
            </p>
            <div className="grid-2" style={{ marginTop: 26 }}>
              {LIVE.map((item) => (
                <article key={item.title} className="card-flat feature">
                  <span className="feature-icon">
                    <Icon name={item.icon} size={17} />
                  </span>
                  <h3>{item.title}</h3>
                  <p>{item.body}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="section">
          <div className="shell">
            <h2>What is actually private</h2>
            <p className="lede">
              Privacy claims are worthless unless they are precise. This is the design, stated plainly,
              including the parts it does not hide.
            </p>
            <div className="grid-3" style={{ marginTop: 26 }}>
              <div className="card-flat" style={{ padding: 20 }}>
                <p className="table-head">Hidden by the pool</p>
                <ul className="stack-sm" style={{ marginTop: 12, paddingLeft: 18, color: "var(--color-slate-700)" }}>
                  <li>The connection between a payer and a recipient</li>
                  <li>Which deposit funded which withdrawal</li>
                  <li>How many payments one person has received</li>
                  <li>The exact amount, within the pool&apos;s fixed denominations</li>
                </ul>
              </div>
              <div className="card-flat" style={{ padding: 20 }}>
                <p className="table-head">Still visible on chain</p>
                <ul className="stack-sm" style={{ marginTop: 12, paddingLeft: 18, color: "var(--color-slate-700)" }}>
                  <li>That some address deposited a given denomination</li>
                  <li>That some address withdrew a given denomination</li>
                  <li>Timing, and who paid the gas</li>
                  <li>The size of the pool, and therefore the anonymity set</li>
                </ul>
              </div>
              <div className="card-flat" style={{ padding: 20 }}>
                <p className="table-head">Never on chain</p>
                <ul className="stack-sm" style={{ marginTop: 12, paddingLeft: 18, color: "var(--color-slate-700)" }}>
                  <li>Your note secrets, which never leave your device unsealed</li>
                  <li>Your wallet&apos;s private key</li>
                  <li>Your Google or X identity</li>
                </ul>
              </div>
            </div>
            <p className="tiny muted" style={{ marginTop: 18 }}>
              Read the full{" "}
              <Link href="/security" className="link">
                threat model and guarantees
              </Link>
              . Small pools hide less than large ones. That limit is inherent and it is stated here rather
              than glossed over.
            </p>
          </div>
        </section>

        <section className="section">
          <div className="shell">
            <h2>Four steps, and none of them mention a seed phrase</h2>
            <div className="grid-2" style={{ marginTop: 26 }}>
              {STEPS.map((step, index) => (
                <article key={step.title} className="card-flat" style={{ padding: 22 }}>
                  <p className="mono tiny muted">{String(index + 1).padStart(2, "0")}</p>
                  <h3 style={{ fontSize: 17, marginTop: 6 }}>{step.title}</h3>
                  <p className="muted tiny" style={{ marginTop: 6 }}>
                    {step.body}
                  </p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="section">
          <div className="shell">
            <h2>Shielded amounts</h2>
            <p className="lede">
              Deposits are fixed denominations. A fixed set is what makes an anonymity set mean anything:
              every note of a given size is interchangeable, so a withdrawal cannot be narrowed down by
              comparing amounts.
            </p>
            <div className="row" style={{ gap: 10, marginTop: 18, flexWrap: "wrap" }}>
              {DENOMINATIONS.map((denomination) => (
                <span key={denomination.id} className="badge badge-private">
                  <span className="dot" aria-hidden="true" />
                  {denomination.label}
                </span>
              ))}
            </div>
            <p className="tiny muted" style={{ marginTop: 16 }}>
              {poolLive
                ? "These denominations are open for deposits now."
                : "These are the denominations the pool accepts. Deposits open when the contract is deployed."}
            </p>
          </div>
        </section>
      </main>

      <footer className="footnote">
        <div className="shell">
          <div className="footer-links">
            <Link href="/how-it-works">How it works</Link>
            <Link href="/security">Security</Link>
            <Link href="/faq">FAQ</Link>
            <Link href="/privacy">Privacy policy</Link>
            <Link href="/terms">Terms of service</Link>
            <a href={activeChain.explorerUrl} rel="noreferrer noopener" target="_blank">
              Explorer
            </a>
            <a href={activeChain.faucetUrl} rel="noreferrer noopener" target="_blank">
              Faucet
            </a>
          </div>
          <p>
            CloakPay runs on {activeChain.name}. It has not been audited. Do not use it to move value you
            cannot afford to lose.
          </p>
        </div>
      </footer>
    </div>
  );
}
