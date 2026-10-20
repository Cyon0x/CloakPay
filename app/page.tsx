import Link from "next/link";
import { redirect } from "next/navigation";
import { TopBar } from "@/components/Nav";
import { HeroBrand } from "@/components/Brand";
import { Icon } from "@/components/Icon";
import { LandingThemeDefault } from "@/components/LandingThemeDefault";
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
    icon: "eyeOff",
    title: "Your username is enough.",
    body: "Send money to another CloakPay user by username. No wallet addresses to copy, share, or expose in the interface.",
  },
  {
    icon: "shieldOff",
    title: "Your payments, kept personal.",
    body: "CloakPay keeps payment details out of its user-facing interface, so you can transact without disclosing wallet addresses or transaction hashes on screen.",
  },
  {
    icon: "incognito",
    title: "Privacy beyond the payment.",
    body: "Keep the record you need without unnecessary technical details.",
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

const FAQ = [
  {
    title: "Do I need a wallet address?",
    body: "No. You pay another CloakPay user by typing their username. The address behind the username stays out of the conversation.",
  },
  {
    title: "What stays private?",
    body: "The link between a username and a wallet address is kept private. The settlement itself still happens on a public test network.",
  },
  {
    title: "How do I sign in?",
    body: "Use Google or X. There is no password to create, store or forget.",
  },
  {
    title: "Has CloakPay been audited?",
    body: "No. CloakPay runs on Elysium Testnet and has not been audited. Do not use it to move value you cannot afford to lose.",
  },
];

/**
 * The landing page opens on the dark presentation in the product artwork.
 * The document bootstrap follows the system preference when no theme has been
 * chosen; this landing-only fallback makes that first visit dark, while still
 * leaving an explicit light or dark choice untouched on every route.
 */
const LANDING_THEME_BOOTSTRAP = `(function(){try{var k="cloakpay.theme";var s=localStorage.getItem(k);if(s!=="light"&&s!=="dark"){s="dark";localStorage.setItem(k,s)}var r=document.documentElement;r.dataset.theme=s;r.style.colorScheme=s}catch(e){var r=document.documentElement;r.dataset.theme="dark";r.style.colorScheme="dark"}})();`;

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

function AdvantageIcon({ name }: { name: string }) {
  if (name === "eyeOff") return <Icon name="eyeOff" size={20} strokeWidth={1.65} />;
  if (name === "shieldOff") {
    return (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M12 3.4 5.4 6v5.6c0 4.2 2.8 7.3 6.6 9 3.8-1.7 6.6-4.8 6.6-9V6z" />
        <path d="M4.4 4.4 19.6 19.6" />
      </svg>
    );
  }
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3.2 13.1h17.6" />
      <path d="M6.5 13.1 8.3 8.2h7.4l1.8 4.9" />
      <circle cx="7.7" cy="16.8" r="2.4" />
      <circle cx="16.3" cy="16.8" r="2.4" />
      <path d="M10.1 16.8h3.8" />
      <path d="M5.3 16.8 3.8 15.4" />
      <path d="M18.7 16.8 20.2 15.4" />
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
      <LandingThemeDefault />
      <script dangerouslySetInnerHTML={{ __html: LANDING_THEME_BOOTSTRAP }} />
      <TopBar user={user} landingNav />
      <main id="main" className="app-body landing-main">
        <section className="lp-hero" aria-labelledby="hero-heading">
          <div className="lp-hero-light" aria-hidden="true" />
          <HeroWaves />
          <div className="shell lp-hero-grid">
            <div className="lp-hero-brand-wrap">
              <HeroBrand />
            </div>

            <div className="lp-hero-copy">
              <h1 id="hero-heading">Your money moves. Your identity stays yours.</h1>
              <p className="lp-lede">
                CloakPay is a privacy-focused way to pay on {activeChain.name}. Sign in with Google or X,
                claim a username, and send money by typing it — no address to copy, share or check.
              </p>
              <div className="lp-actions">
                <Link href="/api/auth/google/start" className="btn btn-primary btn-lg lp-btn-primary">
                  <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
                    <path fill="#4285F4" d="M23.5 12.3c0-.9-.1-1.5-.2-2.2H12v4.1h6.5c-.1 1.1-.8 2.7-2.4 3.8l3.7 2.9c2.2-2 3.7-5 3.7-8.6z" />
                    <path fill="#34A853" d="M12 24c3.2 0 5.9-1.1 7.8-2.9l-3.7-2.9c-1 .7-2.4 1.2-4.1 1.2-3.2 0-5.9-2.1-6.8-5l-3.9 3C3.2 21.3 7.3 24 12 24z" />
                    <path fill="#FBBC05" d="M5.2 14.4A7.4 7.4 0 0 1 4.8 12c0-.8.2-1.7.4-2.4l-3.9-3A12 12 0 0 0 0 12c0 1.9.5 3.8 1.3 5.4l3.9-3z" />
                    <path fill="#EA4335" d="M12 4.8c2.3 0 3.8 1 4.7 1.8l3.4-3.3C18.1 1.3 15.2 0 12 0 7.3 0 3.2 2.7 1.3 6.6l3.9 3C6.1 6.9 8.8 4.8 12 4.8z" />
                  </svg>
                  Sign in
                  <Icon name="arrowRight" size={17} strokeWidth={1.9} />
                </Link>
                <Link href="/api/auth/x/start" className="btn btn-secondary btn-lg lp-btn-secondary lp-x-signin">
                  <Icon name="external" size={16} strokeWidth={1.8} />
                  Sign in with X
                </Link>
                <Link href="/signin" className="btn btn-secondary btn-lg lp-btn-secondary lp-create-account">
                  Create account
                </Link>
                <Link href="#how-it-works" className="lp-text-action">
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
                <p className="eyebrow">The problem</p>
                <h2 id="advantage-heading">Your payment shouldn&apos;t be everyone&apos;s business.</h2>
              </div>
              <p>
                CloakPay keeps the part people share — a username — separate from the technical details
                that do not need to enter the conversation.
              </p>
            </div>

            <div className="lp-advantage-grid">
              {ADVANTAGES.map((item) => (
                <article className="lp-advantage-card" key={item.title}>
                  <div className="lp-card-top">
                    <span className="lp-card-icon">
                      <AdvantageIcon name={item.icon} />
                    </span>
                  </div>
                  <h3>{item.title}</h3>
                  <p>{item.body}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="how-it-works" className="section landing-section anchor-target">
          <div className="shell">
            <div className="section-intro">
              <p className="eyebrow">How it works</p>
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

        <section id="security" className="section landing-section anchor-target">
          <div className="shell">
            <div className="section-intro">
              <p className="eyebrow">Security</p>
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

        <section id="faq" className="section landing-section anchor-target">
          <div className="shell">
            <div className="section-intro">
              <p className="eyebrow">FAQ</p>
              <h2>Questions, answered.</h2>
            </div>
            <div className="grid-2" style={{ marginTop: 28 }}>
              {FAQ.map((item) => (
                <article key={item.title} className="card-flat feature">
                  <h3>{item.title}</h3>
                  <p>{item.body}</p>
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
