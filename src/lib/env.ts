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
    get clientId() {
      return optional("X_CLIENT_ID");
    },
    get clientSecret() {
      return optional("X_CLIENT_SECRET");
    },
  },
};

/** Reports which credentials are still missing, for the sign-in screen. */
export function providerAvailability() {
  return {
    google: Boolean(env.google.clientId && env.google.clientSecret),
    x: Boolean(env.x.clientId && env.x.clientSecret),
  };
}
