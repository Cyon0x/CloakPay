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
| Direct HYPE transfers, signed in the browser and broadcast to the Elysium RPC | Working |
| Payment links, QR codes, native share, expiry, usage limits, one-time links | Working |
| Transaction records, receipts, real confirmation from the chain | Working |
| In-app notifications, rate limiting, audit events | Working |
| Shielded pool, deployed to Elysium testnet | Deployed and verified on chain. `npm run chain:verify` reads every recorded address back over RPC; `npm run chain:fork-test` runs the deployed pool on a fork with a real proof. |
| Private payments: shield, pay a username, receive, withdraw | Working, with real Groth16 proofs. `npm run e2e:shielded` completes a deposit, a proof-verified shielded transfer to a second account, note decryption and a withdrawal on testnet. |
| Deposit and withdrawal interface (`/privacy`) | Working. The shielded balance is derived from the pool's own events and the chain's nullifier set, never from a cached figure. |
| Relayer / sponsored gas | Not implemented |
| Viewing keys | Partially: a viewing key is generated and a note can be sealed to it. Selective disclosure to a third party is not implemented. |
| Mobile app (Expo) | See [mobile/](mobile/) |

Anything not in the "working" rows above is not offered in the interface. Where
the shielded pool is unavailable, the app refuses a private payment instead of
quietly settling it as a public transfer.

The shielded pool is a **bearer** instrument: whoever holds a note's secret can
spend it, so a note whose secret is lost is lost, and the deposits used by the
development runs are still sitting in the pool. The trusted setup is
single-party and development-only. Both are stated in
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
