/**
 * Incremental Poseidon Merkle tree, depth 20.
 *
 * Three implementations of this structure exist and must agree exactly:
 *   1. this TypeScript version (used to build proofs in the client),
 *   2. `circuits/lib/merkleProof.circom` (used to verify membership),
 *   3. `contracts/src/MerkleTreeWithHistory.sol` (used to store the root).
 *
 * The agreed rules are:
 *   * empty leaf        = 0
 *   * node              = Poseidon(left, right)
 *   * leaf 0 is index 0, inserted left to right
 *   * a subtree's default hash at height h is Poseidon(d, d) where d is the
 *     default at height h-1, starting from 0
 *
 * `tests/zk/merkle.test.mjs` cross-checks this module against the values the
 * circuit accepts, so a mismatch fails a test rather than corrupting state.
 */
import { hashPair } from "./poseidon";
import type { Field, MerkleProof } from "./types";
import { MERKLE_TREE_DEPTH } from "../config/pool";

export const ZERO_LEAF: Field = 0n;

export function defaultHashes(depth: number): Field[] {
  const levels: Field[] = [ZERO_LEAF];
  for (let i = 1; i <= depth; i++) {
    levels.push(hashPair(levels[i - 1], levels[i - 1]));
  }
  return levels;
}

export const DEFAULTS = defaultHashes(MERKLE_TREE_DEPTH);
export const EMPTY_ROOT = DEFAULTS[MERKLE_TREE_DEPTH];

export class IncrementalMerkleTree {
  readonly depth: number;
  private readonly defaults: Field[];
  private readonly filledSubtrees: Field[];
  private leaves: Field[] = [];
  private currentRoot: Field;

  constructor(depth: number = MERKLE_TREE_DEPTH, leaves: Field[] = []) {
    if (depth < 1 || depth > 32) throw new Error(`unsupported tree depth: ${depth}`);
    this.depth = depth;
    this.defaults = defaultHashes(depth);
    this.filledSubtrees = this.defaults.slice(0, depth);
    this.currentRoot = this.defaults[depth];
    if (leaves.length) this.bulkInsert(leaves);
  }

  get size(): number {
    return this.leaves.length;
  }

  get root(): Field {
    return this.currentRoot;
  }

  get capacity(): number {
    return 2 ** this.depth;
  }

  /** Appends a leaf and returns its index. */
  insert(leaf: Field): number {
    if (this.leaves.length >= this.capacity) throw new Error("merkle tree is full");
    return this.bulkInsert([leaf]);
  }

  bulkInsert(leaves: Field[]): number {
    const firstIndex = this.leaves.length;
    for (const leaf of leaves) {
      this.insertOne(leaf);
    }
    return firstIndex;
  }

  private insertOne(leaf: Field) {
    const index = this.leaves.length;
    this.leaves.push(leaf);

    let current = leaf;
    let idx = index;
    for (let level = 0; level < this.depth; level++) {
      if (idx % 2 === 0) {
        this.filledSubtrees[level] = current;
        current = hashPair(current, this.defaults[level]);
      } else {
        current = hashPair(this.filledSubtrees[level], current);
      }
      idx = Math.floor(idx / 2);
    }
    this.currentRoot = current;
  }

  /** Builds a membership proof for a leaf that is already in the tree. */
  proof(index: number): MerkleProof {
    if (index < 0 || index >= this.leaves.length) {
      throw new Error(`leaf ${index} is not in the tree (size ${this.leaves.length})`);
    }
    let layer = this.leaves.slice();
    const pathElements: Field[] = [];
    const pathIndices: number[] = [];
    let idx = index;

    for (let level = 0; level < this.depth; level++) {
      const siblingIndex = idx ^ 1;
      const sibling = siblingIndex < layer.length ? layer[siblingIndex] : this.defaults[level];
      pathElements.push(sibling);
      pathIndices.push(idx & 1);

      const next: Field[] = [];
      for (let i = 0; i < layer.length; i += 2) {
        const left = layer[i];
        const right = i + 1 < layer.length ? layer[i + 1] : this.defaults[level];
        next.push(hashPair(left, right));
      }
      layer = next;
      idx >>= 1;
    }

    return { root: this.currentRoot, leafIndex: index, pathElements, pathIndices };
  }

  allLeaves(): Field[] {
    return this.leaves.slice();
  }
}

/** Recomputes a root from a leaf and its path. Pure function; used in tests. */
export function rootFromProof(
  leaf: Field,
  pathElements: Field[],
  pathIndices: number[],
): Field {
  if (pathElements.length !== pathIndices.length) {
    throw new Error("path elements and indices must have equal length");
  }
  let current = leaf;
  for (let i = 0; i < pathElements.length; i++) {
    current =
      pathIndices[i] === 1 ? hashPair(pathElements[i], current) : hashPair(current, pathElements[i]);
  }
  return current;
}

/** Provides the fixed-size arrays the circuit expects (padding with defaults). */
export function toCircuitPath(proof: MerkleProof, depth = MERKLE_TREE_DEPTH) {
  const elements = proof.pathElements.slice();
  const indices = proof.pathIndices.slice();
  const defaults = defaultHashes(depth);
  while (elements.length < depth) {
    elements.push(defaults[elements.length]);
    indices.push(0);
  }
  return { pathElements: elements, pathIndices: indices };
}
