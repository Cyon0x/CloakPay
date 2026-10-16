#!/usr/bin/env node
/**
 * A real shielded payment, sender to recipient, on Elysium testnet.
 *
 * This drives the *application's own client code* (`src/lib/client/shielded.ts`)
 * against the deployed pool. Nothing here re-implements the protocol: the
 * commitment, the Merkle path, the Groth16 proof, the nullifier and the sealed
 * note all come from the modules the browser uses. What this script adds is
 * two identities and a mailbox.
 *
 * The flow, in the order a user performs it:
 *
 *   1. the payer deposits 0.01 HYPE into the pool and keeps the note;
 *   2. the payer sends a shielded transfer to the recipient's username --
 *      a real Groth16 proof verified by the pool, producing a spent nullifier
 *      and a new commitment. No address is involved on either side;
 *   3. the recipient's device decrypts the note the server was handed as
 *      ciphertext, and finds it spendable because the chain says so;
 *   4. the recipient withdraws it to an external address with a second real
 *      proof.
 *
 * Requires a running server (for /api/notes and /api/users/<username>), the
 * recorded deployment, and a funded deployer key in .env.local to pay the two
 * test wallets' gas. The fixture users are deleted on the way out, including on
 * failure; every on-chain artefact it prints is permanent.
 *
 * Usage:
 *   APP_URL=http://127.0.0.1:3211 node --import tsx scripts/shielded-e2e.mjs
 */
