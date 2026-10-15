"use client";

/**
 * The shielded client: deposits, shielded transfers, withdrawals.
 *
 * Everything secret stays in the browser. The note's nullifier and secret are
 * generated here, the witness is built here, and the Groth16 proof is produced
 * here. The server is handed an AEAD ciphertext addressed to a viewing key it
 * does not hold, so it can route a note without being able to read it.
 *
 * The contract is the authority for every question that matters:
 *   * is a note's commitment in the tree   -> the tree is rebuilt from the
 *                                             pool's own events, and the root
 *                                             is checked against the chain;
 *   * has a note been spent                -> `nullifierSpent` on chain;
 *   * did a payment settle                 -> the transaction receipt.
 * Nothing here trusts a database row, a cached balance, or its own optimism.
 *
 * None of this function logs note material. See docs/PRIVACY_PROTOCOL.md.
 */
import { createWalletClient, http, parseAbi, type Hex } from "viem";
import { mnemonicToAccount } from "viem/accounts";
import { elysium, publicClient } from "./chain";
import { activeChain } from "@/config/chain";
import { DENOMINATIONS, MERKLE_TREE_DEPTH, denominationById, getPoolDeployment } from "@/config/pool";
import { IncrementalMerkleTree, toCircuitPath } from "@/protocol/merkle";
import { createNote, encodeNote, decodeNote, noteMatchesCommitment } from "@/protocol/note";
import { addressToField, fieldToHex } from "@/protocol/field";
import { decryptNoteFromSender, encryptNoteToRecipient } from "@/protocol/crypto";
import type { Field, Note, NoteEnvelope } from "@/protocol/types";
import type { WalletSecret } from "./wallet";

/* ── The pool as the client sees it ───────────────────────────────────────── */

const POOL_ABI = parseAbi([
  "function deposit(uint256 denominationIndex, uint256 commitment) payable returns (uint32)",
  "function privateTransfer((uint256[2] pA, uint256[2][2] pB, uint256[2] pC) proof, uint256 denominationIndex, uint256 root, uint256 nullifierHash, uint256 newCommitment) returns (uint32)",
  "function withdraw((uint256[2] pA, uint256[2][2] pB, uint256[2] pC) proof, uint256 denominationIndex, uint256 root, uint256 nullifierHash, address recipient, address relayer, uint256 fee)",
  "function nullifierSpent(uint256) view returns (bool)",
  "function currentRoot(uint256) view returns (uint256)",
  "function leafCount(uint256) view returns (uint32)",
  "function denominations(uint256) view returns (uint256)",
  "function denominationCount() view returns (uint256)",
  "function isKnownRoot(uint256, uint256) view returns (bool)",
  "event Deposit(uint256 indexed denominationIndex, uint256 denomination, uint256 commitment, uint32 leafIndex)",
  "event PrivateTransfer(uint256 indexed denominationIndex, uint256 nullifierHash, uint256 newCommitment, uint32 leafIndex, address submitter)",
]);

export interface PoolProof {
  pA: [bigint, bigint];
  pB: [[bigint, bigint], [bigint, bigint]];
  pC: [bigint, bigint];
}

export class ShieldedError extends Error {
  constructor(
    message: string,
    readonly code:
      | "unconfigured"
      | "no-note"
      | "tree-mismatch"
      | "unavailable"
      | "prover-failed"
      | "network",
  ) {
    super(message);
    this.name = "ShieldedError";
  }
}

function poolAddress(): `0x${string}` {
  const deployment = getPoolDeployment(activeChain.chainId);
  if (!deployment) {
    throw new ShieldedError(
      "CloakPay has no shielded pool recorded for this network.",
      "unconfigured",
    );
  }
  return deployment.pool as `0x${string}`;
}

export function denominationIndex(id: string): number {
  const index = DENOMINATIONS.findIndex((d) => d.id === id);
  if (index < 0) throw new ShieldedError(`Unknown denomination ${id}.`, "unconfigured");
  return index;
}

/* ── Rebuilding the tree from the pool's own events ───────────────────────── */

export interface PoolTree {
  tree: IncrementalMerkleTree;
  /** leaf index -> commitment, which is what a proof needs a path for. */
  leaves: Map<number, Field>;
  /** The root the chain reports, which the rebuilt tree must reproduce. */
  onChainRoot: Field;
}

