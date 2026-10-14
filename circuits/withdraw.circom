pragma circom 2.0.0;

include "lib/poseidon.circom";
include "lib/merkleProof.circom";
include "lib/bitify.circom";
include "lib/comparators.circom";

/*
    Withdraw(levels)

    Proves, in zero knowledge, that:

      1. a commitment C = Poseidon(nullifier, secret) is a leaf of the pool's
         Merkle tree whose root is `root`;
      2. the revealed `nullifierHash = Poseidon(nullifier)` is the correct
         nullifier for that commitment, which is what makes the note
         spendable exactly once; and
      3. the withdrawal is bound to a specific `recipient`, `relayer` and
         `fee`, so nobody who observes the transaction can redirect it.

    Nothing about the depositor, the deposit index, or which other notes exist
    is revealed.

    Public signals (in declaration order, which is the order the contract
    passes to the verifier):
        [ root, nullifierHash, recipient, relayer, fee ]
*/
template Withdraw(levels) {
    signal input root;            // public
    signal input nullifierHash;   // public
    signal input recipient;       // public: address as a field element
    signal input relayer;         // public: address as a field element
    signal input fee;             // public: wei paid to the relayer

    signal input nullifier;       // private
    signal input secret;          // private
    signal input pathElements[levels];  // private
    signal input pathIndices[levels];   // private

    // ── 1. Commitment ───────────────────────────────────────────────────────
    component commitment = Poseidon(2);
    commitment.inputs[0] <== nullifier;
    commitment.inputs[1] <== secret;

    // ── 2. Nullifier hash ───────────────────────────────────────────────────
    component nullifierHashing = Poseidon(1);
    nullifierHashing.inputs[0] <== nullifier;
    nullifierHash === nullifierHashing.out;

    // ── 3. Membership ───────────────────────────────────────────────────────
    component tree = MerkleProof(levels);
    tree.leaf <== commitment.out;
    for (var i = 0; i < levels; i++) {
        tree.pathElements[i] <== pathElements[i];
        tree.pathIndices[i] <== pathIndices[i];
    }
    root === tree.root;

    // ── 4. Canonical public values ──────────────────────────────────────────
    // Without these, `recipient` or `fee` could be supplied as a value that
    // differs mod p from the one the contract passes in, which would let two
    // different calldata payloads satisfy the same public signal.
    component recipientBits = Num2Bits(160);
    recipientBits.in <== recipient;

    component relayerBits = Num2Bits(160);
    relayerBits.in <== relayer;

    component feeBits = Num2Bits(96);
    feeBits.in <== fee;

    // A note's secret material must never be a trivial value.
    component nullifierNonZero = IsZero();
    nullifierNonZero.in <== nullifier;
    nullifierNonZero.out === 0;

    component secretNonZero = IsZero();
    secretNonZero.in <== secret;
    secretNonZero.out === 0;
}

component main {public [root, nullifierHash, recipient, relayer, fee]} = Withdraw(20);
