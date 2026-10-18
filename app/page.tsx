import Link from "next/link";
import { redirect } from "next/navigation";
import { TopBar } from "@/components/Nav";
import { HeroBrand } from "@/components/Brand";
import { Icon } from "@/components/Icon";
import { currentUser } from "@/lib/session";
import { activeChain } from "@/config/chain";

/**
 * The public product page.
 *
 * The brand composition leads on wide screens: the official Cloak symbol and
 * the official CLOAKPAY lettering are one centred lockup, not an icon followed
 * by unrelated marketing copy. Every destination below is an existing route or
 * the single sign-in flow; nothing is a decorative control.
 */
const ADVANTAGES = [
  {
    icon: "wallet",
    number: "01",
    title: "An address leaves a trail",
    body: "A wallet address can be watched, linked to a history and followed across a public ledger. Sharing one shares more than a destination.",
  },
  {
    icon: "shield",
    number: "02",
    title: "Copying one is a risk",
    body: "Long strings are slow to check and easy to mistype. One wrong character can send funds somewhere they can never be recovered.",
  },
  {
    icon: "user",
    number: "03",
    title: "Your username is the payment",
    body: "Pay @someone. Their wallet address stays out of the conversation, and every confirmed payment leaves a receipt you can keep.",
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
    icon: "qr",
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
    title: "Swap — coming soon",
    body: "Exchange between assets inside CloakPay.",
    href: null,
  },
  {
    icon: "external",
    title: "External transfer — coming soon",
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

function HeroWaves() {
  return (
    <svg
      className="lp-waves"
      viewBox="0 0 1440 760"
      fill="none"
      preserveAspectRatio="none"
      aria-hidden="true"
      focusable="false"
    >
      <g className="lp-wave-lines">
        <path d="M-120 574C132 526 242 412 478 420c236 8 305 126 524 98 188-24 272-126 558-78" />
        <path d="M-140 610C120 558 258 454 486 462c228 8 311 116 526 90 182-22 290-114 568-64" />
        <path d="M-110 648C150 602 272 504 500 510c228 6 310 106 512 84 198-22 302-104 574-52" />
        <path d="M-90 688C154 650 300 558 514 566c214 8 302 96 498 76 204-20 316-96 566-42" />
      </g>
      <g className="lp-wave-arcs">
        <path d="M1085 726c118-158 292-192 455-138" />
        <path d="M1124 746c114-132 268-160 416-112" />
        <path d="M1044 704c118-180 304-222 486-166" />
      </g>
    </svg>
  );
}

export default async function LandingPage() {
  const user = await currentUser();
  // Signed-in visitors belong in the app. The public editorial pages stay
  // available on their own routes, as they always have.
  if (user) redirect("/dashboard");

  return (
    <div className="app-shell landing-shell">
      <TopBar user={user} />
      <main id="main" className="app-body landing-main">
        <section className="lp-hero" aria-labelledby="hero-heading">
          <div className="lp-hero-light" aria-hidden="true" />
          <HeroWaves />
          <div className="shell lp-hero-grid">
            <div className="lp-hero-brand-wrap">
              <HeroBrand />
            </div>

            <div className="lp-hero-copy">
              <p className="lp-kicker">
                <span className="lp-kicker-line" aria-hidden="true" />
                Payments, without the address
              </p>
              <h1 id="hero-heading">Pay someone by username, not by wallet address.</h1>
              <p className="lp-lede">
                CloakPay is a privacy-focused way to pay on {activeChain.name}. Sign in with Google or X,
                claim a username, and send money by typing it — no address to copy, share or check, and no
                wallet address exposed in the conversation.
              </p>
              <div className="lp-actions">
                <Link href="/signin" className="btn btn-primary btn-lg lp-btn-primary">
                  Sign in
                  <Icon name="arrowRight" size={17} strokeWidth={1.9} />
                </Link>
                <Link href="/signin" className="btn btn-secondary btn-lg lp-btn-secondary">
                  Create account
                </Link>
                <Link href="/how-it-works" className="lp-text-action">
                  How it works
                  <Icon name="chevronRight" size={14} strokeWidth={1.8} />
                </Link>
              </div>
              <p className="lp-status">
                <span className="dot dot-ok" aria-hidden="true" />
                <span>
                  <strong>Live on {activeChain.name}.</strong> Send and receive by username.
                </span>
              </p>
            </div>
          </div>
        </section>

        <section className="lp-advantage" aria-labelledby="advantage-heading">
          <div className="shell">
            <div className="lp-section-head">
              <div>
                <p className="eyebrow">The advantage</p>
                <h2 id="advantage-heading">Privacy begins before the payment is sent.</h2>
              </div>
              <p>
                CloakPay removes the wallet address from the part of a payment people actually share: the
                name of the person being paid.
              </p>
            </div>

            <div className="lp-advantage-grid">
              {ADVANTAGES.map((item) => (
                <article className="lp-advantage-card" key={item.title}>
                  <div className="lp-card-top">
                    <span className="lp-card-icon">
                      <Icon name={item.icon} size={19} strokeWidth={1.65} />
                    </span>
                    <span className="lp-card-number mono">{item.number}</span>
                  </div>
                  <h3>{item.title}</h3>
                  <p>{item.body}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="section landing-section">
          <div className="shell">
            <div className="section-intro">
              <p className="eyebrow">What CloakPay does</p>
              <h2>Simple payments, by username.</h2>
              <p className="lede">Everything you need to send and receive on {activeChain.name}.</p>
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

        <section className="section landing-section">
          <div className="shell">
            <div className="section-intro">
              <p className="eyebrow">Privacy</p>
              <h2>Payments that keep to themselves.</h2>
              <p className="lede">
                CloakPay is built for people, companies, DAOs and organisations that would rather not make
                every financial interaction public. A payment between two CloakPay users travels by
                username, and neither side ever sees the other&apos;s wallet address. Nothing on screen
                shows an address or a transaction hash, and nothing printed on a receipt does either.
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
              the amount remain visible on chain. What CloakPay keeps to itself is the link between a
              username and an address.{" "}
              <Link href="/privacy" className="link">
                More about privacy
              </Link>
            </p>
          </div>
        </section>

        <section className="section landing-section">
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

      <footer className="footnote landing-footer">
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
