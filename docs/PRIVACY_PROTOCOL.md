# Privacy protocol

## What CloakPay's privacy is, in one sentence

A deposit and a withdrawal are both public, and nothing on chain connects them.

That is a shielded pool. It is not a privacy toggle, it is not a database
permission, and it is not a claim that a normal transfer is private.

## The construction

| Piece | Choice | Where |
| --- | --- | --- |
| Hash | Poseidon over BN254 | `circuits/lib/poseidon.circom`, `src/protocol/poseidon.ts`, `contracts/src/vendor/PoseidonT3.sol` |
| Commitment | `C = Poseidon(nullifier, secret)` | `src/protocol/note.ts` |
| Nullifier | `N = Poseidon(nullifier)` | same |
| Membership | depth-20 incremental Merkle tree, `node = Poseidon(left, right)` | `src/protocol/merkle.ts`, `MerkleTreeWithHistory.sol` |
| Proof | Groth16 over BN254 | `circuits/withdraw.circom` |
| Verification | on-chain pairing precompiles | `contracts/src/Groth16Verifier.sol` |
| Note transport | ECIES, P-256 + HKDF-SHA256 + AES-256-GCM | `src/protocol/crypto.ts` |
| Wallet at rest | PBKDF2-SHA256 (600k) + AES-256-GCM | same |

No primitive in this list is invented. Every one is an established construction
with a reference implementation, and the circuit, the TypeScript and the Solidity
are tested against each other on the same vectors.

### Why these choices

Poseidon is what makes a Merkle proof inside a circuit affordable: a depth-20
membership proof is around 5,800 constraints, where a Keccak tree would be an
order of magnitude larger.

Groth16 was chosen over a universal-setup system because the circuit is small,
fixed, and its verifier is a few hundred lines of generated Solidity that runs on
a precompile. The trade-off is stated below rather than hidden.

The denominations are fixed (0.1, 1 and 10 HYPE) so that amounts are not a
correlating signal. Each denomination has its own tree, because a note of 1 HYPE
genuinely cannot be confused with a note of 10 HYPE and pretending otherwise
would only make the proofs more expensive.

## The circuit

`circuits/withdraw.circom` proves, in zero knowledge:

1. `Poseidon(nullifier, secret)` is a leaf of the tree with root `root`.
2. `nullifierHash = Poseidon(nullifier)` for that same `nullifier`.
3. `recipient`, `relayer` and `fee` are canonical field elements.

**Public signals, in declaration order:**
`[ root, nullifierHash, recipient, relayer, fee ]`

Step 3 exists because a field element and an address are not the same thing: a
value above `2^160` or a non-canonical field encoding would otherwise let two
different transactions share one proof. The circuit forces both, and the contract
names the error when either fails.

The prover reveals nothing else. Not the deposit index, not the amount inside the
commitment, not which other notes exist.

## Lifecycle of a note

```
deposit            commitment inserted             note sealed to recipient
   │                        │                                │
   ▼                        ▼                                ▼
HYPE in ──────▶ Poseidon(nullifier, secret) ──────▶ ECIES to viewing key
   │                        │                                │
   │                   public on chain                 server holds ciphertext
   │                                                     it cannot read
   └───────────── later, elsewhere, unlinked ──────────────▶ withdraw
```

A note is a **bearer instrument**. Whoever can produce the nullifier and a valid
proof can spend it. Binding a note to a recipient key so that only that key can
spend it is a planned upgrade, not something implemented today. The interface
therefore tells people to claim a payment rather than leaving it unspent.

## The contract

`ShieldedPool.sol` enforces, with no help from the client:

- the deposit amount equals a denomination exactly (`WrongDepositAmount`);
- the commitment is inserted at a real leaf index;
- the root is one the contract has actually produced (`UnknownRoot`);
- the proof verifies against the deployed verifier;
- the nullifier has not been spent (`NoteAlreadySpent`);
- `msg.value` accounting keeps `pooledBalance` a lower bound on the contract's
  real balance;
- `fee <= denomination`, and a fee above zero requires a relayer address
  (`RelayerRequired`);
- checks-effects-interactions ordering, plus `ReentrancyGuard`;
- the only owner privilege is pausing. There is no function that moves pool funds
  to an operator, and one of the tests asserts exactly that.

## What is hidden, and what is not

**Hidden.** The link between a deposit and a withdrawal. Which deposit funded
which payment. How many payments one person has received. The amount, within the
denomination set.

**Not hidden.**
- That some address deposited a given denomination, and when.
- That some address withdrew a given denomination, and when.
- The relationship between a deposit and a withdrawal through **timing** and
  **gas payment**. This is the strongest remaining link and it is why the design
  wants a relayer.
- The size of the pool, and therefore the anonymity set. A pool with three notes
  in a denomination hides almost nothing. This is inherent to the construction
  and is stated in the interface, not glossed over.
- Anything the backend knows: it stores the payment graph, so a subpoena or a
  compromise of the server reveals private payment relationships even though the
  chain does not. This is a hosted-service trust assumption.

## Trusted setup

**This is a real limitation and it is not glossed over.**

`public/zk/*` and `contracts/src/Groth16Verifier.sol` were produced by
`scripts/zk/build.mjs` using a **single-party local setup**, recorded in
`public/zk/manifest.json` as `"ptauProvenance": "local-development-only"`. All
three public Powers of Tau mirrors were unreachable from the build machine.

A single-party Groth16 setup means whoever ran it could, in principle, forge a
proof for a false statement. That is acceptable only while no value is at stake,
which is the case today: the pool has no user-facing deposit or withdrawal flow
and holds nothing. **It is not acceptable for a public launch.** Before any
deployment that holds value, the ceremony must be replaced with a
multi-party one, the new verifier regenerated, and the whole thing re-tested.

Nothing in the application claims otherwise, and the deployment script records
the verifying-key hash on chain so a mismatch is detectable.

## Note and key handling

- Note secrets are 31 random bytes, kept below the BN254 scalar field so they are
  canonical by construction.
- Notes are never placed in a URL, a log, an analytics event, or a database
  column. The export string is `cloakpay1.<chainId>.<denominationId>.<nullifier>.<secret>`
  and the interface tells the user to treat it exactly like cash.
- A note delivered to a recipient is sealed to their P-256 viewing key with an
  ephemeral sender key, so two payments of the same size to the same person
  produce unrelated ciphertexts.
- If a note is lost, the funds behind it are unreachable. That is a property of
  bearer instruments, and the recovery screen says so.

## Viewing keys

A viewing key is generated per wallet and registered with the account. It receives
notes; it cannot spend. That much is implemented.

**Selective disclosure to a third party, revocation and rotation are not
implemented.** There is no "share my history" feature, and no plan to add a
switch that only hides rows in the interface and calls it a viewing key.

## Honest summary

CloakPay's shielded pool, as written and tested, is a legitimate design of the
kind deployed for exactly this purpose. It has not been deployed to a public
network, has not been audited, and currently rests on a development-only trusted
setup. Those three sentences are the difference between a privacy product and a
privacy claim.
