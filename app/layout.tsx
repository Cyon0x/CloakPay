import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "CloakPay · private payments on Elysium",
    template: "%s · CloakPay",
  },
  description:
    "Send and receive payments by username, with a shielded pool that keeps the link between payer and recipient off the public chain.",
  applicationName: "CloakPay",
  metadataBase: new URL(process.env.APP_URL ?? "http://localhost:3200"),
  openGraph: {
    title: "CloakPay",
    description:
      "Pay someone by username instead of a wallet address, on Elysium. Simple on the surface, shielded underneath.",
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
};

export const viewport: Viewport = {
  themeColor: "#faf9f7",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <a className="skip-link" href="#main">
          Skip to content
        </a>
        {children}
      </body>
    </html>
  );
}
