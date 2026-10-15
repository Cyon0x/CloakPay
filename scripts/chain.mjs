#!/usr/bin/env node
/**
 * Chain tooling for Kinetiq Elysium.
 *
 *   node scripts/chain.mjs check     verify the network is what we think it is
 *   node scripts/chain.mjs compile   compile the contracts
 *   node scripts/chain.mjs deploy    deploy the verifier and the shielded pool
 *   node scripts/chain.mjs status    print what is recorded as deployed
 *
 * Nothing here invents an address. `deploy` writes
 * `src/config/pool-deployments.json` only after a broadcast that returned a
 * receipt, and it refuses to run against a chain id that is not expected.
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = fileURLToPath(new URL("../", import.meta.url));
const contractsDir = path.join(root, "contracts");
const deploymentsFile = path.join(root, "src", "config", "pool-deployments.json");

const envText = existsSync(path.join(root, ".env.local"))
  ? readFileSync(path.join(root, ".env.local"), "utf8")
  : "";
function fromEnvFile(name) {
  const match = envText.match(new RegExp(`^${name}=(.*)$`, "m"));
  return match?.[1]?.replace(/^["']|["']$/g, "").trim() || undefined;
}

const RPC_URL =
  process.env.ELYSIUM_RPC_URL ?? fromEnvFile("ELYSIUM_RPC_URL") ?? "https://testnet-rpc.elysium.kinetiq.xyz";
const EXPECTED_CHAIN_ID = Number(
  process.env.ELYSIUM_CHAIN_ID ?? fromEnvFile("ELYSIUM_CHAIN_ID") ?? 99801,
);

const command = process.argv[2] ?? "check";

async function rpc(method, params = []) {
  const response = await fetch(RPC_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    signal: AbortSignal.timeout(20_000),
  });
  const body = await response.json();
  if (body.error) throw new Error(`${method}: ${body.error.message}`);
  return body.result;
}

/**
 * EIP-196/197 pairing lives at 0x06 (ecAdd), 0x07 (ecMul) and 0x08 (ecPairing).
 * A Groth16 verifier deployed on a chain without them reverts on every proof.
 *
 * `eth_getCode` cannot answer this: precompiles are implemented natively and
 * have no bytecode even on Ethereum mainnet, so it returns "0x" everywhere.
 * The only real test is to call them and compare against the known results.
 */
const pad32 = (value) => BigInt(value).toString(16).padStart(64, "0");
/** (1,2) + (1,2) = 2*(1,2), the canonical ecAdd/ecMul vector. */
const DOUBLED_G1 = "0x030644e72e131a029b85045b68181585d97816a916871ca8d3c208c16d87cfd3" +
  "15ed738c0e0a7c92e7845f96b2ae9c0a68a6a449e3538fc7ff3ebf7a5a18a2c4";

async function precompilesPresent() {
  try {
    const [pairing, addition, multiplication] = await Promise.all([
      rpc("eth_call", [{ to: "0x0000000000000000000000000000000000000008", data: "0x" }, "latest"]),
      rpc("eth_call", [
        { to: "0x0000000000000000000000000000000000000006", data: `0x${pad32(1)}${pad32(2)}${pad32(1)}${pad32(2)}` },
        "latest",
      ]),
      rpc("eth_call", [
        { to: "0x0000000000000000000000000000000000000007", data: `0x${pad32(1)}${pad32(2)}${pad32(2)}` },
        "latest",
      ]),
    ]);
    // ecPairing over an empty input set is valid and must return exactly 1.
    const pairingOk = pairing?.endsWith("1") && pairing.length === 66;
    const additionOk = addition?.toLowerCase() === DOUBLED_G1;
    const multiplicationOk = multiplication?.toLowerCase() === DOUBLED_G1;
    return { ok: pairingOk && additionOk && multiplicationOk, pairingOk, additionOk, multiplicationOk };
  } catch {
    return { ok: false, pairingOk: false, additionOk: false, multiplicationOk: false };
  }
}

async function check() {
  const [chainIdHex, clientVersion, blockNumber, gasPriceHex, precompiles] = await Promise.all([
    rpc("eth_chainId"),
    rpc("web3_clientVersion"),
    rpc("eth_blockNumber"),
    rpc("eth_gasPrice"),
    precompilesPresent(),
  ]);

  const chainId = Number.parseInt(chainIdHex, 16);
  const rows = [
    ["rpc", RPC_URL],
    ["chain id", `${chainId} (${chainIdHex})`],
    ["expected", `${EXPECTED_CHAIN_ID}`],
    ["client", clientVersion],
    ["head block", Number.parseInt(blockNumber, 16)],
    ["gas price", `${(Number.parseInt(gasPriceHex, 16) / 1e9).toFixed(3)} gwei`],
    [
      "bn254 precompiles",
      precompiles.ok
        ? "verified live: ecAdd, ecMul and ecPairing all returned the expected values"
        : `MISSING (add=${precompiles.additionOk} mul=${precompiles.multiplicationOk} pairing=${precompiles.pairingOk})`,
    ],
  ];
  for (const [label, value] of rows) console.log(`${label.padEnd(20)} ${value}`);

  if (chainId !== EXPECTED_CHAIN_ID) {
    console.error(`\nRefusing to continue: chain id ${chainId} is not ${EXPECTED_CHAIN_ID}.`);
    process.exit(1);
  }
  if (!precompiles.ok) {
    console.error("\nThe BN254 precompiles did not answer correctly, so a Groth16 verifier cannot run here.");
    process.exit(1);
  }
  console.log("\nNetwork matches the configuration in src/config/chain.ts.");
}

