import Link from "next/link";
import { redirect } from "next/navigation";
import { TopBar } from "@/components/Nav";
import { Mark } from "@/components/Brand";
import { Icon } from "@/components/Icon";
import { currentUser } from "@/lib/session";
import { activeChain } from "@/config/chain";

/**
 * The landing page.
 *
 * Written for someone deciding whether to use CloakPay: what it does, the one
 * thing they would actually do with it, and which features are not here yet.
 * The pool's design and the rest of the engineering are in `docs/`, not on this
 * page.
 */
const LIVE = [
  {
    icon: "user",
    title: "Send and receive by username",
    body: "Find people by their CloakPay username and pay them by typing it.",
    href: "/how-it-works",
  },
  {
    icon: "link",
    title: "Payment links and QR codes",
    body: "Create a request and share it as a link or a QR code.",
    href: "/how-it-works",
  },
  {
    icon: "wallet",
    title: "A wallet you actually own",
    body: "Your wallet is created in your browser and sealed with your passphrase.",
    href: "/security",
  },
  {
    icon: "shield",
    title: "Shielded pool \u2014 coming soon",
    body: "Private payments are coming soon.",
    href: "/privacy",
  },
  {
    icon: "external",
    title: "External transfer \u2014 coming soon",
    body: "Sending to a wallet outside CloakPay is coming soon.",
    href: "/receive",
  },
];

const STEPS = [
  { title: "Sign in", body: "Google or X. No password needed." },
  { title: "Pick a username", body: "That is how other people pay you." },
  { title: "Send or request", body: "Pay a username, or share a link anyone can pay." },
  { title: "Keep the receipt", body: "Download a receipt for every confirmed payment." },
];

export default async function LandingPage() {
  const user = await currentUser();
  // Someone who is already signed in belongs in the app. This page's calls to
  // action are "Sign in" and "Create account", which are the wrong thing to
  // show them, and its header would have to render a signed-in nav anyway. The
  // public pages that remain useful while signed in -- how it works, privacy,
  // FAQ, terms -- are deliberately not redirected.
  if (user) redirect("/dashboard");

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
                  How it works
                </Link>
              </div>
              <p className="status-line">
                <span className="dot dot-ok" aria-hidden="true" />
                Live on {activeChain.name}. Send and receive by username.
              </p>
            </div>
          </div>
        </section>

        <section className="section">
          <div className="shell">
            <div className="section-intro">
              <p className="eyebrow">What you can do today</p>
              <h2>Simple payments, by username.</h2>
              <p className="lede">
                Everything you need to send and receive on {activeChain.name}.
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
              <p className="eyebrow">Getting started</p>
              <h2>Four steps to your first payment</h2>
              <p className="lede">
                Shielded payments are still being finished. Everything below works today.
              </p>
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