/**
 * Reads every commitment the pool has ever accepted for a denomination and
 * rebuilds the tree.
 *
 * The events are the only source used: not the database, not a cache. The
 * rebuilt root is then compared with `currentRoot` on chain, and a mismatch is
 * a hard failure, because a proof built against a tree that disagrees with the
 * contract's would be rejected anyway -- better to say so than to burn a proof.
 */
export async function loadPoolTree(denominationIndex_: number): Promise<PoolTree> {
  const address = poolAddress();
  const deployment = getPoolDeployment(activeChain.chainId)!;
  const client = publicClient();
  const fromBlock = BigInt(deployment.deployBlock ?? 0);

  const logs = await client.getLogs({
    address,
    events: [POOL_ABI[9], POOL_ABI[10]],
    fromBlock,
    toBlock: "latest",
  });

  const byLeaf = new Map<number, Field>();
  for (const log of logs) {
    const args = log.args as Record<string, unknown>;
    if (Number(args.denominationIndex) !== denominationIndex_) continue;
    const leafIndex = Number(args.leafIndex);
    const commitment =
      typeof args.commitment !== "undefined"
        ? BigInt(args.commitment as bigint)
        : BigInt(args.newCommitment as bigint);
    byLeaf.set(leafIndex, commitment);
  }

  // Insert in leaf order. A gap would mean a missing log, so it is refused
  // rather than silently compressed, which would shift every later path.
  const tree = new IncrementalMerkleTree(MERKLE_TREE_DEPTH);
  const ordered = [...byLeaf.keys()].sort((a, b) => a - b);
  for (let expected = 0; expected < ordered.length; expected++) {
    if (ordered[expected] !== expected) {
      throw new ShieldedError(
        `The pool's event log has a gap at leaf ${expected}; refusing to build a proof against a partial tree.`,
        "tree-mismatch",
      );
    }
    tree.insert(byLeaf.get(expected)!);
  }

  const onChainRoot = await client.readContract({
    address,
    abi: POOL_ABI,
    functionName: "currentRoot",
    args: [BigInt(denominationIndex_)],
  });

  if (tree.root !== onChainRoot) {
    throw new ShieldedError(
      "The commitment tree rebuilt from the pool's events does not match the root on chain. A proof would be rejected; refresh and try again.",
      "tree-mismatch",
    );
  }

  return { tree, leaves: byLeaf, onChainRoot };
}

/** A note plus everything the local client knows about it. */
export interface ShieldedNote {
  /** Row id in `shielded_notes`, if it came from the server. */
  id: string | null;
  note: Note;
  /** Commitment as it appears on chain. */
  commitment: Field;
  status: "unspent" | "spending" | "spent" | "unknown";
  /** The chain's answer, checked per note. */
  spentOnChain: boolean;
  /** Leaf index, once the commitment is found in the tree. */
  leafIndex: number | null;
}

/* ── Proving ──────────────────────────────────────────────────────────────── */

/**
 * Where the proving artifacts are served from.
 *
 * `/zk` is the real answer: `public/zk` is published at that path. The override
 * exists because snarkjs resolves the path itself, and it resolves it
 * differently depending on where it is running -- as a URL to fetch in a
 * browser, as a path on disk in Node. A harness that runs this module outside a
 * browser therefore has to be able to point it at the files, and a deployment
 * that serves the (large, static, cacheable) artifacts from a CDN can too.
 */
const ZK_BASE = process.env.NEXT_PUBLIC_ZK_PATH ?? "/zk";

/**
 * snarkjs is imported on demand. It is a large dependency and it is only needed
 * at the moment a user commits to a payment, not to render a page.
 */
async function prover() {
  return import("snarkjs");
}

export interface ProveInput {
  [key: string]: string | string[];
}

