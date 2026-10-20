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
 * Written for someone deciding whether to use CloakPay: what it is, the problem
 * it exists for, what a user does with it, and what is on the way. The shielded
 * pool's construction -- circuits, commitments, proofs, the contract -- is
 * documented in `docs/PRIVACY_PROTOCOL.md` and `docs/ARCHITECTURE.md`, and none
 * of it belongs on this page.
 */
const PROBLEMS = [
  {
    icon: "wallet",
    title: "Addresses are easy to get wrong",
    body: "Copying a long wallet address by hand is slow, and one mistyped character can send funds into nothing.",
  },
  {
    icon: "shield",
    title: "Every payment is on show",
    body: "A public address carries its history, so anyone who looks can see who was paid, how much and how often.",
  },
  {
    icon: "user",
    title: "It should feel like sending money",
    body: "Paying someone you know should not mean thinking about wallets at all.",
  },
];

const LIVE = [
  {
    icon: "user",
    title: "Private payments between CloakPay users",
    body: "Pay a username. The person you pay never sees your wallet address, and you never see theirs.",
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
    icon: "swap",
    title: "Swap \u2014 coming soon",
    body: "Exchange between assets inside CloakPay.",
    href: null,
  },
  {
    icon: "external",
    title: "External transfer \u2014 coming soon",
    body: "Paying out to a wallet that is not a CloakPay account.",
    href: "/receive",
  },
];

const PRIVACY = [
  {
    icon: "user",
    title: "Names, not addresses",
    body: "You pay @someone. The address behind the name never enters the conversation.",
  },
  {
    icon: "lock",
    title: "Your address stays yours",
    body: "Your receiving address is kept for funds arriving from outside CloakPay. It is not published on your profile, your payments or your receipts.",
  },
  {
    icon: "search",
    title: "Nothing to look up",
    body: "No address to paste, and nothing to go looking for elsewhere. The payment and its receipt tell you everything you need.",
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
                CloakPay is a privacy-focused way to pay on {activeChain.name}. Sign in with Google or X,
                claim a username, and send money by typing it — no address to copy, share or check.
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
              <p className="eyebrow">The problem</p>
              <h2>Blockchain payments are harder — and more public — than they should be.</h2>
            </div>
            <div className="grid-3" style={{ marginTop: 28 }}>
              {PROBLEMS.map((item) => (
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
            <div className="section-intro">
              <p className="eyebrow">What CloakPay does</p>
              <h2>Simple payments, by username.</h2>
              <p className="lede">
                Everything you need to send and receive on {activeChain.name}.
              </p>
            </div>
            <div className="grid-2" style={{ marginTop: 28 }}>
              {LIVE.map((item) =>
                item.href ? (
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
                ) : (
                  // A destination that does not exist yet is a card, not a
                  // link: nothing here should take a click to nowhere.
                  <article key={item.title} className="card-flat feature">
                    <span className="feature-icon">
                      <Icon name={item.icon} size={17} />
                    </span>
                    <h3>{item.title}</h3>
                    <p>{item.body}</p>
                  </article>
                ),
              )}
            </div>
          </div>
        </section>

        <section className="section">
          <div className="shell">
            <div className="section-intro">
              <p className="eyebrow">Privacy</p>
              <h2>Payments that keep to themselves.</h2>
              <p className="lede">
                CloakPay is built for people, companies, DAOs and organisations that would rather not make
                every financial interaction public. A payment between two CloakPay users is a private
                payment: it travels by username, and neither side ever sees the other's wallet address.
                Nothing on screen shows an address or a transaction hash, and nothing printed on a receipt
                does either.
              </p>
            </div>
            <div className="grid-3" style={{ marginTop: 28 }}>
              {PRIVACY.map((item) => (
                <article key={item.title} className="card-flat feature">
                  <span className="feature-icon">
                    <Icon name={item.icon} size={17} />
                  </span>
                  <h3>{item.title}</h3>
                  <p>{item.body}</p>
                </article>
              ))}
            </div>
            <p className="tiny muted" style={{ marginTop: 20 }}>
              A payment still settles on {activeChain.name}, a public test network, so the two addresses and
              the amount remain visible on chain. What CloakPay keeps to itself is the link between a username
              and an address.{" "}
              <Link href="/privacy" className="link">
                More about privacy
              </Link>
            </p>
          </div>
        </section>

        <section className="section">
          <div className="shell">
            <div className="section-intro">
              <p className="eyebrow">Getting started</p>
              <h2>Four steps to your first payment</h2>
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
