pragma circom 2.0.0;

include "poseidon.circom";
include "mux1.circom";

/*
    MerkleProof(levels)

    Verifies that `leaf` sits at the position described by `pathIndices`
    inside a binary Poseidon Merkle tree, and outputs the implied root.

    The rules must match `src/protocol/merkle.ts` and
    `contracts/src/MerkleTreeWithHistory.sol` exactly:
      * an interior node is Poseidon(left, right)
      * index bit 0 means "this node is the left child"
      * index bit 1 means "this node is the right child"
      * absent siblings are the all-zero default at that height

    `pathIndices` is constrained to be binary, otherwise the two multiplexers
    below could disagree and the proof would not correspond to any real path.
*/
template MerkleProof(levels) {
    signal input leaf;
    signal input pathElements[levels];
    signal input pathIndices[levels];
    signal output root;

    component selectors[levels];
    component hashers[levels];
    signal levelHash[levels + 1];

    levelHash[0] <== leaf;

    for (var i = 0; i < levels; i++) {
        // The index bit must be exactly 0 or 1.
        pathIndices[i] * (1 - pathIndices[i]) === 0;

        // left  = pathIndices[i] ? pathElements[i] : levelHash[i]
        selectors[i] = Mux1();
        selectors[i].c[0] <== levelHash[i];
        selectors[i].c[1] <== pathElements[i];
        selectors[i].s <== pathIndices[i];

        hashers[i] = Poseidon(2);
        hashers[i].inputs[0] <== selectors[i].out;
        hashers[i].inputs[1] <== levelHash[i] + pathElements[i] - selectors[i].out;

        levelHash[i + 1] <== hashers[i].out;
    }

    root <== levelHash[levels];
}

/*
    Computes the all-zero default hash at each height, matching
    `defaultHashes()` in TypeScript and `_zeros` in the contract.
    Exposed as a component so tests can compare the two implementations.
*/
template ZeroHashes(levels) {
    signal output hashes[levels + 1];
    hashes[0] <== 0;
    component h[levels];
    for (var i = 0; i < levels; i++) {
        h[i] = Poseidon(2);
        h[i].inputs[0] <== hashes[i];
        h[i].inputs[1] <== hashes[i];
        hashes[i + 1] <== h[i].out;
    }
}
