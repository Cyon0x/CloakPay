#!/usr/bin/env node
/**
 * Proof generation.
 *
 * Uses snarkjs with the published artifacts in public/zk. The same call is what
 * the browser makes, so a proof produced here and a proof produced in a browser
 * are the same object shape and are checked by the same verifier.
 *
 * Nothing here is simulated: the witness is computed by the compiled circuit,
 * and the resulting proof is only useful if the on-chain verifier accepts it.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import * as snarkjs from "snarkjs";

import { IncrementalMerkleTree, toCircuitPath } from "../../src/protocol/merkle.js";
import { createNote, encodeNote } from "../../src/protocol/note.js";
import { fieldToHex } from "../../src/protocol/field.js";
import { addressToField } from "../../src/protocol/field.js";
import { activeChain } from "../../src/config/chain.js";
import { DENOMINATIONS } from "../../src/config/pool.js";

const root = fileURLToPath(new URL("../../", import.meta.url));
export const WASM = path.join(root, "public", "zk", "withdraw.wasm");
export const ZKEY = path.join(root, "public", "zk", "withdraw.zkey");
export const TRANSFER_WASM = path.join(root, "public", "zk", "transfer.wasm");
export const TRANSFER_ZKEY = path.join(root, "public", "zk", "transfer.zkey");

/**
 * Builds the circuit input for spending `note` against `tree`.
 * @param {object} note      a note from createNote()
 * @param {IncrementalMerkleTree} tree the tree that contains the note's commitment
 * @param {number} leafIndex position of the commitment
 * @param {object} opts      { recipient, relayer, fee }
 */
export function buildWithdrawInput(note, tree, leafIndex, opts = {}) {
  const recipient = opts.recipient ?? "0x000000000000000000000000000000000000dEaD";
  const relayer = opts.relayer ?? "0x0000000000000000000000000000000000000000";
  const fee = opts.fee ?? 0n;

  const proof = tree.proof(leafIndex);
  const path = toCircuitPath(proof);

  return {
    input: {
      root: proof.root.toString(),
      nullifierHash: note.nullifierHash.toString(),
      recipient: addressToField(recipient).toString(),
      relayer: addressToField(relayer).toString(),
      fee: fee.toString(),
      nullifier: note.nullifier.toString(),
      secret: note.secret.toString(),
      pathElements: path.pathElements.map((value) => value.toString()),
      pathIndices: path.pathIndices.map((value) => value.toString()),
    },
    expectedRoot: proof.root,
    recipient,
    relayer,
    fee,
  };
}

export async function generateProof(input) {
  const { proof, publicSignals } = await snarkjs.groth16.fullProve(input, WASM, ZKEY);
  return { proof, publicSignals };
}

/**
 * Builds the circuit input for spending `note` and minting `outputNote`.
 *
 * The two notes must be of the same denomination: a shielded transfer swaps
 * one note for another of equal value, and the contract's fixed denominations
 * are what make that structural rather than something the circuit has to
 * arithmetic-check.
 */
export function buildTransferInput(note, tree, leafIndex, outputNote) {
  if (note.denominationId !== outputNote.denominationId) {
    throw new Error("a shielded transfer must keep the same denomination");
  }
  const proof = tree.proof(leafIndex);
  const path = toCircuitPath(proof);
  return {
    input: {
      root: proof.root.toString(),
      nullifierHash: note.nullifierHash.toString(),
      newCommitment: outputNote.commitment.toString(),
      nullifier: note.nullifier.toString(),
      secret: note.secret.toString(),
      pathElements: path.pathElements.map((value) => value.toString()),
      pathIndices: path.pathIndices.map((value) => value.toString()),
    },
    expectedRoot: proof.root,
    newCommitment: outputNote.commitment,
  };
}

export async function generateTransferProof(input) {
  const { proof, publicSignals } = await snarkjs.groth16.fullProve(
    input,
    TRANSFER_WASM,
    TRANSFER_ZKEY,
  );
  return { proof, publicSignals };
}

/** Converts a snarkjs proof into the four calldata arrays ShieldedPool expects. */
export async function toSolidityCalldata(proof, publicSignals) {
  const raw = await snarkjs.groth16.exportSolidityCallData(proof, publicSignals);
  const [pA, pB, pC, signals] = JSON.parse(`[${raw}]`);
  return { pA, pB, pC, publicSignals: signals };
}


/** Flattens proof + signals into scalar keys, because Solidity JSON parsing
 *  of nested arrays is error-prone. Each value is written as a hex string. */
function flattenForSolidity(calldata, publicSignals) {
  const { pA, pB, pC } = calldata;
  const flat = {
    sol_pA0: pA[0], sol_pA1: pA[1],
    sol_pB00: pB[0][0], sol_pB01: pB[0][1],
    sol_pB10: pB[1][0], sol_pB11: pB[1][1],
    sol_pC0: pC[0], sol_pC1: pC[1],
  };
  // One `sigN` per public signal, so the same flattener serves both circuits
  // rather than a 5-signal version and a 3-signal one that can drift apart.
  publicSignals.forEach((signal, index) => {
    flat[`sig${index}`] = BigInt(signal).toString();
  });
  return flat;
}

