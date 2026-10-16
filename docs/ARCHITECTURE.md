# Architecture

## Shape of the system

```
                    ┌──────────────────────────┐
   browser / app ──▶│  Next.js App Router      │
                    │  pages + API routes      │
                    └───────────┬──────────────┘
                                │
              ┌─────────────────┼──────────────────┐
              ▼                 ▼                  ▼
        ┌──────────┐     ┌────────────┐    ┌───────────────┐
        │  Neon    │     │  Elysium   │    │  Google / X   │
        │ Postgres │     │  RPC       │    │  OAuth        │
        └──────────┘     └────────────┘    └───────────────┘
```

There is no separate backend service. Every privileged operation is an API route
in the same deployment, which keeps the trust boundary in one reviewable place
instead of distributed across a client and a server that can disagree.

## Layers

**`src/config/`** is the only place chain constants exist. `chain.ts` holds the
chain id, RPC URL, explorer URL, faucet URL and verified token addresses;
`pool.ts` holds denominations, tree depth and the recorded deployment record.
Nothing else in the codebase hardcodes any of them. The client reaches the same
values through `NEXT_PUBLIC_*` fallbacks, so the browser and the server can never
drift onto different networks.

**`src/protocol/`** is pure cryptography with no database or network access, so
it runs identically in the browser, in the Expo app, in Node tests and in the
build scripts. See [PRIVACY_PROTOCOL.md](PRIVACY_PROTOCOL.md).

**`src/lib/`** is server-only: the pooled Postgres client, session handling,
OAuth, usernames, rate limiting, payment rules. `src/lib/client/` is the
browser side: the viem chain client, native transfers, wallet unlock, and
`shielded.ts` -- the shielded client that seals notes, rebuilds the commitment
tree from the pool's own events, builds witnesses and generates Groth16 proofs.
Nothing in that module trusts a database row: spendability comes from the
pool's events and the chain's nullifier set, and a payment is settled when the
receipt says so.

**`app/api/`** holds the API routes. Each one validates its body with a schema,
resolves the caller with `requireUser()`, checks same-origin on writes, and
returns one of two response shapes (`{ok:true,data}` or `{ok:false,error}`).

## Authentication

Google signs in with an authorization-code flow with PKCE (S256), implemented in
`src/lib/auth/oauth.ts` rather than pulled from a dependency, because the
behaviour is small enough to review in one sitting.

X runs on OAuth 1.0a (`src/lib/auth/oauth1.ts`). That is not a preference: X
issues this app an OAuth 2.0 user access token and then answers `GET
/2/users/me` with a bare `403 Forbidden`, while the same endpoint returns `200`
for an OAuth 1.0a user token from the same app. `X_OAUTH_VERSION=2` selects the
PKCE path for X again if that entitlement is restored. Both flows return the
same numeric X user id, so identity does not change with the choice.

- `state` is generated per attempt for PKCE; for X's 1.0a the request token is
  the state. Either way it is stored server-side in `oauth_states`, single use,
  and expires after ten minutes, and the matching secret (`code_verifier`, or
  the request-token secret) never leaves the server.
- Identity is keyed on the provider's **stable account id** (`sub` for Google,
  `data.id` for X), never on a handle or an email address, both of which can be
  reassigned.
- Provider access tokens are used for exactly one userinfo request and are never
  persisted. If a token is ever needed later, the retention policy has to be
  written down first.
- A session is an opaque 32-byte random token in an httpOnly cookie. Only its
  SHA-256 hash is stored, so a database dump is not a set of live logins.

Account linking is deliberately manual. Two identities are only joined when a
signed-in user connects the second provider from Settings; similar-looking
usernames or emails are never merged automatically.

### Signed-in routing

There is no middleware and no client-side auth store, so nothing can decide that
a user is signed out while a session check is still in flight: every page reads
the session on the server and renders the result. `AuthedShell` guards the app,
and pages that read the session themselves start with `currentUserOrRedirect()`
for the same reason — an expired session is a signed-out visitor and goes to
sign-in rather than rendering an empty page.

- The header lockup (`BrandLink`) follows the session: `/` for a visitor, and
  `/dashboard` once signed in, so the logo never drops an authenticated user on
  the landing page.
- The landing page is for signed-out visitors and redirects an authenticated
  one to `/dashboard`. The public pages that stay useful while signed in — how
  it works, privacy, FAQ, terms — are deliberately not guarded.
- Sign-out revokes the session row, clears the cookie, and returns to `/`.

## Wallets

CloakPay is **self-custodial**. A twelve-word BIP-39 mnemonic is generated in
the browser with `viem`'s standard wordlist and an account is derived at
`m/44'/60'/0'/0/0`, so the wallet restores in any other EVM tool.

