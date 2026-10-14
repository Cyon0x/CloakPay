# Roadmap

## Done and verified

**Privacy core.** `withdraw.circom` with 5,777 constraints and five public
signals, a depth-20 Poseidon Merkle tree, nullifiers, and a Groth16 verifier
generated into Solidity. The circuit, the TypeScript and the Solidity agree on
hashing, tree depth, leaf ordering and root calculation, and that agreement is
pinned by a test rather than by convention.

**Contracts.** `ShieldedPool.sol` and `MerkleTreeWithHistory.sol`, with 25
Foundry tests passing. The suite includes a genuine Groth16 proof verified by the
deployed verifier inside the EVM, plus adversarial cases: replayed nullifier,
redirected recipient, tampered fee, swapped proof point, unknown root, oversized
fee, owner attempting to move pool funds.

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

**Payments.** Real native HYPE transfers signed in the browser and broadcast to
the Elysium RPC, with receipts confirmed against actual transaction receipts.

**Links and QR.** Fixed or open amounts, expiry, usage limits, one-time links,
native share, locally rendered QR codes.

**Brand.** One asset pipeline (`scripts/brand.py`) deriving every mark, wordmark,
icon and favicon from the supplied master artwork, and one design token set in
`app/globals.css`.

## Partial

**Shielded payments.** The cryptography, the contracts and the client proving
pipeline are complete and tested. The pool is not deployed, because deploying
needs testnet HYPE in a deployer account and the faucet is a browser page behind
a CAPTCHA. Everything that would otherwise offer a private payment is switched
off and says why, and the API refuses with `privacy_unavailable` rather than
falling back to a public transfer.

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
- **Indexer.** `pool_events` and `pool_state` exist in the schema. Nothing
  populates them yet, because there is no deployment to index.
- **Audit.** None has taken place.
