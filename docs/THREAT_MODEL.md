# Threat model

Scope: the web application, the API, the database, the contracts in
`contracts/`, and the Expo application. Testnet only, unaudited, with a
development-only trusted setup. Those three facts are assumed throughout.

## Assets, in the order they matter

1. **User funds** held in wallets and in the pool.
2. **Private keys and mnemonics.** A compromise here is unrecoverable.
3. **Note secrets.** Whoever holds one can spend it. Bearer instruments.
4. **Payment relationships.** The thing the product exists to protect.
5. **Account integrity**, including the link between a social identity and a wallet.

## Threats and what is done about them

### Account takeover

| Threat | Mitigation |
| --- | --- |
| Session theft | Opaque 32-byte token, httpOnly + sameSite=lax cookie, `secure` in production, only a SHA-256 hash stored. Revoked server-side on sign-out. 14-day expiry, no silent refresh. |
| OAuth callback manipulation | `state` generated per attempt, stored server-side, single use, ten-minute expiry. PKCE S256 with a verifier that never leaves the server. |
| Provider identity confusion | Identity keyed on the provider's stable account id. A handle or email change cannot move an account. |
| Silent account merging | Never happens. Linking is an explicit action from Settings. |
| Login CSRF | Same-origin assertions on writes plus the state check. |

The residual risk is the session cookie itself: a compromised browser or a
malicious extension can act as the user while a session is live. CloakPay does
not claim otherwise. Signing out revokes the session, which is why it is on the
settings screen rather than hidden.

### Key compromise

| Threat | Mitigation |
| --- | --- |
| Server compromise | The server never sees a mnemonic or a private key. It stores an AEAD envelope it cannot open. |
| Database dump | Envelopes are useless without passphrases. Passphrases are never transmitted. |
| Weak passphrase | PBKDF2-SHA256 at 600,000 iterations. The UI enforces eight characters and says why length beats symbols. |
| Offline guessing | 600k iterations makes an offline attack on a short passphrase slow but not impossible. **A four-digit PIN would be hopeless, so a PIN is not offered at all.** |
| Key derivation from personal data | Not done, anywhere. Secrets come from `crypto.getRandomValues`. |
| Logs, analytics, crash reports | No key material is ever passed to a logger. This is checked in review, not by a linter. |
| Lost recovery material | The twelve words are the only real backup and the UI says so in those words. |

### Payments

| Threat | Mitigation |
| --- | --- |
| Duplicate submission | `payments.idempotency_key` is unique; a retry returns the original record. Link claims are guarded by a partial unique index and a `SELECT ... FOR UPDATE` inside a transaction. |
| Replay of a link | Single-use links are bound to their first claimant; usage is incremented inside the same locked transaction that validates it. |
| Forged settlement | Only a real transaction receipt moves a payment to confirmed. `PATCH /api/payments/:id` requires a hash to confirm and is restricted to the two parties. |
| Insufficient balance | Estimated client-side against the live RPC, and refused by the node if it is wrong. The UI disables the action rather than letting it fail. |
| Token decimal errors | Only the native asset is supported. Amounts are integer wei end to end; `numeric(78,0)` in the database. No floats anywhere. |
| RPC failure | Transfers surface the failure. A broadcast that never confirms stays `submitted` rather than being marked successful. |
| Front-running | A public transfer is front-runnable in the sense that anyone can observe it. Nothing in the product depends on transaction privacy. In the pool, the proof binds `recipient`, `relayer` and `fee`, so an observer cannot redirect a withdrawal. |
| Double spend | Nullifiers, enforced by the contract, not the client. |

### Contracts

| Threat | Mitigation |
| --- | --- |
| Reentrancy | `ReentrancyGuard` on deposit and withdraw, checks-effects-interactions ordering, and the native asset rather than arbitrary ERC-20 callbacks. |
| Invalid proof | Verified on chain. One test proves a real Groth16 proof is accepted; others prove a tampered fee, a duplicated nullifier, a swapped point and an unknown root are all rejected. |
| Privileged fund access | There is none. The owner can pause; a test asserts the owner cannot move pool funds. |
| Accounting drift | `pooledBalance` is a per-denomination lower bound on the contract balance, with an invariant-style test. |
| Compiler miscompilation | Two real solc 0.8.28 bugs were found during development: inlined Poseidon in a constructor, and `internal` Poseidon, both produced contracts with truncated runtime code. Both workarounds are documented in the source and must not be undone. |
| Upgrade authority | None. The contracts are not upgradeable. A bug means a redeploy. |

### Interface and API

| Threat | Mitigation |
| --- | --- |
| XSS | React escapes by default; no `dangerouslySetInnerHTML` anywhere in the codebase. |
| CSRF | `assertSameOrigin` on every mutating route, plus sameSite cookies. |
| Username enumeration | Search requires an authenticated caller, requires two characters, is rate limited to 60 requests a minute per user, and returns only what a payer needs. Username availability has to be checkable, so it is rate limited instead of hidden. |
| API abuse | Fixed-window rate limits in the database, shared across instances, plus request size and field-length limits in every schema. |
| SQL injection | Parameterised queries through `postgres` tagged templates. No string-concatenated SQL. |
| Trusting the client | The client never supplies its own user id, balance, payment status or proof validity. Every write is scoped by the session, and the chain is the authority on settlement. |
| Malicious payment link | A link carries a username, an optional amount, and optional rules. It never carries a key or a note secret. The checkout page shows what will be sent, to whom, and requires an explicit confirmation. |
| Third-party leakage | No third-party analytics, no external fonts CDN, no image-resizing service. QR codes are rendered locally so the payment payload never leaves the device. |

### Privacy leakage

Analysed in [PRIVACY_PROTOCOL.md](PRIVACY_PROTOCOL.md). The honest summary:
timing and gas payment remain the strongest on-chain link between a deposit and a
withdrawal, the anonymity set is only as large as the pool, and the backend knows
the private payment graph. A relayer addresses the first of those, is not
implemented, and is not advertised.

### Supply chain

Direct dependencies are few and deliberate: `next`, `react`, `viem`, `postgres`,
`zod`, `jose`, `qrcode`, `poseidon-lite`, `snarkjs`, `clsx`, `arctic`. The
Poseidon Solidity library is vendored rather than installed, with its provenance
in the file header, because the circuit's soundness depends on those constants
matching circomlib exactly.

## Not defended against

Listing these is more useful than pretending otherwise.

- A compromised device or a malicious browser extension. If an attacker can read
  the DOM, they can read the passphrase and act as the user.
- A user who shares their mnemonic, passphrase or note export string.
- A compromised RPC provider. A node can lie about chain state, delay a
  broadcast, or censor a transaction. It cannot forge a signature or a proof.
- Traffic analysis at the network layer.
- A subpoena served on the hosting provider or Neon, which would reveal the
  payment graph the application stores.
- Quantum adversaries. Every primitive here is broken by a sufficiently large
  quantum computer.
- Anything above testnet stakes. The trusted setup is single-party, the code is
  unaudited, and the contracts are not deployed.

## Pre-launch requirements

Before this handles anything of value:

1. Replace the local Groth16 setup with a multi-party ceremony and regenerate the
   verifier.
2. An independent audit of the contracts and of the circuit, by someone who does
   not work on this codebase.
3. A relayer, or an explicit decision to accept timing correlation.
4. Bind notes to recipient keys so a stolen note cannot be spent by a third party.
5. Move the passphrase-to-key step to a memory-hard KDF (Argon2id) rather than
   PBKDF2, which is GPU-friendly.
6. A published retention and deletion policy for the payment records the server
   holds.