function compile() {
  execFileSync("forge", ["build"], { cwd: contractsDir, stdio: "inherit" });
}

async function deploy() {
  const privateKey = process.env.DEPLOYER_PRIVATE_KEY ?? fromEnvFile("DEPLOYER_PRIVATE_KEY");
  if (!privateKey) {
    console.error(
      [
        "No deployer key.",
        "",
        "Set DEPLOYER_PRIVATE_KEY in .env.local to the private key of an account that already",
        "holds testnet HYPE. CloakPay will not generate or fund one for you, and it will not",
        "invent a deployment record if you skip this.",
      ].join("\n"),
    );
    process.exit(1);
  }

  const chainIdHex = await rpc("eth_chainId");
  const chainId = Number.parseInt(chainIdHex, 16);
  if (chainId !== EXPECTED_CHAIN_ID) {
    console.error(`Refusing to deploy: RPC reports chain id ${chainId}, expected ${EXPECTED_CHAIN_ID}.`);
    process.exit(1);
  }

  console.log(`Deploying to ${RPC_URL} (chain ${chainId})\n`);
  const output = execFileSync(
    "forge",
    ["script", "script/Deploy.s.sol", "--rpc-url", RPC_URL, "--broadcast", "--slow"],
    { cwd: contractsDir, encoding: "utf8", env: { ...process.env, DEPLOYER_PRIVATE_KEY: privateKey } },
  );
  process.stdout.write(output);

  const pick = (label) => output.match(new RegExp(`${label}\\s+(0x[0-9a-fA-F]{40})`))?.[1];
  const pool = pick("POOL");
  const verifier = pick("VERIFIER");
  if (!pool || !verifier) {
    console.error("\nCould not read the deployed addresses from the broadcast output. Nothing was recorded.");
    process.exit(1);
  }

  // The broadcast artifact is the authority on what was actually sent. Scraping
  // stdout for a hash is what previously recorded an empty string: the payload
  // is not printed in a shape a regex can be trusted to find.
  const broadcastFile = path.join(
    contractsDir,
    "broadcast",
    "Deploy.s.sol",
    String(chainId),
    "run-latest.json",
  );
  if (!existsSync(broadcastFile)) {
    console.error("\nNo broadcast artifact was written, so nothing was recorded.");
    process.exit(1);
  }
  const broadcast = JSON.parse(readFileSync(broadcastFile, "utf8"));
  const sends = broadcast.transactions ?? [];
  const receipts = new Map(
    (broadcast.receipts ?? []).map((receipt) => [receipt.transactionHash, receipt.status]),
  );
  const sendFor = (contractName) =>
    sends.find((entry) => (entry.contractName ?? "").toLowerCase() === contractName.toLowerCase());

  const verifierSend = sendFor("Groth16Verifier");
  const poolSend = sendFor("ShieldedPool");
  const poseidonSend = sendFor("PoseidonT3");

  if (!verifierSend?.hash || !poolSend?.hash) {
    console.error("\nThe broadcast artifact carries no transaction hashes. Nothing was recorded.");
    process.exit(1);
  }
  for (const entry of [verifierSend, poolSend, poseidonSend].filter(Boolean)) {
    const status = receipts.get(entry.hash);
    if (status !== "0x1") {
      console.error(`\nDeployment transaction ${entry.hash} did not succeed (status ${status}). Nothing was recorded.`);
      process.exit(1);
    }
  }

  const verifyingKeyFile = path.join(root, "circuits", "build", "withdraw_verification_key.json");
  const verifyingKeyHash = existsSync(verifyingKeyFile)
    ? createHash("sha256").update(readFileSync(verifyingKeyFile)).digest("hex")
    : "";

  const record = {
    chainId,
    pool,
    verifier,
    // The Poseidon library is linked into the pool, so it belongs in the record
    // with the rest: without it the pool cannot be reproduced.
    poseidonT3: poseidonSend?.contractAddress ?? null,
    deployedAt: new Date().toISOString(),
    txHash: poolSend.hash,
    verifierTxHash: verifierSend.hash,
    verifyingKeyHash,
    denominationId: "hype-0.1,hype-1,hype-10",
    circuit: "withdraw-20",
    transactions: [verifierSend, poolSend, poseidonSend]
      .filter(Boolean)
      .map((entry) => ({
        contract: entry.contractName,
        address: entry.contractAddress,
        txHash: entry.hash,
      })),
  };

  const deployments = JSON.parse(readFileSync(deploymentsFile, "utf8"));
  deployments[String(chainId)] = record;
  writeFileSync(deploymentsFile, `${JSON.stringify(deployments, null, 2)}\n`);

  console.log("\nRecorded in src/config/pool-deployments.json:");
  console.log(JSON.stringify(record, null, 2));
}

function status() {
  const deployments = JSON.parse(readFileSync(deploymentsFile, "utf8"));
  const entries = Object.entries(deployments);
  if (entries.length === 0) {
    console.log("No shielded pool deployment is recorded. Private payments stay switched off.");
    return;
  }
  for (const [chainId, record] of entries) {
    console.log(`chain ${chainId}`);
    for (const [key, value] of Object.entries(record)) console.log(`  ${key.padEnd(18)} ${value}`);
  }
}

const commands = { check, compile, deploy, status };
if (!commands[command]) {
  console.error(`Unknown command "${command}". Use: ${Object.keys(commands).join(", ")}`);
  process.exit(1);
}
await commands[command]();
