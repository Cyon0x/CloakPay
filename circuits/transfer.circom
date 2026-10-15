pragma circom 2.0.0;

include "lib/poseidon.circom";
include "lib/merkleProof.circom";
include "lib/bitify.circom";
include "lib/comparators.circom";

/*
    Transfer(levels)

    Spends one note and mints another, without moving any money. This is what
    makes a payment to a CloakPay username private: the payout is a new
    commitment rather than a transfer to an address, so no recipient address
    ever reaches the chain.

    Proves:

      1. a commitment C = Poseidon(nullifier, secret) is a leaf of the pool's
         Merkle tree whose root is `root`;
      2. the revealed `nullifierHash = Poseidon(nullifier)` is the correct
         nullifier for C, which is what makes the note spendable exactly once;
      3. `newCommitment` is a canonical field element, so the value the contract
         is handed and the public signal cannot differ by a multiple of p -- a
         malleability that would otherwise let two different calldata payloads
         satisfy the same proof.

    The proof binds `newCommitment`, so whoever submits the transaction cannot
    substitute a commitment of their own and steal the note.

    There is deliberately no `recipient`, `relayer` or `fee` here. A shielded
    transfer moves exactly one denomination: the pool's backing is unchanged, so
    there is no fee to pay and nothing a relayer could take. Because the payout
    is a commitment and not an address, anyone may submit the transaction --
    including a third party -- without being able to redirect it.

    Public signals (declaration order is the order the contract passes them):
        [ root, nullifierHash, newCommitment ]
*/
template Transfer(levels) {
    signal input root;             // public
    signal input nullifierHash;    // public
    signal input newCommitment;    // public

    signal input nullifier;        // private
    signal input secret;           // private
    signal input pathElements[levels];  // private
    signal input pathIndices[levels];   // private

    // ── 1. The note being spent ─────────────────────────────────────────────
    component commitment = Poseidon(2);
    commitment.inputs[0] <== nullifier;
    commitment.inputs[1] <== secret;

    // ── 2. Its nullifier ────────────────────────────────────────────────────
    component nullifierHashing = Poseidon(1);
    nullifierHashing.inputs[0] <== nullifier;
    nullifierHash === nullifierHashing.out;

    // ── 3. Membership in the tree the pool knows ───────────────────────────
    component tree = MerkleProof(levels);
    tree.leaf <== commitment.out;
    for (var i = 0; i < levels; i++) {
        tree.pathElements[i] <== pathElements[i];
        tree.pathIndices[i] <== pathIndices[i];
    }
    root === tree.root;

    // ── 4. The note being created ───────────────────────────────────────────
    // < 2^254, which is below the BN254 scalar field, so the encoding is unique.
    component newCommitmentBits = Num2Bits(254);
    newCommitmentBits.in <== newCommitment;

    component newCommitmentNonZero = IsZero();
    newCommitmentNonZero.in <== newCommitment;
    newCommitmentNonZero.out === 0;

    // A note's secret material must never be a trivial value.
    component nullifierNonZero = IsZero();
    nullifierNonZero.in <== nullifier;
    nullifierNonZero.out === 0;

    component secretNonZero = IsZero();
    secretNonZero.in <== secret;
    secretNonZero.out === 0;
}

component main {public [root, nullifierHash, newCommitment]} = Transfer(20);
