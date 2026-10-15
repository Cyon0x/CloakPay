import type { Metadata, Viewport } from "next";
import "./globals.css";

/**
 * Copy shown to search engines and link previews says the same thing the page
 * does. The shielded pool is deployed to Elysium testnet, verified there, and
 * the deposit, transfer and withdrawal flow runs against it, so a private
 * payment can be described as something the app offers -- on testnet, and with
 * no audit behind it, which the description also has to say.
 */
export const metadata: Metadata = {
  title: {
    default: "CloakPay · payments by username on Elysium",
    template: "%s · CloakPay",
  },
  description:
    "Pay someone by username instead of a wallet address, on Elysium. Private payments settle through a shielded pool on testnet. Unaudited.",
  applicationName: "CloakPay",
  metadataBase: new URL(process.env.APP_URL ?? "http://localhost:3200"),
  openGraph: {
    title: "CloakPay",
    description:
      "Pay someone by username instead of a wallet address, on Elysium. Sign in with Google or X and there is no address to copy.",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "CloakPay",
    description: "Pay someone by username instead of a wallet address, on Elysium.",
  },
  icons: {
    icon: [{ url: "/icon.png", type: "image/png" }],
    apple: [{ url: "/apple-icon.png" }],
  },
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "CloakPay", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  // Both values ship, so the browser chrome matches the theme the bootstrap
  // script picks before React is running.
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#faf9f7" },
    { media: "(prefers-color-scheme: dark)", color: "#0b0d10" },
  ],
  colorScheme: "light dark",
  width: "device-width",
  initialScale: 1,
};

/**
 * Chooses the theme before the first paint.
 *
 * This is deliberately a blocking inline script in the head rather than an
 * effect: anything that runs after paint shows the wrong theme first. It reads
 * the stored choice, falls back to the operating system preference, and writes
 * the result to `data-theme`, which is the single source of truth the stylesheet
 * and the toggle both read.
 */
const THEME_BOOTSTRAP = `(function(){try{var s=localStorage.getItem("cloakpay.theme");var t=(s==="light"||s==="dark")?s:(window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light");var r=document.documentElement;r.dataset.theme=t;r.style.colorScheme=t;}catch(e){document.documentElement.dataset.theme="light";}})();`;

/**
 * Captures the browser's install prompt when it is offered.
 *
 * Chrome fires `beforeinstallprompt` early, often before React has hydrated,
 * and the event is single-use: it must be kept somewhere to replay later. Store
 * it, and announce it so the menu can enable its Install action. Nothing here
 * installs anything by itself, and no browser can be made to install an app
 * without its owner agreeing to the prompt.
 */
const INSTALL_BOOTSTRAP = `(function(){try{
window.addEventListener("beforeinstallprompt",function(e){e.preventDefault();window.__cloakpayInstallPrompt=e;window.dispatchEvent(new Event("cloakpay:installable"));});
window.addEventListener("appinstalled",function(){window.__cloakpayInstallPrompt=undefined;});
if("serviceWorker" in navigator){window.addEventListener("load",function(){navigator.serviceWorker.register("/sw.js").catch(function(){});});}
}catch(e){}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // The bootstrap script writes to <html> before React hydrates, so the
    // server markup and the live DOM differ by design.
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOTSTRAP }} />
        <script dangerouslySetInnerHTML={{ __html: INSTALL_BOOTSTRAP }} />
      </head>
      <body>
        <a className="skip-link" href="#main">
          Skip to content
        </a>
        {children}
      </body>
    </html>
  );
}