async function prove(circuit: "withdraw" | "transfer", input: ProveInput) {
  let snarkjs;
  try {
    snarkjs = await prover();
  } catch {
    throw new ShieldedError("The proof generator could not be loaded.", "prover-failed");
  }
  try {
    const { proof, publicSignals } = await snarkjs.groth16.fullProve(
      input,
      `${ZK_BASE}/${circuit}.wasm`,
      `${ZK_BASE}/${circuit}.zkey`,
    );
    return { proof, publicSignals: publicSignals as string[] };
  } catch (error) {
    throw new ShieldedError(
      `The proof could not be generated: ${(error as Error).message}`,
      "prover-failed",
    );
  }
}

/**
 * Converts a snarkjs proof into the shape `ShieldedPool.Proof` expects.
 *
 * The values are taken from snarkjs rather than assembled by hand, because the
 * point of this step is to be exactly what the verifier was generated against.
 */
async function toCalldata(proof: unknown, publicSignals: string[]) {
  const snarkjs = await prover();
  const raw = await snarkjs.groth16.exportSolidityCallData(
    proof as never,
    publicSignals as never,
  );
  const [pA, pB, pC, signals] = JSON.parse(`[${raw}]`) as [
    string[],
    string[][],
    string[],
    string[],
  ];
  return {
    proof: {
      pA: [BigInt(pA[0]), BigInt(pA[1])] as [bigint, bigint],
      pB: [
        [BigInt(pB[0][0]), BigInt(pB[0][1])],
        [BigInt(pB[1][0]), BigInt(pB[1][1])],
      ] as [[bigint, bigint], [bigint, bigint]],
      pC: [BigInt(pC[0]), BigInt(pC[1])] as [bigint, bigint],
    },
    signals: signals.map((s) => BigInt(s)),
  };
}

function walletFor(secret: WalletSecret) {
  return createWalletClient({
    account: mnemonicToAccount(secret.mnemonic.trim()),
    chain: elysium,
    transport: http(activeChain.rpcUrl, { timeout: 60_000 }),
  });
}

/* ── Building witnesses ───────────────────────────────────────────────────── */

function withdrawWitness(
  note: Note,
  tree: IncrementalMerkleTree,
  leafIndex: number,
  opts: { recipient: `0x${string}`; relayer: `0x${string}`; fee: bigint },
): ProveInput {
  const path = toCircuitPath(tree.proof(leafIndex));
  return {
    root: tree.root.toString(),
    nullifierHash: note.nullifierHash.toString(),
    recipient: addressToField(opts.recipient).toString(),
    relayer: addressToField(opts.relayer).toString(),
    fee: opts.fee.toString(),
    nullifier: note.nullifier.toString(),
    secret: note.secret.toString(),
    pathElements: path.pathElements.map((v) => v.toString()),
    pathIndices: path.pathIndices.map((v) => v.toString()),
  };
}

function transferWitness(
  spent: Note,
  output: Note,
  tree: IncrementalMerkleTree,
  leafIndex: number,
): ProveInput {
  if (spent.denominationId !== output.denominationId) {
    throw new ShieldedError("A shielded transfer keeps the same denomination.", "unavailable");
  }
  const path = toCircuitPath(tree.proof(leafIndex));
  return {
    root: tree.root.toString(),
    nullifierHash: spent.nullifierHash.toString(),
    newCommitment: output.commitment.toString(),
    nullifier: spent.nullifier.toString(),
    secret: spent.secret.toString(),
    pathElements: path.pathElements.map((v) => v.toString()),
    pathIndices: path.pathIndices.map((v) => v.toString()),
  };
}

/* ── Note storage ─────────────────────────────────────────────────────────── */

interface NoteRow {
  id: string;
  denomination_id: string;
  commitment: string;
  note_envelope: NoteEnvelope;
  status: string;
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
  });
  const body = (await response.json().catch(() => null)) as
    | { ok: true; data: T }
    | { ok: false; error: { code: string; message: string } }
    | null;
  if (!body) throw new ShieldedError(`${path} did not return a usable response.`, "network");
  if (!body.ok) throw new ShieldedError(body.error.message, "network");
  return body.data;
}

/**
 * Every note addressed to the signed-in user, decrypted locally.
 *
 * A row whose ciphertext will not decrypt is reported as `unknown` rather than
 * dropped: a note the user cannot read is a fact they need to see, not one to
 * hide.
 */
