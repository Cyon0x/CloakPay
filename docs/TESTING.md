# Testing

## Running everything

```bash
npm run typecheck        # tsc --noEmit
npm run lint             # next lint
npm run test:unit        # protocol: Merkle tree and note format
npm run test:contracts   # Foundry: pool, tree, and a real Groth16 proof
npm run build            # production build
npm run chain:check      # live network assertions against Elysium testnet
npm run chain:verify     # every recorded contract address, read back over RPC
npm run chain:fork-test  # the deployed pool, on a fork, with a real proof
```

Two checks need a running server and a real database, and both delete the
fixtures they create:

```bash
APP_URL=http://localhost:3200 npm run username:check   # registration, end to end
APP_URL=http://localhost:3200 npm run privacy:check    # the two payment paths
APP_URL=http://localhost:3200 npm run nav:check        # the nav drawer, in a browser
```

`privacy:check` is the guard on the private/public split: a private payment is
refused while its flow is unbuilt, an address cannot be smuggled into the
private path, a private link cannot be settled as a public transfer, a refused
attempt does not spend the link's use, and an external transfer still opens.

`nav:check` drives a real Chrome and measures the drawer at desktop, tablet and
phone widths. It exists because the drawer was once broken in a way no other
check could see: `.topbar` carries a `backdrop-filter`, which makes it the
containing block for `position: fixed` descendants, so the drawer and its scrim
were sized to the 60px header instead of the viewport. The menu opened,
reported `aria-expanded="true"` and rendered its items -- inside a sliver. It
skips itself when no Chrome or no server is available.

The unit-test runner uses `node --import tsx --test --test-isolation=none`
rather than the `tsx` CLI, because the CLI's IPC socket is not permitted in a
restricted sandbox. Same tests, fewer moving parts.

## What is actually covered

### Protocol, `tests/unit/`

15 tests. Zero hashes are the Poseidon fixed point; an empty tree has the all-zero
root; insertion changes the root and preserves order; every leaf's proof
recomputes the root; a proof for one leaf does not verify another; a tree rebuilt
from the leaf list (which is what the indexer does) produces an identical root;
capacity is enforced; out-of-range proofs are rejected rather than silently
wrong. On notes: commitment and nullifier hash are derived rather than stored;
secrets never repeat; the amount comes from the denomination and not from user
input; unknown denominations are refused; encode/decode round-trips; malformed
notes are rejected instead of half-parsed; a tampered note fails its commitment
comparison.

### Input parsing, `tests/unit/`

17 tests over the two pieces that decide what a payment is allowed to be.
`amount.ts` refuses zero, negative, malformed and over-precise values rather
than rounding them, converts decimal strings to wei without touching a float,
and round-trips; `address.ts` rejects anything that is not 40 hex characters,
catches a bad EIP-55 checksum, and refuses the zero address and the sender's
own address.

### Contracts, `contracts/test/`

25 tests, all passing. The two that matter most:

- `test_withdraw_accepts_a_real_proof` generates a Groth16 proof from the compiled
  circuit and has the **deployed verifier contract verify it on the EVM**. This is
  not a mock. The same code path runs on chain.
- `test_empty_root_matches_typescript_implementation` pins the Solidity tree
  against the TypeScript tree, which is how the client and contract are kept from
  drifting.

Also covered: a replayed nullifier is rejected; a redirected recipient is
rejected; a tampered fee is rejected; a swapped proof point is rejected; an
unknown root is rejected; a fee above the denomination is rejected; a fee requires
a relayer; fees split correctly to the relayer; wrong deposit amounts and unknown
denominations are rejected; direct transfers to the pool are rejected; pausing
blocks both directions; the owner cannot move pool funds; and the pool never owes
more than it holds.

### Fixtures

`tests/fixtures/withdraw-*.json` hold real proofs for a single-leaf tree, a
four-leaf tree, and a withdrawal with a relayer fee, used by the Foundry tests.
They are regenerated with `npm run zk:prove-fixtures`.

## What is not covered, and why that matters

**No test claims a live private payment works end to end.** The verifier, the
Poseidon library and the pool are deployed to Elysium testnet, and
`npm run chain:verify` re-reads every recorded address over RPC while
`npm run chain:fork-test` runs the deployed pool on a fork with a real Groth16
proof: a deposit and withdrawal settle, and a reused nullifier, tampered public
signals, an unknown root, a wrong deposit amount and an unknown denomination are
all refused. What is still missing is the deposit and withdrawal flow a user
would drive in the browser, so no test drives a private payment from the UI, and
no deposit has been made from a real funded account.

**The OAuth flow has no automated test.** It needs registered redirect URIs and a
provider account. `src/lib/auth/oauth.ts` is written so the parts that can be
tested independently (state generation, PCKE pair integrity, the token-exchange
request shape) are separable, but the end-to-end flow is manual and is listed as
such rather than faked.

The failure paths that were exercised by hand while building: a mismatched
`state`; an expired handshake; a provider returning no code; a callback for an
unknown provider; a duplicate identity signing in twice; and a signed-out session
hitting a protected route.

**The interface was verified in a real browser**, not just inspected. Every route
was rendered at 1440px and at 390px with a seeded session, which is how several
defects were found and fixed: circle icons collapsing into lenses at small sizes,
three stacked stat cards eating half a phone screen, a sticky bottom navigation
overlapping page content, a fee estimate reporting "unavailable" for an unfunded
wallet, and a "Accepting private payments" badge being shown while the pool had no
deployment.

**Nothing has been audited.** Passing tests are not an audit, and this document
does not use the word to mean one.
