/** Server-side environment access. Never imported by a client component. */
function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function optional(name: string, fallback = ""): string {
  return process.env[name] ?? fallback;
}

export const env = {
  get databaseUrl() {
    return required("DATABASE_URL");
  },
  get sessionSecret() {
    return required("SESSION_SECRET");
  },
  get appUrl() {
    return optional("APP_URL", "http://localhost:3200");
  },
  get isProduction() {
    return process.env.NODE_ENV === "production";
  },
  google: {
    get clientId() {
      return optional("GOOGLE_CLIENT_ID");
    },
    get clientSecret() {
      return optional("GOOGLE_CLIENT_SECRET");
    },
  },
  x: {
    /**
     * Which handshake X uses. CloakPay's default is OAuth 1.0a; see
     * `src/lib/auth/oauth1.ts` for why the OAuth 2.0 path is not the one that
     * works. Set `X_OAUTH_VERSION=2` to go back to OAuth 2.0 with PKCE.
     */
    get oauthVersion(): "1" | "2" {
      return process.env.X_OAUTH_VERSION === "2" ? "2" : "1";
    },
    get consumerKey() {
      return optional("X_CONSUMER_KEY");
    },
    get consumerSecret() {
      return optional("X_CONSUMER_SECRET");
    },
    get clientId() {
      return optional("X_CLIENT_ID");
    },
    get clientSecret() {
      return optional("X_CLIENT_SECRET");
    },
  },
};

/**
 * Reports which credentials are still missing, for the sign-in screen.
 *
 * `needs` names the exact pair the selected X handshake reads, so the notice on
 * the sign-in page cannot tell someone to set a variable that flow never uses.
 */
export function providerAvailability() {
  const xOnOAuth1 = env.x.oauthVersion === "1";
  return {
    google: Boolean(env.google.clientId && env.google.clientSecret),
    x: xOnOAuth1
      ? Boolean(env.x.consumerKey && env.x.consumerSecret)
      : Boolean(env.x.clientId && env.x.clientSecret),
    xNeeds: xOnOAuth1 ? "X_CONSUMER_KEY and X_CONSUMER_SECRET" : "X_CLIENT_ID and X_CLIENT_SECRET",
  };
}
