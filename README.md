# CloakPay

Private payments on **Kinetiq Elysium**. Sign in with Google or X, claim a
username, and pay people by typing it. Behind the simple screen is a shielded
pool built from Poseidon commitments, a Merkle tree, nullifiers and Groth16
proofs that the contract verifies itself.

**Testnet only.** CloakPay has not been audited. Do not move value you cannot
afford to lose.

---

## What actually works today

| Area | State |
| --- | --- |
| Google and X sign-in (OAuth 2.0 + PKCE, single-use server-side state) | Implemented. Needs redirect URIs registered in the Google and X consoles before it will run. See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md). |
| Usernames: claim, validate, search, public payment page | Working |
| Self-custodial embedded wallet (12-word BIP-39 in the browser) | Working |
| **Payments to another CloakPay user by username** | Working. The only payment flow CloakPay offers: type a username, review it, sign, and keep the receipt. Case-insensitive lookup is enforced by a unique database index. |
| HYPE transfers signed in the browser and broadcast to the Elysium RPC | Working. This is what a username payment settles as: an ordinary native transfer on Elysium. It is public on chain, and every surface says so. |
| Payment receipts, in the app and as a PDF | Working. Issued only for a confirmed payment, downloaded from the send flow or reopened from the transaction history. No wallet address appears on one. |
| Payment links, QR codes, native share, expiry, usage limits, one-time links | Working |
| Transaction records with real confirmation from the chain | Working |
| In-app notifications, rate limiting, audit events | Working |
| External Transfer — sending to a wallet address that is not a CloakPay account | **Paused, labelled "Coming soon".** The interface no longer asks for an address and the API refuses one. The transfer code itself is untouched. |
| Shielded pool — deposits, private transfers, withdrawals | **Paused, labelled "Coming soon".** Deployed on Elysium testnet and verified on chain, with a working client flow (`npm run e2e:shielded` still drives it end to end), but not offered: `/privacy` explains it and operates nothing. |
| Relayer / sponsored gas | Not implemented |
| Viewing keys | Partially: a viewing key is generated and a note can be sealed to it. Selective disclosure to a third party is not implemented. |
| Mobile app (Expo) | See [mobile/](mobile/) |

Anything not in the "working" rows above is not offered in the interface. Where
either paused path is unavailable, the app refuses it instead of quietly
settling it as something else.

## How a payment works

One flow, and no address anywhere in it:

1. On `/send`, the payer types a username. `/api/users/search` returns matching
   accounts — usernames and display names, never addresses — and the unique
   index on `username_lower` is what makes the lookup case-insensitive and the
   names unique.
2. `POST /api/payments/intent` takes `{ toUsername, amountWei }`, checks the
   session, the origin and the rate limit, resolves the username to the account
   it names, refuses a self-payment, and writes one `payments` row in `pending`.
   The response carries the recipient's address, which exists so the browser has
   something to sign against and is never rendered.
3. The browser unseals the embedded wallet in this tab and signs a native HYPE
   transfer to that address, broadcasting it to the Elysium RPC. CloakPay does
   not hold the key and cannot sign for the user.
4. `PATCH /api/payments/:id` records `submitted`, then `confirmed` once the
   chain returns a receipt with status `success`. Only the two parties to a
   payment may change it, and `confirmed` requires a transaction hash, so a
   client cannot mark its own payment settled.
5. The receipt is issued from that row. A pending, submitted or failed payment
   is shown with the status it really has and has nothing to download.

The payment is real and on chain: an ordinary transfer, visible to anyone who
looks, on a public test network. CloakPay keeps the link between a username and
an address to itself and never prints it — that is a UI and data-minimisation
choice, not a privacy guarantee for the transfer itself.

## Where a wallet address appears

One screen. `/receive` shows the signed-in user's username, and below it the
wallet address under the heading "Receive from external wallet" so funds can
arrive from outside CloakPay. Every other surface — dashboard, settings, Send,
activity, transactions, payment links, receipts, the public profile — names
people by username and prints no address at all. Addresses still move through
the backend, because a native transfer has to be signed against one; they are
simply never rendered.

The shielded pool, when it returns, is a **bearer** instrument: whoever holds a
note's secret can spend it, so a note whose secret is lost is lost, and the
deposits from the development runs are still sitting in the pool. The trusted
setup is single-party and development-only. Both are stated in
[docs/PRIVACY_PROTOCOL.md](docs/PRIVACY_PROTOCOL.md) rather than hidden.

## Repository layout

```
app/                  Next.js App Router: pages and API routes
src/components/       UI, including the CloakPay brand components
src/lib/              Server: database, sessions, OAuth, rate limiting, payments
src/protocol/         Commitments, Merkle tree, note format, AEAD envelopes
src/config/           The single source of chain and pool constants
circuits/             withdraw.circom, transfer.circom and the Groth16 build pipeline
contracts/            ShieldedPool, MerkleTreeWithHistory, both verifiers, Foundry tests
db/migrations/        PostgreSQL migrations
scripts/              Migrations, brand assets, chain tooling, circuit build
mobile/               Expo / React Native application
tests/                Unit tests and proof fixtures
docs/                 Architecture, protocol, threat model, database, deployment
```

## Running it locally

```bash
npm install
cp .env.example .env.local      # then fill it in
npm run db:migrate
npm run dev                     # http://localhost:3200
```

`npm run chain:check` confirms the RPC is the Elysium testnet and that the
BN254 precompiles actually answer, which is what makes a Groth16 verifier
viable there. The pool contracts need Foundry:

```bash
npm run chain:compile
npm run test:contracts
```

`src/config/pool-deployments.json` is written by `npm run chain:deploy` and by
nothing else. The app reads the pool from it, so an unrecorded deployment shows
as unconfigured instead of being papered over.

## Documentation

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) how the pieces fit together
- [docs/PRIVACY_PROTOCOL.md](docs/PRIVACY_PROTOCOL.md) the cryptography, and its limits
- [docs/THREAT_MODEL.md](docs/THREAT_MODEL.md) what we defend against, and what we do not
- [docs/DATABASE.md](docs/DATABASE.md) schema and migrations
- [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) OAuth setup, contracts, Vercel, mobile builds
- [docs/TESTING.md](docs/TESTING.md) what is tested and how to run it
- [docs/ROADMAP.md](docs/ROADMAP.md) done, partial, planned
