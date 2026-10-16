# Roadmap

## Done and verified

**Privacy core.** `withdraw.circom` with 5,777 constraints and five public
signals, a depth-20 Poseidon Merkle tree, nullifiers, and a Groth16 verifier
generated into Solidity. The circuit, the TypeScript and the Solidity agree on
hashing, tree depth, leaf ordering and root calculation, and that agreement is
pinned by a test rather than by convention.

**Contracts.** `ShieldedPool.sol` and `MerkleTreeWithHistory.sol`, with 40
Foundry tests passing. The suite includes a genuine Groth16 proof verified by the
deployed verifier inside the EVM, plus adversarial cases: replayed nullifier,
redirected recipient, tampered fee, swapped proof point, unknown root, oversized
fee, owner attempting to move pool funds, a third party relaying a transfer they
cannot redirect, and a note that cannot be spent as both a transfer and a
withdrawal.

**Shielded payments, end to end.** `transfer.circom` mints a replacement note
instead of paying an address, which is what lets a payment be addressed to a
username with no wallet address on chain. The client
(`src/lib/client/shielded.ts`) derives spendability from the pool's own events
and the chain's nullifier set, generates real Groth16 proofs in the browser, and
delivers the recipient's note as ciphertext the server cannot read. `/privacy`
holds the deposit and withdrawal surface. `npm run e2e:shielded` deposits a note,
settles a proof-verified shielded transfer to a second account, decrypts the
delivered note and withdraws it, on Elysium Testnet, against the deployed pool —
seventeen checks, each read back from the chain.

**Chain validation.** `eth_chainId` returns `0x185d9` (99801), the client reports
`nitro/...` (Arbitrum Orbit), and `ecAdd`, `ecMul` and `ecPairing` were each
called and matched against the canonical vectors. Groth16 verification is
therefore viable on Elysium, which was checked rather than assumed.

**Web application.** Landing, how-it-works, security, FAQ, privacy, terms,
sign-in, onboarding, dashboard, send, receive, links, new link, checkout,
activity, public profile, settings. Sixteen API routes. Real data from Neon and
from the chain, with loading, empty, error and success states, and layouts
verified at desktop and phone widths in a real browser.

**Authentication.** OAuth 2.0 with PKCE S256, single-use server-side state,
identity keyed on stable provider ids, tokens never persisted.

**Wallets.** Self-custodial, twelve-word BIP-39 generated in the browser, sealed
with PBKDF2-SHA256 (600k) and AES-256-GCM. No plaintext key material anywhere in
the database, the logs, or a URL.

**Payments.** One flow: pay a registered CloakPay user by username. The username
is resolved server-side against the unique case-insensitive index, the browser
signs a real native HYPE transfer and broadcasts it to the Elysium RPC, and the
row is confirmed only against an actual transaction receipt. No wallet address is
typed, rendered or printed anywhere in it.

**Receipts.** A receipt is a view of one payment row for the two people on it.
The send flow shows it the moment the chain confirms, `/transactions/[id]`
reopens it from the history, and `GET /api/payments/:id/receipt` returns the same
document as a PDF. Issued only for a confirmed payment, never carrying a wallet
address, and authorized by the query that loads the row.

**Two paused features.** External Transfer and the Shielded Pool are both
labelled "Coming soon" and refused in the interface *and* in the API, before
anything is written. `src/config/features.ts` is the single switch. Re-enabling
either is a flag and a screen: the contracts, the circuits, the client module,
the schema and the end-to-end shielded check are all still here and still
passing.

**Links and QR.** Fixed or open amounts, expiry, usage limits, one-time links,
native share, locally rendered QR codes.

**Brand.** One asset pipeline (`scripts/brand.py`) deriving every mark, wordmark,
icon and favicon from the supplied master artwork, and one design token set in
`app/globals.css`.

## Partial

**Paused features, and the surface around them.** External Transfer and the
Shielded Pool are switched off rather than unfinished: `scripts/shielded-e2e.mjs`
still drives the private flow end to end on testnet, and `npm run privacy:check`
now asserts that every paused entry point refuses. What has not been re-verified
since the pause is the paused *screens* themselves — the pool panel is kept but
not rendered, so there is no browser test driving it today.

**Untested in a browser.** The private-payment surface is exercised through the
real client module, the real API and the real contracts, but not by clicking.
The deposit panel, the Send form's private mode and the checkout panel have been
rendered and reviewed at desktop and phone widths; no automated test drives them.

**Trusted setup.** Functional, but single-party and development-only. See
[PRIVACY_PROTOCOL.md](PRIVACY_PROTOCOL.md#trusted-setup). This must be replaced
before anything of value is at stake.

**Viewing keys.** Generated per wallet, registered, and used to receive sealed
notes. Selective disclosure to a third party, revocation and rotation are not
implemented.

**Mobile.** The Expo application shares the account model, the API and the
payment protocol with the web app, and its wallet secret is byte-compatible with
the browser envelope. Sign in, onboarding, home, send, activity, links, receive,
QR scanning, checkout, and settings are built. See
[mobile/README.md](../mobile/README.md) for the screen list and the exact state
of each one. It has not been run on a physical device or a simulator in this
environment, and no store build has been produced, so the screens are typed and
reviewed rather than device-verified.

**Notifications.** Recorded in the database and shown in-app. There is no push
delivery, because that needs an Expo project and credentials. The mobile switch
on the settings screen controls in-app alerts only.

## Not started

- **Relayer.** No sponsored transactions. Timing correlation between a deposit
  and a withdrawal is therefore unmitigated, and that is the single strongest
  remaining on-chain link.
- **Note binding.** A note is currently a bearer instrument. Binding it to the
  recipient's key so a stolen note cannot be spent by a third party is not
  implemented.
- **ERC-20 support.** The native asset only. Adding a token means verifying its
  address and transfer semantics on Elysium first, and the pool's accounting
  would need a review.
- **Argon2id.** The wallet envelope uses PBKDF2, which is GPU-friendly. Argon2id
  is the right choice and is not available through WebCrypto without a
  dependency.
- **Indexer.** `pool_events` and `pool_state` exist in the schema and nothing
  populates them. The client rebuilds the commitment tree by reading the pool's
  logs directly, which is correct but means every client re-scans from the
  deployment block. An indexer is an efficiency and a reorg-safety question, not
  a correctness one.
- **Note recovery.** A note is a bearer instrument and its secret lives only in
  the owner's sealed wallet envelope. If the envelope is lost, the funds behind
  the note are unreachable. Social recovery and a backup-note export are not
  implemented, and the deposits made by the development runs are a live example:
  they remain in the pool with their secrets gone.
- **Audit.** None has taken place.
