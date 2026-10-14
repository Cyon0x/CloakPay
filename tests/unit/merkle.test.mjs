import { test } from "node:test";
import assert from "node:assert/strict";
import { IncrementalMerkleTree, defaultHashes, rootFromProof, EMPTY_ROOT } from "../../src/protocol/merkle.js";
import { hashPair } from "../../src/protocol/poseidon.js";
import { createNote } from "../../src/protocol/note.js";

const CHAIN = 99801;
const DENOM = "hype-1";

test("zero hashes are the fixed point of Poseidon", () => {
  const zeros = defaultHashes(20);
  assert.equal(zeros[0], 0n);
  for (let i = 1; i <= 20; i++) {
    assert.equal(zeros[i], hashPair(zeros[i - 1], zeros[i - 1]));
  }
});

test("an empty tree has the all-zero default root", () => {
  const tree = new IncrementalMerkleTree(20);
  assert.equal(tree.size, 0);
  assert.equal(tree.root, EMPTY_ROOT);
  assert.equal(tree.root, defaultHashes(20)[20]);
});

test("inserting changes the root, and removing nothing preserves order", () => {
  const tree = new IncrementalMerkleTree(20);
  const before = tree.root;
  const note = createNote({ chainId: CHAIN, denominationId: DENOM });
  const index = tree.insert(note.commitment);
  assert.equal(index, 0);
  assert.notEqual(tree.root, before);
});

test("every leaf's proof recomputes the tree root", () => {
  const tree = new IncrementalMerkleTree(20);
  const notes = Array.from({ length: 7 }, () => createNote({ chainId: CHAIN, denominationId: DENOM }));
  for (const note of notes) tree.insert(note.commitment);

  for (let i = 0; i < notes.length; i++) {
    const proof = tree.proof(i);
    const recomputed = rootFromProof(notes[i].commitment, proof.pathElements, proof.pathIndices);
    assert.equal(recomputed, tree.root, `leaf ${i} proof did not reproduce the root`);
    assert.equal(proof.root, tree.root);
  }
});

test("a proof for one leaf does not verify another leaf", () => {
  const tree = new IncrementalMerkleTree(20);
  const notes = Array.from({ length: 4 }, () => createNote({ chainId: CHAIN, denominationId: DENOM }));
  for (const note of notes) tree.insert(note.commitment);

  const proof = tree.proof(0);
  const wrong = rootFromProof(notes[1].commitment, proof.pathElements, proof.pathIndices);
  assert.notEqual(wrong, tree.root);
});

test("tree rebuilds identically from a leaf list (what the indexer does)", () => {
  const notes = Array.from({ length: 5 }, () => createNote({ chainId: CHAIN, denominationId: DENOM }));
  const incremental = new IncrementalMerkleTree(20);
  for (const n of notes) incremental.insert(n.commitment);

  const rebuilt = new IncrementalMerkleTree(20, notes.map((n) => n.commitment));
  assert.equal(rebuilt.root, incremental.root);
  assert.equal(rebuilt.size, incremental.size);
});

test("capacity is enforced", () => {
  const tree = new IncrementalMerkleTree(2);
  tree.insert(1n);
  tree.insert(2n);
  tree.insert(3n);
  tree.insert(4n);
  assert.throws(() => tree.insert(5n), /full/);
});

test("out-of-range proofs are rejected rather than silently wrong", () => {
  const tree = new IncrementalMerkleTree(20);
  tree.insert(1n);
  assert.throws(() => tree.proof(5), /not in the tree/);
});
