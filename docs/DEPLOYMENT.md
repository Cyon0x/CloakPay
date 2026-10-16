# Deployment

Everything here assumes `APP_URL` is set to the exact origin you will serve from.
OAuth providers match redirect URIs as literal strings, including the port, so
`http://localhost:3200` and `http://localhost:3200/` are different values.

## 1. Database

```bash
cp .env.example .env.local
# put the Neon connection string into DATABASE_URL
npm run db:migrate
npm run db:status
```

Migrations are additive and safe to re-run.

## 2. Google sign-in

1. In the Google Cloud console, create an **OAuth client ID** of type *Web
   application*.
2. Under **Authorised redirect URIs**, add one entry per origin:
   - `http://localhost:3200/api/auth/google/callback`
   - `https://<your-domain>/api/auth/google/callback`
3. Copy the client id and client secret into `GOOGLE_CLIENT_ID` and
   `GOOGLE_CLIENT_SECRET`.

CloakPay requests `openid email profile`, uses PKCE S256, and reads the stable
`sub` claim as the account identity. It does not request offline access and does
not store a refresh token.

## 3. X sign-in

X sign-in runs on **OAuth 1.0a**. The callback URL is the part that decides
whether it works, because X checks it before the user sees anything: an
unapproved callback is refused by `POST /oauth/request_token` with
`403 ... Callback URL not approved for this client application`, and the
browser never reaches CloakPay.

1. In the X developer portal, copy the app's **API Key** and **API Key Secret**
   from **Keys and tokens** into `X_CONSUMER_KEY` and `X_CONSUMER_SECRET`.
2. Add every origin CloakPay runs on to the app's callback/redirect settings,
   exactly, with no trailing slash:
   - `http://localhost:3200/api/auth/x/callback`
   - `https://<your-domain>/api/auth/x/callback`
3. Run `npm run auth:check` with `APP_URL` set to that origin. It asks X for a
   request token, which is X itself confirming the key, the secret and the
   callback URL in one call.

`X_OAUTH_VERSION=2` switches X back to OAuth 2.0 with PKCE, which needs
`X_CLIENT_ID` and `X_CLIENT_SECRET` and the same callback registered under
**User authentication settings**. Use it if X grants the app OAuth 2.0
user-context access again; until then X answers `GET /2/users/me` with a `403`
for an OAuth 2.0 user token, so that flow cannot complete.

> Both buttons are disabled and the reason is shown until the corresponding pair
> of variables is present. That is intentional: a redirect that fails at the
> provider is a worse experience than a button that explains itself.

## 4. Contracts

```bash
npm run chain:check        # refuses to continue on the wrong chain
npm run chain:compile
npm run test:contracts
```

`chain:check` verifies the chain id **and** that the BN254 precompiles answer
correctly, by calling `ecAdd`, `ecMul` and `ecPairing` and comparing against the
known vectors. Bytecode presence is not a valid test: precompiles have none.

Deploying needs an account that already holds testnet HYPE:

```bash
# .env.local
DEPLOYER_PRIVATE_KEY=0x...
npm run chain:deploy
```

The script refuses to run on an unexpected chain id, and writes
`src/config/pool-deployments.json` only from a broadcast that returned
addresses. No address is ever typed by hand, and nothing is recorded if the
broadcast fails.

Testnet HYPE comes from `https://elysium.kinetiq.xyz/testnet-faucet`. The faucet
is a browser page behind a CAPTCHA, so it cannot be scripted; a human has to
claim it once for the deployer address.

Once a deployment is recorded, `poolIsDeployed()` returns true, private payments
appear in Send and in the link composer, and the privacy badge starts reporting
`Private` for shielded settlements. Until then every one of those surfaces says
the pool is unavailable, and the API returns `privacy_unavailable` if a client
tries anyway.

## 5. Web (Vercel)

1. Import the repository. The framework preset is detected as Next.js; no
   build settings need changing.
2. Set the environment variables from `.env.example`. Production values, not the
   local ones. `APP_URL` must be the production origin.
3. Deploy, then add the production callback URIs to Google and X (step 2 and 3
   above) if they are not already registered.

Set on Vercel:

```
DATABASE_URL
SESSION_SECRET
APP_URL
GOOGLE_CLIENT_ID
GOOGLE_CLIENT_SECRET
X_CLIENT_ID
X_CLIENT_SECRET
X_CONSUMER_KEY
X_CONSUMER_SECRET
ELYSIUM_RPC_URL
ELYSIUM_CHAIN_ID
NEXT_PUBLIC_ELYSIUM_RPC_URL
NEXT_PUBLIC_ELYSIUM_CHAIN_ID
NEXT_PUBLIC_EXPLORER_URL
```

`NEXT_PUBLIC_*` values are embedded in the browser bundle at build time, so they
must be set before the build, not after. None of them is secret: an RPC URL, a
chain id and an explorer URL are public information.

`DEPLOYER_PRIVATE_KEY` must **not** be set on Vercel. It is only read by
`scripts/chain.mjs`, which runs on a developer machine.

## 6. Mobile (Expo)

```bash
cd mobile
npm install
npx expo start
```

The app reads the same configuration through `app.json` `extra`, so nothing is
duplicated. For a device build:

```bash
npx eas build --platform ios
npx eas build --platform android
```

Deep links use the `cloakpay://` scheme for development and
`https://<your-domain>/pay/<code>` universal links in production. Universal links
require the association files served from the domain, which is why they are only
enabled for a real origin rather than a localhost one.

## 7. Post-deploy checklist

- `npm run chain:check` passes.
- Both sign-in buttons are enabled, and a fresh account completes onboarding.
- A direct transfer confirms, and its receipt links to the right explorer
  transaction.
- A payment link opens from a signed-out browser and asks for sign-in first.
- `/api/pool` reports the deployment that `src/config/pool-deployments.json`
  records, and `privateReady` stays `false` until the deposit and withdrawal
  flow exists. A `deployed: true` without a real address means something is
  wrong; so does a `privateReady: true` while no flow can spend a note.
- `npm run chain:verify` re-reads every recorded address over RPC and
  `npm run chain:fork-test` exercises the deployed pool on a fork. Run both
  after any deployment.
