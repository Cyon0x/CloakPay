import type { NextConfig } from "next";

const config: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // The development badge sits in the bottom-left corner, exactly where the
  // phone tab bar's Home item is. It is a dev-tools overlay, not product UI, and
  // it makes layout QA read as an overlap that does not exist in production.
  devIndicators: false,
  serverExternalPackages: ["postgres"],
  /**
   * The receipt route draws the CloakPay lockup into the PDF, so that file has
   * to travel with the function. `public/` is served by the CDN on Vercel and
   * is not on a lambda's disk by default.
   */
  outputFileTracingIncludes: {
    "/api/payments/[id]/receipt": ["./public/brand/lockup.png"],
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
          {
            key: "Permissions-Policy",
            value: "camera=(self), geolocation=(), microphone=()",
          },
        ],
      },
    ];
  },
};

export default config;