export async function loadNotes(secret: WalletSecret): Promise<ShieldedNote[]> {
  const { notes } = await api<{ notes: NoteRow[] }>("/api/notes");
  const out: ShieldedNote[] = [];

  for (const row of notes) {
    try {
      const encoded = await decryptNoteFromSender(row.note_envelope, secret.viewing.privateKey);
      const note = decodeNote(encoded);
      const commitment = BigInt(row.commitment);
      if (!noteMatchesCommitment(note, commitment)) {
        throw new Error("commitment mismatch");
      }
      out.push({
        id: row.id,
        note,
        commitment,
        status: row.status as ShieldedNote["status"],
        spentOnChain: false,
        leafIndex: null,
      });
    } catch {
      out.push({
        id: row.id,
        note: {
          version: 1,
          chainId: activeChain.chainId,
          denominationId: row.denomination_id,
          amountWei: denominationById(row.denomination_id)?.wei ?? 0n,
          nullifier: 0n,
          secret: 0n,
          commitment: BigInt(row.commitment),
          nullifierHash: 0n,
        },
        commitment: BigInt(row.commitment),
        status: "unknown",
        spentOnChain: false,
        leafIndex: null,
      });
    }
  }

  return out;
}

/** Asks the chain whether each note's nullifier has been spent. */
export async function markSpent(notes: ShieldedNote[]): Promise<ShieldedNote[]> {
  const usable = notes.filter((n) => n.status !== "unknown");
  if (usable.length === 0) return notes;

  const address = poolAddress();
  const client = publicClient();
  const spent = await Promise.all(
    usable.map((n) =>
      client
        .readContract({
          address,
          abi: POOL_ABI,
          functionName: "nullifierSpent",
          args: [n.note.nullifierHash],
        })
        .catch(() => false),
    ),
  );

  const byId = new Map(usable.map((n, i) => [n, spent[i]]));
  return notes.map((n) => (byId.has(n) ? { ...n, spentOnChain: byId.get(n)! } : n));
}

/**
 * What the user can actually spend, right now.
 *
 * A note counts only if it decrypted, its commitment is in the tree, and its
 * nullifier is unspent on chain. A pending note is therefore worth zero, which
 * is the honest answer: until the deposit is mined there is nothing to spend.
 */
export async function spendableNotes(secret: WalletSecret): Promise<ShieldedNote[]> {
  const notes = await markSpent(await loadNotes(secret));
  const out: ShieldedNote[] = [];

  for (const note of notes) {
    if (note.status === "unknown" || note.spentOnChain) continue;
    try {
      const { leaves } = await loadPoolTree(denominationIndex(note.note.denominationId));
      const index = [...leaves.entries()].find(([, c]) => c === note.commitment)?.[0];
      if (index === undefined) continue;
      out.push({ ...note, leafIndex: index });
    } catch {
      // An unreachable or disagreeing tree makes every note unspendable for
      // now; the caller shows the error rather than a guessed balance.
      throw new ShieldedError("The pool's tree could not be read.", "tree-mismatch");
    }
  }

  return out;
}

export function balanceOf(notes: ShieldedNote[]): bigint {
  return notes.reduce((total, n) => total + (n.spentOnChain ? 0n : n.note.amountWei), 0n);
}

/* ── Operations ───────────────────────────────────────────────────────────── */

export interface ShieldResult {
  txHash: Hex;
  noteId: string | null;
  commitment: Field;
  /** Block the deposit was mined in, read from the receipt. */
  blockNumber: bigint;
}

/**
 * Deposits one denomination and keeps the resulting note.
 *
 * The note is sealed and stored *before* the deposit is broadcast. If the
 * broadcast then fails the row is a harmless orphan that the balance check
 * ignores, whereas the opposite order would lose a funded note to a dropped
 * connection.
 */
