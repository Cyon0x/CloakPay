import Link from "next/link";
import { redirect } from "next/navigation";
import { TopBar } from "@/components/Nav";
import { Mark } from "@/components/Brand";
import { Icon } from "@/components/Icon";
import { currentUser } from "@/lib/session";
import { activeChain } from "@/config/chain";
import { DENOMINATIONS, poolStatus } from "@/config/pool";
import { HIDDEN, NEVER, VISIBLE } from "@/config/privacy";

/**
 * The landing page.
 *
 * Only features that are actually running appear here. The shielded pool is
 * built, deployed and verified on testnet, but the deposit and withdrawal flow a
 * user would drive is still being built, so it is described as work in progress
 * rather than as a capability, and the status line under the hero buttons says
 * exactly which half is live.
 */
const LIVE = [
  {
    icon: "user",
    title: "Send and receive by username",
    body: "Find people by their CloakPay username and pay them by typing it. No address to copy, nothing to look up.",
    href: "/how-it-works",
  },
  {
    icon: "link",
    title: "Payment links and QR codes",
    body: "Create a request with an optional amount, expiry and usage limit, then share the link or let someone scan it.",
    href: "/how-it-works",
  },
  {
    icon: "wallet",
    title: "A wallet you actually own",
    body: "Twelve words generated in your browser and sealed with your passphrase. The server stores a ciphertext it cannot open.",
    href: "/security",
  },
  {
    icon: "shield",
    title: "Privacy in progress",
    body: "The shielded pool is written, deployed and verified on testnet. The deposit and withdrawal flow is still being built, so private payments are off and every surface says so.",
    href: "/privacy",
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
  // Someone who is already signed in belongs in the app. This page's calls to
  // action are "Sign in" and "Create account", which are the wrong thing to
  // show them, and its header would have to render a signed-in nav anyway. The
  // public pages that remain useful while signed in -- how it works, privacy,
  // FAQ, terms -- are deliberately not redirected.
  if (user) redirect("/dashboard");

  const pool = poolStatus(activeChain.chainId);
  const poolLive = pool === "ready";

  return (
    <div className="app-shell">
      <TopBar user={user} />
      <main id="main" className="app-body">
        <section className="hero">
          <div className="shell hero-inner">
            <div className="hero-mark">
              <Mark size={268} fluid className="hero-mark-img" />
            </div>
            <div className="hero-copy">
              <h1>Pay someone by username, not by wallet address.</h1>
              <p className="lede">
                CloakPay makes sending and receiving payments simpler. Sign in with Google or X, claim a
                username, and send money by typing it.
              </p>
              {/* Both actions open the one sign-in route. A first-time
                  identity is created by the OAuth callback, so "Create account"
                  is the same door with a different welcome — there is no second
                  authentication path to keep in step. */}
              <div className="hero-actions">
                <Link href="/signin" className="btn btn-primary btn-lg">
                  Sign in
                  <Icon name="arrowRight" size={16} strokeWidth={2} />
                </Link>
                <Link href="/signin" className="btn btn-secondary btn-lg">
                  Create account
                </Link>
              </div>
              <div className="hero-actions-secondary">
                <Link href="/how-it-works" className="btn btn-ghost">
                  How the privacy works
                </Link>
              </div>
              <p className="status-line">
                <span className={`dot ${poolLive ? "dot-ok" : "dot-warn"}`} aria-hidden="true" />
                {poolLive
                  ? `Shielded pool live on ${activeChain.name}. Chain ${activeChain.chainId}, testnet only.`
                  : pool === "in-development"
                    ? `Wallets, usernames, payment links and direct transfers are live on ${activeChain.name}. The shielded pool is deployed, but the deposit and withdrawal flow is still being built, so private payments are not offered yet.`
                    : `Wallets, usernames, payment links and direct transfers are live on ${activeChain.name}. The shielded pool is built and tested but not deployed, so private payments are not offered yet.`}
              </p>
            </div>
          </div>
        </section>

        <section className="section">
          <div className="shell">
            <div className="section-intro">
              <p className="eyebrow">What you can do today</p>
              <h2>Simple payments. More privacy.</h2>
              <p className="lede">
                Everything you need to send and receive money on {activeChain.name}, with privacy features
                developed transparently.
              </p>
            </div>
            <div className="grid-2" style={{ marginTop: 28 }}>
              {LIVE.map((item) => (
                <Link key={item.title} href={item.href} className="card-flat feature feature-link">
                  <span className="feature-icon">
                    <Icon name={item.icon} size={17} />
                  </span>
                  <h3>{item.title}</h3>
                  <p>{item.body}</p>
                  <span className="feature-more">
                    Read more
                    <Icon name="arrowRight" size={14} strokeWidth={1.8} />
                  </span>
                </Link>
              ))}
            </div>
          </div>
        </section>

        <section className="section">
          <div className="shell">
            <div className="section-intro">
              <p className="eyebrow">Privacy</p>
              <h2>What is actually private</h2>
              <p className="lede">
                Privacy claims are worthless unless they are precise. This is the design, stated plainly,
                including the parts it does not hide.
              </p>
            </div>
            <div className="grid-3" style={{ marginTop: 28 }}>
              <div className="card-flat privacy-col">
                <p className="table-head">Hidden by the pool</p>
                <ul className="stack-sm privacy-list">
                  {HIDDEN.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
              <div className="card-flat privacy-col">
                <p className="table-head">Still visible on chain</p>
                <ul className="stack-sm privacy-list">
                  {VISIBLE.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
              <div className="card-flat privacy-col">
                <p className="table-head">Never on chain</p>
                <ul className="stack-sm privacy-list">
                  {NEVER.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
            </div>

            <div className="denominations">
              <div>
                <p className="table-head">Shielded amounts</p>
                <p className="tiny muted" style={{ marginTop: 8, maxWidth: "58ch" }}>
                  Deposits are fixed denominations. A fixed set is what makes an anonymity set mean anything:
                  every note of a given size is interchangeable, so a withdrawal cannot be narrowed down by
                  comparing amounts.
                </p>
              </div>
              <div className="denomination-list">
                {DENOMINATIONS.map((denomination) => (
                  <span key={denomination.id} className="badge badge-private">
                    <span className="dot" aria-hidden="true" />
                    {denomination.label}
                  </span>
                ))}
              </div>
            </div>

            <p className="tiny muted" style={{ marginTop: 20 }}>
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
            <div className="section-intro">
              <p className="eyebrow">How it works</p>
              <h2>Four steps, and none of them mention a seed phrase</h2>
            </div>
            <div className="grid-2" style={{ marginTop: 28 }}>
              {STEPS.map((step, index) => (
                <article key={step.title} className="card-flat step">
                  <p className="mono tiny muted">{String(index + 1).padStart(2, "0")}</p>
                  <h3>{step.title}</h3>
                  <p>{step.body}</p>
                </article>
              ))}
            </div>
          </div>
        </section>
      </main>

      <footer className="footnote">
        <div className="shell">
          <div className="footer-links">
            <Link href="/how-it-works">How it works</Link>
            <Link href="/security">Security</Link>
            <Link href="/faq">FAQ</Link>
            <Link href="/privacy/policy">Privacy policy</Link>
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