The mnemonic never leaves the device in the clear. The browser seals
`{mnemonic, viewingKeyPair}` under a user-chosen passphrase with
PBKDF2-SHA256 (600,000 iterations) and AES-256-GCM, and posts only the
ciphertext envelope. The server stores an opaque blob it has no way to open.

The mnemonic is never derived from an email, a handle, a provider id or a PIN,
and no plaintext key material is ever written to Postgres, an API response, a
log, or a URL.

## Payments

CloakPay has one live payment: paying another registered user by username. It
settles as an ordinary native HYPE transfer, and it is labelled `public`
everywhere, including in the database, because that is what it is.

**Where the addresses are.** A native transfer has to be signed against a
destination address, so two of them move through the system: the payer's, which
the browser unseals to sign with, and the recipient's, which
`/api/payments/intent` resolves from the username and returns to the
authenticated payer so the transaction can be built. Neither is rendered. The
only screen that prints an address is `/receive`, and it prints the signed-in
user's own, under "Receive from external wallet", for money arriving from
outside CloakPay. Everything else — dashboard, settings, Send, activity,
transactions, links, receipts, the public profile — names people by username.

```ts
// src/config/features.ts — the two paths that are paused.
export const FEATURES: PaymentFeatures = { externalTransfers: false, shieldedPool: false };
```

**Paused, not deleted.** Both switches are read by the server as well as the
client, so a stale tab or a hand-made request meets the same refusal as the
interface, and every refusal happens before anything is written: no payment row,
no burned link use. The contracts, circuits, `src/lib/client/shielded.ts`, the
`shielded_notes` schema and `scripts/shielded-e2e.mjs` are all intact; re-enabling
is a flag and a screen rather than a rebuild.

**Direct transfer (`privacy = 'public'`)** is a normal native HYPE transfer,
signed in the browser by the user's own key and broadcast straight to the
Elysium RPC. The server never holds a key and never signs. It only records the
attempt and then confirms it against a real receipt. Sender, recipient, amount
and timing are all visible on chain, and the UI says so before the user confirms.

**Shielded settlement (`privacy = 'private'`)** is switched off. When it was live
it deposited into the pool, carried a commitment, and paid out through a Groth16
proof that the contract verifies and enforces the nullifier for. It is refused
with a named error while the pool is paused, so it can never silently degrade
into the public path.

**External transfer** is the other paused path: a public transfer to a wallet
address that is not a CloakPay account. Its refusal is `external_transfer_paused`
and it is refused wherever an address is supplied.

The server is never the authority on whether a proof is valid. It has no verifier
and trusts no client claim about one.

### Receipts

A receipt is a view of a `payments` row, not a second record of it.
`src/lib/receipt/data.ts` loads one row for one viewer, and the viewer is part of
the query: a payment that does not name the caller is indistinguishable from one
that does not exist. `PaymentReceipt` renders it in the app — the send flow shows
it the moment the chain confirms, and `/transactions/[id]` shows the identical
component when an old receipt is reopened — and `renderReceiptPdf` draws the same
fields into a PDF for `GET /api/payments/:id/receipt`.

Two rules hold across all three: a completed receipt exists only for a
`confirmed` payment, and no receipt contains a wallet address or a transaction
hash. The hash stays on the payment row for reconciliation, but a receipt is
the record of a payment rather than a pointer into a ledger, so neither the page
nor the PDF prints it — and no receipt links to an explorer.

### Settlement order

1. `POST /api/payments/intent` validates the recipient or link, records a pending
   payment row, and returns the payout address to the authenticated payer.
2. The browser signs and broadcasts.
3. `PATCH /api/payments/:id` marks it submitted with the hash.
4. Only an actual receipt marks it confirmed. A broadcast that never confirms
   stays `submitted`, which is what it really is.

## Privacy labels

`src/components/ui.tsx` maps a state to a badge. `private` is only ever applied
to a shielded settlement. A direct transfer is always shown as `Public`. The
labels come from the payment record, not from the screen.

## What the server can see

Being explicit about this matters more than the diagram:

- Usernames, display names, avatars, connected provider account ids.
- Wallet **addresses**. The server cannot spend from one.
- Payment metadata: who paid whom, the denomination, the status, the note the
  payer typed, and any transaction hash.
- Ciphertext envelopes for wallets and notes. Not their contents.

The server cannot read a note, cannot derive a private key, and cannot spend.
It can see the payment graph of public payments in full, and the graph of
private payments only as rows it stored itself. That is a real trust
assumption for a hosted service and it is documented rather than hidden.