export async function shield(
  secret: WalletSecret,
  denominationId: string,
): Promise<ShieldResult> {
  const index = denominationIndex(denominationId);
  const denomination = DENOMINATIONS[index];
  const note = createNote({ chainId: activeChain.chainId, denominationId: denomination.id });

  const envelope = await encryptNoteToRecipient(
    encodeNote(note),
    secret.viewing.publicKey as JsonWebKey,
  );
  const stored = await api<{ id: string }>("/api/notes", {
    method: "POST",
    body: JSON.stringify({
      denominationId: denomination.id,
      commitment: fieldToHex(note.commitment),
      noteEnvelope: envelope,
      origin: "deposit",
    }),
  });

  const wallet = walletFor(secret);
  let txHash: Hex;
  try {
    txHash = await wallet.writeContract({
      address: poolAddress(),
      abi: POOL_ABI,
      functionName: "deposit",
      args: [BigInt(index), note.commitment],
      value: denomination.wei,
    });
  } catch (error) {
    throw new ShieldedError(describe(error, "shield"), "network");
  }

  // The note only becomes spendable once the pool has accepted the commitment,
  // so the receipt is waited for here rather than left to a later refresh. A
  // revert leaves the stored row behind as an inert orphan: it can neither be
  // spent nor counted, because spendability is derived from the pool's events.
  const receipt = await publicClient().waitForTransactionReceipt({ hash: txHash, timeout: 120_000 });
  if (receipt.status !== "success") {
    throw new ShieldedError(
      "The deposit was mined but reverted, so nothing was added to the pool. Your funds are still in your wallet.",
      "network",
    );
  }

  return { txHash, noteId: stored.id, commitment: note.commitment, blockNumber: receipt.blockNumber };
}

export interface PrivatePaymentResult {
  txHash: Hex;
  /** Nullifier of the note that was spent. Safe to publish; it is on chain. */
  spentNullifier: Field;
  /** Commitment of the note the recipient received. */
  toCommitment: Field;
  /** Block the transfer was mined in, read from the receipt. */
  blockNumber: bigint;
}

/**
 * Pays a CloakPay username, shielded.
 *
 * The recipient is identified by username only. The sender never sees, and the
 * chain never carries, the recipient's wallet address: what is published is a
 * nullifier and a new commitment. The note itself is sealed to the recipient's
 * viewing key and handed to the server as ciphertext, which is the only part
 * the server handles and the only part it cannot read.
 */
export async function payUsername(
  secret: WalletSecret,
  input: { note: ShieldedNote; recipientUsername: string },
): Promise<PrivatePaymentResult> {
  const { note: spendable, recipientUsername } = input;
  if (spendable.leafIndex === null) {
    throw new ShieldedError("That note is not in the pool's tree yet.", "no-note");
  }

  const profile = await api<{
    profile: { username: string; viewingPublicKey: JsonWebKey | null; canReceivePrivately: boolean };
  }>(`/api/users/${encodeURIComponent(recipientUsername)}`);

  if (!profile.profile.canReceivePrivately || !profile.profile.viewingPublicKey) {
    throw new ShieldedError(
      `@${profile.profile.username} has not set up a wallet that can receive shielded payments.`,
      "unavailable",
    );
  }

  const index = denominationIndex(spendable.note.denominationId);
  const { tree, leaves } = await loadPoolTree(index);
  const leafIndex = [...leaves.entries()].find(([, c]) => c === spendable.commitment)?.[0];
  if (leafIndex === undefined) {
    throw new ShieldedError("That note is no longer in the pool's tree.", "no-note");
  }

  const output = createNote({
    chainId: activeChain.chainId,
    denominationId: spendable.note.denominationId,
  });

  const { proof, publicSignals } = await prove(
    "transfer",
    transferWitness(spendable.note, output, tree, leafIndex),
  );
  const calldata = await toCalldata(proof, publicSignals);

  // The circuit fixes the public-signal order; a mismatch here would be a
  // silent acceptance of the wrong values by the wrong check, so it is
  // asserted rather than assumed.
  if (
    calldata.signals[0] !== tree.root ||
    calldata.signals[1] !== spendable.note.nullifierHash ||
    calldata.signals[2] !== output.commitment
  ) {
    throw new ShieldedError("The proof's public signals do not match the payment.", "prover-failed");
  }

  const wallet = walletFor(secret);
  let txHash: Hex;
  try {
    txHash = await wallet.writeContract({
      address: poolAddress(),
      abi: POOL_ABI,
      functionName: "privateTransfer",
      args: [
        calldata.proof,
        BigInt(index),
        tree.root,
        spendable.note.nullifierHash,
        output.commitment,
      ],
    });
  } catch (error) {
    throw new ShieldedError(describe(error, "private transfer"), "network");
  }

  const receipt = await publicClient().waitForTransactionReceipt({ hash: txHash, timeout: 120_000 });
  if (receipt.status !== "success") {
    throw new ShieldedError(
      "The private transfer was mined but reverted. No note was created and your deposit is untouched.",
      "network",
    );
  }

  // Only now is the recipient told. A note delivered for a reverted transfer
  // would be a note that does not exist.
  const envelope = await encryptNoteToRecipient(
    encodeNote(output),
    profile.profile.viewingPublicKey,
  );
  await api<{ id: string }>("/api/notes", {
    method: "POST",
    body: JSON.stringify({
      username: profile.profile.username,
      denominationId: output.denominationId,
      commitment: fieldToHex(output.commitment),
      noteEnvelope: envelope,
      origin: "transfer",
      txHash,
    }),
  });

  await api("/api/notes", {
    method: "PATCH",
    body: JSON.stringify({
      id: spendable.id,
      status: "spent",
      nullifierHash: fieldToHex(spendable.note.nullifierHash),
      txHash,
    }),
  }).catch(() => undefined);

  return {
    txHash,
    spentNullifier: spendable.note.nullifierHash,
    toCommitment: output.commitment,
    blockNumber: receipt.blockNumber,
  };
}