/* ── CLI: emit fixtures the Solidity tests consume ────────────────────────── */

async function emitFixtures() {
  const fixturesDir = path.join(root, "tests", "fixtures");
  mkdirSync(fixturesDir, { recursive: true });

  const chainId = activeChain.chainId;
  // The withdraw circuit does not reference the denomination at all -- a proof
  // is only ever checked against one denomination's tree. The id is recorded
  // for documentation, and is named explicitly rather than taken by index so
  // that adding a denomination cannot silently relabel an existing fixture.
  const denominationId = "hype-1";
  if (!DENOMINATIONS.some((d) => d.id === denominationId)) {
    throw new Error(`fixture denomination ${denominationId} is not in DENOMINATIONS`);
  }

  /* Fixture 1: the note is the only leaf, so the root is unambiguous. */
  {
    const note = createNote({ chainId, denominationId });
    const tree = new IncrementalMerkleTree(20);
    tree.insert(note.commitment);
    const built = buildWithdrawInput(note, tree, 0);
    const { proof, publicSignals } = await generateProof(built.input);
    const calldata = await toSolidityCalldata(proof, publicSignals);

    // The circuit's public signal order is a contract with the Solidity code.
    // Verify it here rather than trusting the documentation.
    const expected = [
      built.input.root,
      built.input.nullifierHash,
      built.input.recipient,
      built.input.relayer,
      built.input.fee,
    ];
    const actual = publicSignals.map((s) => BigInt(s).toString());
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
      throw new Error(
        `public signal order mismatch.\n  expected ${expected.join(",")}\n  actual   ${actual.join(",")}`,
      );
    }

    writeFileSync(
      path.join(fixturesDir, "withdraw-single-leaf.json"),
      JSON.stringify(
        {
          description: "A valid proof for a note that is the only leaf in the tree",
          circuit: "withdraw",
          depth: 20,
          denominationId,
          commitment: fieldToHex(note.commitment),
          nullifierHash: fieldToHex(note.nullifierHash),
          root: fieldToHex(built.expectedRoot),
          noteEncoded: encodeNote(note),
          recipient: built.recipient,
          relayer: built.relayer,
          fee: built.fee.toString(),
          publicSignals,
          calldata,
          ...flattenForSolidity(calldata, publicSignals),
        },
        null,
        2,
      ) + "\n",
    );
    console.log("  withdraw-single-leaf.json  ok");
  }

  /* Fixture 3: a proof bound to a relayer address and a fee. */
  {
    const note = createNote({ chainId, denominationId });
    const tree = new IncrementalMerkleTree(20);
    tree.insert(note.commitment);
    const relayer = "0x000000000000000000000000000000000000bEEF";
    const fee = 10_000_000_000_000_000n; // 0.01 HYPE
    const built = buildWithdrawInput(note, tree, 0, { relayer, fee });
    const { proof, publicSignals } = await generateProof(built.input);
    const calldata = await toSolidityCalldata(proof, publicSignals);

    writeFileSync(
      path.join(fixturesDir, "withdraw-with-relayer.json"),
      JSON.stringify(
        {
          description: "A valid proof bound to a relayer address and a 0.01 HYPE fee",
          circuit: "withdraw",
          depth: 20,
          denominationId,
          commitment: fieldToHex(note.commitment),
          nullifierHash: fieldToHex(note.nullifierHash),
          root: fieldToHex(built.expectedRoot),
          recipient: built.recipient,
          relayer,
          fee: fee.toString(),
          publicSignals,
          calldata,
          ...flattenForSolidity(calldata, publicSignals),
        },
        null,
        2,
      ) + "\n",
    );
    console.log("  withdraw-with-relayer.json  ok");
  }

  /* Fixture 2: four leaves, the note at index 3, so a deep path is exercised. */
  {
    const notes = Array.from({ length: 4 }, () => createNote({ chainId, denominationId }));
    const tree = new IncrementalMerkleTree(20);
    for (const n of notes) tree.insert(n.commitment);

    const target = notes[3];
    const built = buildWithdrawInput(target, tree, 3);
    const { proof, publicSignals } = await generateProof(built.input);
    const calldata = await toSolidityCalldata(proof, publicSignals);

    writeFileSync(
      path.join(fixturesDir, "withdraw-four-leaves.json"),
      JSON.stringify(
        {
          description: "A valid proof for the fourth leaf of a four-leaf tree",
          circuit: "withdraw",
          depth: 20,
          denominationId,
          commitments: notes.map((n) => fieldToHex(n.commitment)),
          nullifierHash: fieldToHex(target.nullifierHash),
          otherNullifierHashes: notes.slice(0, 3).map((n) => fieldToHex(n.nullifierHash)),
          root: fieldToHex(built.expectedRoot),
          recipient: built.recipient,
          relayer: built.relayer,
          fee: built.fee.toString(),
          publicSignals,
          calldata,
          commitmentsFlat: notes.map((n) => fieldToHex(n.commitment)),
          commitment0: fieldToHex(notes[0].commitment),
          commitment1: fieldToHex(notes[1].commitment),
          commitment2: fieldToHex(notes[2].commitment),
          commitment3: fieldToHex(notes[3].commitment),
          otherNullifier0: fieldToHex(notes[0].nullifierHash),
          otherNullifier1: fieldToHex(notes[1].nullifierHash),
          otherNullifier2: fieldToHex(notes[2].nullifierHash),
          ...flattenForSolidity(calldata, publicSignals),
        },
        null,
        2,
      ) + "\n",
    );
    console.log("  withdraw-four-leaves.json  ok");
  }

  /* ── Shielded transfer ────────────────────────────────────────────────── */
  /*
     A transfer spends one note and mints another of the same denomination.
     Two fixtures come out of one tree:
       * `transfer-single-leaf.json` proves the swap itself;
       * `transfer-then-withdraw.json` adds a withdraw proof for the note that
         was just minted, which is the only way to show the output note is
         genuinely spendable rather than merely well-formed.
  */
  {
    const spent = createNote({ chainId, denominationId });
    const created = createNote({ chainId, denominationId });

    // Tree before the transfer: the spent note is the only leaf.
    const before = new IncrementalMerkleTree(20);
    before.insert(spent.commitment);
    const built = buildTransferInput(spent, before, 0, created);
    const { proof, publicSignals } = await generateTransferProof(built.input);
    const calldata = await toSolidityCalldata(proof, publicSignals);

    const expectedSignals = [
      built.input.root,
      built.input.nullifierHash,
      built.input.newCommitment,
    ];
    const actualSignals = publicSignals.map((s) => BigInt(s).toString());
    if (JSON.stringify(actualSignals) !== JSON.stringify(expectedSignals)) {
      throw new Error(
        `transfer public signal order mismatch.\n  expected ${expectedSignals.join(",")}\n  actual   ${actualSignals.join(",")}`,
      );
    }

    writeFileSync(
      path.join(fixturesDir, "transfer-single-leaf.json"),
      JSON.stringify(
        {
          description: "A valid proof swapping one note for another of the same denomination",
          circuit: "transfer",
          depth: 20,
          denominationId,
          commitment: fieldToHex(spent.commitment),
          nullifierHash: fieldToHex(spent.nullifierHash),
          root: fieldToHex(built.expectedRoot),
          newCommitment: fieldToHex(created.commitment),
          spentNoteEncoded: encodeNote(spent),
          createdNoteEncoded: encodeNote(created),
          publicSignals,
          calldata,
          ...flattenForSolidity(calldata, publicSignals),
        },
        null,
        2,
      ) + "\n",
    );
    console.log("  transfer-single-leaf.json  ok");

    // Tree after the transfer: both commitments, the new one at index 1.
    const after = new IncrementalMerkleTree(20);
    after.insert(spent.commitment);
    after.insert(created.commitment);
    const recipient = "0x000000000000000000000000000000000000dEaD";
    const withdrawInput = buildWithdrawInput(created, after, 1, { recipient });
    const withdrawProof = await generateProof(withdrawInput.input);
    const withdrawCalldata = await toSolidityCalldata(
      withdrawProof.proof,
      withdrawProof.publicSignals,
    );

    writeFileSync(
      path.join(fixturesDir, "transfer-then-withdraw.json"),
      JSON.stringify(
        {
          description:
            "A transfer followed by a withdrawal of the note it created, proving the output note is spendable",
          circuit: "transfer+withdraw",
          depth: 20,
          denominationId,
          commitment: fieldToHex(spent.commitment),
          nullifierHash: fieldToHex(spent.nullifierHash),
          root: fieldToHex(built.expectedRoot),
          newCommitment: fieldToHex(created.commitment),
          rootAfterTransfer: fieldToHex(after.root),
          createdNullifierHash: fieldToHex(created.nullifierHash),
          createdLeafIndex: 1,
          recipient,
          transferPublicSignals: publicSignals,
          withdrawPublicSignals: withdrawProof.publicSignals,
          withdrawCalldata,
          transfer: flattenForSolidity(calldata, publicSignals),
          withdraw: flattenForSolidity(withdrawCalldata, withdrawProof.publicSignals),
        },
        null,
        2,
      ) + "\n",
    );
    console.log("  transfer-then-withdraw.json  ok");
  }

  console.log("\nFixtures written to tests/fixtures");
}

const invokedDirectly =
  process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (invokedDirectly) {
  const command = process.argv[2] ?? "fixtures";
  if (command === "fixtures") {
    console.log("Generating proof fixtures (this runs the real prover)");
    await emitFixtures();
  } else {
    console.error(`unknown command: ${command}`);
    process.exit(1);
  }
}