import { readFileSync, existsSync } from "node:fs";
import { createHash, randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";
import path from "node:path";
import postgres from "postgres";
import { privateKeyToAccount, generateMnemonic, english, mnemonicToAccount } from "viem/accounts";
import { createPublicClient, createWalletClient, http, formatEther } from "viem";

const root = fileURLToPath(new URL("../", import.meta.url));

function loadEnv() {
  const values = { ...process.env };
  const file = path.join(root, ".env.local");
  if (existsSync(file)) {
    for (const line of readFileSync(file, "utf8").split("\n")) {
      const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (match && !values[match[1]]) values[match[1]] = match[2].replace(/^["']|["']$/g, "");
    }
  }
  return values;
}

const env = loadEnv();
const APP_URL = env.APP_URL || "http://127.0.0.1:3211";
if (!env.DATABASE_URL) {
  console.error("DATABASE_URL is not set.");
  process.exit(2);
}
if (!env.DEPLOYER_PRIVATE_KEY) {
  console.error("DEPLOYER_PRIVATE_KEY is not set, so the test wallets cannot be funded.");
  process.exit(2);
}

const { activeChain } = await import("../src/config/chain.ts");
const { DENOMINATIONS, getPoolDeployment } = await import("../src/config/pool.ts");
const crypto = await import("../src/protocol/crypto.ts");
const shielded = await import("../src/lib/client/shielded.ts");
const { fieldToHex } = await import("../src/protocol/field.ts");

const deployment = getPoolDeployment(activeChain.chainId);
if (!deployment) {
  console.error(`No shielded pool is recorded for chain ${activeChain.chainId}.`);
  process.exit(2);
}

const results = [];
const record = (name, ok, detail = "") => {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `\n        ${detail}` : ""}`);
};

const publicClient = createPublicClient({
  transport: http(activeChain.rpcUrl, { timeout: 30_000 }),
});

const sql = postgres(env.DATABASE_URL, {
  ssl: env.DATABASE_URL.includes("sslmode=require") ? "require" : undefined,
  max: 2,
  onnotice: () => {},
});

const DENOMINATION_ID = "hype-0.01";
const denomination = DENOMINATIONS.find((item) => item.id === DENOMINATION_ID);
if (!denomination) {
  console.error(`${DENOMINATION_ID} is not in the client's denomination set.`);
  process.exit(2);
}

const DENOMINATION_INDEX = BigInt(DENOMINATIONS.indexOf(denomination));
const POOL_ABI = [
  {
    type: "function",
    name: "currentRoot",
    stateMutability: "view",
    inputs: [{ type: "uint256" }],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "nullifierSpent",
    stateMutability: "view",
    inputs: [{ type: "uint256" }],
    outputs: [{ type: "bool" }],
  },
  {
    type: "function",
    name: "pooledBalance",
    stateMutability: "view",
    inputs: [{ type: "uint256" }],
    outputs: [{ type: "uint256" }],
  },
];

/** Enough for the payer's deposit and both signatures, and for the payee's withdrawal. */
const FUND_PAYER = 20_000_000_000_000_000n; // 0.02
const FUND_PAYEE = 5_000_000_000_000_000n; // 0.005

const tag = randomBytes(3).toString("hex");
const payerUsername = `e2epayer${tag}`;
const payeeUsername = `e2epayee${tag}`;

let payerRow = null;
let payeeRow = null;
let payer = null;
let payee = null;

/* ── the harness the browser gets for free ─────────────────────────────────── */

/**
 * The client calls `fetch("/api/notes")`, which in a browser resolves against
 * the page origin and carries the session cookie. Node has neither, so the
 * script supplies both: a base URL and the bearer token that
 * `src/lib/session.ts` already accepts for the native app.
 */
const realFetch = globalThis.fetch;
let bearer = null;
globalThis.fetch = (input, init = {}) => {
  const url =
    typeof input === "string" && input.startsWith("/") ? new URL(input, APP_URL).toString() : input;
  const headers = new Headers(init.headers ?? {});
  if (bearer) headers.set("authorization", `Bearer ${bearer}`);
  return realFetch(url, { ...init, headers });
};

async function api(pathname, init = {}) {
  const response = await globalThis.fetch(pathname, {
    ...init,
    headers: { "content-type": "application/json", ...(init.headers ?? {}) },
  });
  return { status: response.status, body: await response.json().catch(() => null) };
}

/** Creates a user with a wallet and a session, exactly as onboarding would. */
async function createIdentity(username) {
  const mnemonic = generateMnemonic(english);
  const address = mnemonicToAccount(mnemonic).address;
  const viewing = await crypto.createViewingKeyPair();
  const secret = { version: 1, mnemonic, viewing };

  const [user] = await sql`
    insert into users (username, display_name, onboarding_step, profile_visibility)
    values (${username}, ${username}, 'complete', 'public')
    returning id, username
  `;
  await sql`
    insert into wallets (user_id, address, key_envelope, viewing_public_key, viewing_key_id)
    values (
      ${user.id}, ${address},
      ${sql.json(await crypto.sealWithPassphrase(JSON.stringify(secret), `e2e-${tag}`))},
      ${sql.json(viewing.publicKey)},
      ${await crypto.viewingKeyId(viewing.publicKey)}
    )
  `;
  const token = randomBytes(32).toString("base64url");
  await sql`
    insert into sessions (user_id, token_hash, user_agent)
    values (${user.id}, ${createHash("sha256").update(token).digest("hex")}, 'shielded-e2e')
  `;
  return { ...user, address, secret, token };
}

/**
 * Returns what a throwaway test wallet has left to the wallet that funded it.
 *
 * The mnemonics here are generated per run and never written down, so anything
 * left behind is gone for good. An earlier version of this script did exactly
 * that and quietly drained the deployment wallet, which is what stopped the
 * suite from being re-runnable. A gas reserve stays behind so the sweep itself
 * can pay for its own transaction.
 */
async function sweep(identity) {
  const account = mnemonicToAccount(identity.secret.mnemonic);
  const to = privateKeyToAccount(env.DEPLOYER_PRIVATE_KEY).address;
  const client = createWalletClient({
    account,
    transport: http(activeChain.rpcUrl, { timeout: 30_000 }),
  });

  // This is the last transaction the key will ever sign, so it has to fit
  // exactly -- there is no second chance once the process exits. Budgeting
  // against `getGasPrice()` is not enough: viem sends an EIP-1559 fee cap,
  // which on this chain is about twice the legacy price, and that is what left
  // the first attempt a few thousand gas short of its own allowance. Budget
  // against the cap instead, and pin the cap so the cost is deterministic.
  let lastError;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const balance = await publicClient.getBalance({ address: account.address });
      const fees = await publicClient.estimateFeesPerGas();
      const maxFeePerGas = fees.maxFeePerGas ?? (await publicClient.getGasPrice()) * 2n;
      const reserve = maxFeePerGas * 21_000n * 3n;
      if (balance <= reserve) return null;
      const hash = await client.sendTransaction({
        to,
        value: balance - reserve,
        gas: 21_000n,
        maxFeePerGas,
        ...(fees.maxPriorityFeePerGas === undefined ? {} : { maxPriorityFeePerGas: fees.maxPriorityFeePerGas }),
      });
      await publicClient.waitForTransactionReceipt({ hash, timeout: 120_000 });
      return hash;
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}

/** Sends testnet HYPE from the deployment wallet so the test can pay gas. */
async function fund(address, amount) {
  const account = privateKeyToAccount(env.DEPLOYER_PRIVATE_KEY);
  const client = createWalletClient({
    account,
    transport: http(activeChain.rpcUrl, { timeout: 30_000 }),
  });
  const hash = await client.sendTransaction({ to: address, value: amount });
  const receipt = await publicClient.waitForTransactionReceipt({ hash, timeout: 120_000 });
  if (receipt.status !== "success") throw new Error(`funding ${address} reverted`);
  return hash;
}

const wei = (value) => `${(Number(value) / 1e18).toFixed(6)} HYPE`;

try {
  /* ── 0. the deployment the client will use ──────────────────────────────── */
  const pooledBefore = await publicClient.readContract({
    address: deployment.pool,
    abi: POOL_ABI,
    functionName: "pooledBalance",
    args: [DENOMINATION_INDEX],
  });
  const onChainRootBefore = await publicClient.readContract({
    address: deployment.pool,
    abi: POOL_ABI,
    functionName: "currentRoot",
    args: [DENOMINATION_INDEX],
  });
  record(
    "the client's recorded pool answers on chain",
    onChainRootBefore !== undefined,
    `pool ${deployment.pool} on chain ${activeChain.chainId}`,
  );

  /* ── 1. two identities ──────────────────────────────────────────────────── */
  payer = await createIdentity(payerUsername);
  payerRow = payer;
  payee = await createIdentity(payeeUsername);
  payeeRow = payee;
  record(
    "two test identities with viewing keys exist",
    Boolean(payer.address && payee.address),
    `@${payer.username} ${payer.address} · @${payee.username} ${payee.address}`,
  );

  // Say plainly when the deployment wallet cannot bankroll the run, rather
  // than surfacing a raw "exceeds the balance of the account" from viem.
  const deployerAddress = privateKeyToAccount(env.DEPLOYER_PRIVATE_KEY).address;
  const deployerBalance = await publicClient.getBalance({ address: deployerAddress });
  // The payer's float already has to cover the deposit, so counting the
  // denomination again would overstate the requirement. What does leave the
  // deployment wallet is the two floats, plus slack for the sweep transactions.
  const required = FUND_PAYER + FUND_PAYEE + 500_000_000_000_000n; // + 0.0005
  record(
    "the deployment wallet can bankroll the run",
    deployerBalance >= required,
    `deployer ${deployerAddress} holds ${wei(deployerBalance)}, needs at least ${wei(required)}`,
  );

  if (deployerBalance < required) {
    throw new Error(
      `The deployment wallet holds ${wei(deployerBalance)} and this run needs ${wei(required)} up front. ` +
        "Fund it from the Elysium testnet faucet and run again.",
    );
  }

  const fundPayer = await fund(payer.address, FUND_PAYER);
  const fundPayee = await fund(payee.address, FUND_PAYEE);
  const payerStart = await publicClient.getBalance({ address: payer.address });
  const payeeStart = await publicClient.getBalance({ address: payee.address });
  record(
    "both test wallets are funded from the deployment wallet",
    payerStart >= denomination.wei && payeeStart > 0n,
    `payer ${wei(payerStart)} (${fundPayer.slice(0, 12)}…) · payee ${wei(payeeStart)} (${fundPayee.slice(0, 12)}…)`,
  );

  /* ── 2. the payer opens a settlement, as the Send form does ─────────────── */
  bearer = payer.token;
  const intentResponse = await api("/api/payments/intent", {
    method: "POST",
    body: JSON.stringify({
      toUsername: payee.username,
      denominationId: DENOMINATION_ID,
      privacy: "private",
    }),
  });
  const intent = intentResponse.body?.data;
  record(
    "the intent endpoint opens a private payment without handing over an address",
    intentResponse.status === 201 &&
      intent?.privacy === "private" &&
      intent?.to === null &&
      intent?.recipientUsername === payee.username,
    `http=${intentResponse.status} to=${JSON.stringify(intent?.to)} recipient=${intent?.recipientUsername}`,
  );

  /* ── 3. deposit ─────────────────────────────────────────────────────────── */
  const deposited = await shielded.shield(payer.secret, DENOMINATION_ID);
  const depositReceipt = await publicClient.waitForTransactionReceipt({ hash: deposited.txHash });
  record(
    "the payer deposits a real 0.01 HYPE note into the pool",
    depositReceipt.status === "success" && deposited.blockNumber === depositReceipt.blockNumber,
    `tx ${deposited.txHash} block ${depositReceipt.blockNumber}`,
  );

  const payerNotes = await shielded.spendableNotes(payer.secret);
  const spendable = payerNotes.find((note) => note.note.denominationId === DENOMINATION_ID);
  record(
    "the deposited note is spendable, derived from the pool's own events",
    Boolean(spendable) && spendable.leafIndex !== null && shielded.balanceOf(payerNotes) === denomination.wei,
    `leaf ${spendable?.leafIndex} · balance ${wei(shielded.balanceOf(payerNotes))}`,
  );

  /* ── 4. the private transfer ────────────────────────────────────────────── */
  const payment = await shielded.payUsername(payer.secret, {
    note: spendable,
    recipientUsername: payee.username,
  });
  const transferReceipt = await publicClient.waitForTransactionReceipt({ hash: payment.txHash });
  const transferTx = await publicClient.getTransaction({ hash: payment.txHash });
  record(
    "the shielded transfer settles on chain with a real proof",
    transferReceipt.status === "success" && payment.blockNumber === transferReceipt.blockNumber,
    `tx ${payment.txHash} block ${transferReceipt.blockNumber} gas ${transferReceipt.gasUsed}`,
  );
  record(
    "the transfer spends the payer's nullifier and mints the recipient's commitment",
    (await publicClient.readContract({
      address: deployment.pool,
      abi: POOL_ABI,
      functionName: "nullifierSpent",
      args: [payment.spentNullifier],
    })) === true,
    `nullifier ${payment.spentNullifier} · new commitment ${payment.toCommitment}`,
  );
  record(
    "the transfer calldata never carries the recipient's address",
    !transferTx.input.toLowerCase().includes(payee.address.slice(2).toLowerCase()),
    `recipient ${payee.address} absent from calldata sent to the pool`,
  );
  record(
    "the payer no longer holds a spendable note of that size",
    shielded.balanceOf(await shielded.spendableNotes(payer.secret)) === 0n,
    "the note was consumed, not duplicated",
  );

  /* ── 5. the recipient ───────────────────────────────────────────────────── */
  bearer = payee.token;
  const payeeNotes = await shielded.loadNotes(payee.secret);
  const received = payeeNotes.find((note) => note.note.denominationId === DENOMINATION_ID);
  record(
    "the recipient decrypts the note the server only ever held as ciphertext",
    Boolean(received) && received.status !== "unknown" && received.commitment === payment.toCommitment,
    received && received.status !== "unknown"
      ? `commitment ${received.commitment} matches the on-chain leaf`
      : "the delivered envelope did not decrypt",
  );

  const payeeSpendable = await shielded.spendableNotes(payee.secret);
  record(
    "the received note is spendable by the recipient",
    payeeSpendable.length === 1 && payeeSpendable[0].commitment === payment.toCommitment,
    `spendable balance ${wei(shielded.balanceOf(payeeSpendable))}`,
  );

  // The commitment is stored the way `fieldToHex` writes it -- zero-padded to
  // 64 hex characters -- so looking it up with a bare `toString(16)` silently
  // found no row and the assertion below passed against `{}`. Look the row up
  // the same way the application stores it, and say so plainly when it is
  // missing: a check that cannot find its subject is not a check.
  const storedRow = (
    await sql`
      select note_envelope, status, origin from shielded_notes
      where user_id = ${payee.id} and commitment = ${fieldToHex(payment.toCommitment)}
    `
  )[0];
  const serialised = JSON.stringify(storedRow ?? {});
  const envelopeKeys = Object.keys(storedRow?.note_envelope ?? {}).sort().join(",");
  record(
    "the stored row is ciphertext only: no note secret, nullifier or amount",
    Boolean(storedRow) &&
      envelopeKeys === "alg,ct,epk,iv,v" &&
      !serialised.includes(received?.note.secret.toString() ?? "\u0000") &&
      !serialised.includes(received?.note.nullifier.toString() ?? "\u0000"),
    storedRow
      ? `envelope keys [${envelopeKeys}]`
      : `no shielded_notes row for commitment ${fieldToHex(payment.toCommitment)}`,
  );

  /* ── 6. withdraw ────────────────────────────────────────────────────────── */
  const withdrawal = await shielded.withdrawPrivately(payee.secret, {
    note: payeeSpendable[0],
    recipient: payee.address,
  });
  const withdrawReceipt = await publicClient.waitForTransactionReceipt({ hash: withdrawal.txHash });
  const payeeEnd = await publicClient.getBalance({ address: payee.address });
  record(
    "the recipient withdraws the shielded funds to an external address",
    withdrawReceipt.status === "success" && payeeEnd > payeeStart,
    `tx ${withdrawal.txHash} · payee ${wei(payeeStart)} -> ${wei(payeeEnd)}`,
  );
  record(
    "the recipient's note cannot be spent twice",
    (await shielded.spendableNotes(payee.secret)).length === 0,
    "no spendable notes remain",
  );

  /* ── 7. the payment record ──────────────────────────────────────────────── */
  bearer = payer.token;
  const confirmed = await api(`/api/payments/${intent.paymentId}`, {
    method: "PATCH",
    body: JSON.stringify({
      status: "confirmed",
      txHash: payment.txHash,
      nullifierHash: `0x${payment.spentNullifier.toString(16)}`,
    }),
  });
  const [paymentRow] = await sql`
    select privacy, status, tx_hash from payments where id = ${intent.paymentId}
  `;
  record(
    "the payment record is confirmed against the real transaction hash",
    confirmed.status === 200 &&
      paymentRow?.status === "confirmed" &&
      paymentRow?.tx_hash === payment.txHash &&
      paymentRow?.privacy === "private",
    `status ${paymentRow?.status} tx ${paymentRow?.tx_hash?.slice(0, 12)}…`,
  );

  /* ── 8. conservation ────────────────────────────────────────────────────── */
  // Measured against the balance before this run rather than against zero: an
  // earlier failed run can leave a funded note behind, and those notes are
  // genuinely unrecoverable (their secrets went with the fixture account), so
  // an absolute zero would be asserting something the pool is not obliged to
  // do. What must hold is that this payment neither created nor destroyed value.
  const pooledAfter = await publicClient.readContract({
    address: deployment.pool,
    abi: POOL_ABI,
    functionName: "pooledBalance",
    args: [DENOMINATION_INDEX],
  });
  record(
    "the payment conserved value: the deposit came back out, nothing was minted",
    pooledAfter === pooledBefore,
    `pooledBalance ${wei(pooledBefore)} -> ${wei(pooledAfter)}`,
  );
} catch (error) {
  record("the end-to-end flow ran without throwing", false, String(error?.stack ?? error));
} finally {
  // What is left in the throwaway wallets goes back to the deployment wallet
  // before anything else: those keys are discarded at the end of this process.
  for (const identity of [payer, payee]) {
    if (!identity) continue;
    try {
      const hash = await sweep(identity);
      record(
        `the balance of ${identity.address} went back to the deployment wallet`,
        true,
        hash ? `swept in ${hash.slice(0, 12)}…` : "there was nothing left to return",
      );
    } catch (sweepError) {
      record(
        `the balance of ${identity.address} went back to the deployment wallet`,
        false,
        `${sweepError.message} -- this balance is now unrecoverable`,
      );
    }
  }

  // The fixture accounts go; the on-chain evidence stays.
  try {
    if (payerRow) await sql`delete from payments where from_user_id = ${payerRow.id} or to_user_id = ${payerRow.id}`;
    if (payeeRow) await sql`delete from payments where from_user_id = ${payeeRow.id} or to_user_id = ${payeeRow.id}`;
    if (payerRow) await sql`delete from users where id = ${payerRow.id}`;
    if (payeeRow) await sql`delete from users where id = ${payeeRow.id}`;
  } catch (cleanupError) {
    console.error("cleanup failed:", cleanupError.message);
  }
  await sql.end();
  globalThis.fetch = realFetch;
}

const failed = results.filter((result) => result.ok === false);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