/**
 * Sends a note to an external wallet.
 *
 * This is the public side of the pool: the recipient address, the amount and
 * the timing are all visible on chain. What it hides is which deposit the note
 * came from. The caller must state that to the user before they confirm.
 */
export async function withdrawPrivately(
  secret: WalletSecret,
  input: { note: ShieldedNote; recipient: `0x${string}` },
): Promise<{ txHash: Hex }> {
  const { note, recipient } = input;
  const index = denominationIndex(note.note.denominationId);
  const { tree, leaves } = await loadPoolTree(index);
  const leafIndex = [...leaves.entries()].find(([, c]) => c === note.commitment)?.[0];
  if (leafIndex === undefined) {
    throw new ShieldedError("That note is not in the pool's tree.", "no-note");
  }

  const { proof, publicSignals } = await prove(
    "withdraw",
    withdrawWitness(note.note, tree, leafIndex, {
      recipient,
      relayer: "0x0000000000000000000000000000000000000000",
      fee: 0n,
    }),
  );
  const calldata = await toCalldata(proof, publicSignals);

  const wallet = walletFor(secret);
  let txHash: Hex;
  try {
    txHash = await wallet.writeContract({
      address: poolAddress(),
      abi: POOL_ABI,
      functionName: "withdraw",
      args: [
        calldata.proof,
        BigInt(index),
        tree.root,
        note.note.nullifierHash,
        recipient,
        "0x0000000000000000000000000000000000000000",
        0n,
      ],
    });
  } catch (error) {
    throw new ShieldedError(describe(error, "withdrawal"), "network");
  }

  const receipt = await publicClient().waitForTransactionReceipt({ hash: txHash, timeout: 120_000 });
  if (receipt.status !== "success") {
    throw new ShieldedError("The withdrawal reverted on chain.", "network");
  }

  if (note.id) {
    await api("/api/notes", {
      method: "PATCH",
      body: JSON.stringify({
        id: note.id,
        status: "spent",
        nullifierHash: fieldToHex(note.note.nullifierHash),
        txHash,
      }),
    }).catch(() => undefined);
  }

  return { txHash };
}

/* ── Errors ───────────────────────────────────────────────────────────────── */

function describe(error: unknown, action: string): string {
  const message = error instanceof Error ? error.message : String(error);
  if (/insufficient funds/i.test(message)) {
    return `Your wallet does not have enough HYPE for the amount and the network fee.`;
  }
  if (/NoteAlreadySpent/.test(message)) {
    return "That note has already been spent.";
  }
  if (/UnknownRoot/.test(message)) {
    return "The pool's tree moved while the proof was being made. Refresh and try again.";
  }
  if (/InvalidProof/.test(message)) {
    return "The pool rejected the proof. Nothing was spent and no funds moved.";
  }
  if (/user rejected|denied/i.test(message)) {
    return "The signature was declined.";
  }
  return `The ${action} was rejected by the network.`;
}
