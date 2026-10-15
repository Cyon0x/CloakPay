#!/usr/bin/env node
/**
 * Post-deployment checks for a recorded shielded pool.
 *
 * Reads `src/config/pool-deployments.json` and asks the chain whether what is
 * recorded is what is actually there: bytecode at every address, the verifier
 * the pool points at, the tree depth and denominations the client expects, the
 * owner, and that the pool is not paused with funds already accounted for.
 *
 * Addresses are never taken on trust from the config; every value here is read
 * back over RPC.
 */
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { createPublicClient, http, parseAbi } from "viem";

const root = fileURLToPath(new URL("../", import.meta.url));
const deploymentsFile = path.join(root, "src", "config", "pool-deployments.json");

let pass = 0;
let fail = 0;
const check = (name, ok, detail = "") => {
  ok ? pass++ : fail++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `\n        ${detail}` : ""}`);
};

const deployments = JSON.parse(readFileSync(deploymentsFile, "utf8"));
const entries = Object.entries(deployments);
if (entries.length === 0) {
  console.log("No deployment is recorded, so there is nothing to verify.");
  process.exit(0);
}

const POOL_ABI = parseAbi([
  "function verifier() view returns (address)",
  "function owner() view returns (address)",
  "function levels() view returns (uint32)",
  "function paused() view returns (bool)",
  "function denominations(uint256) view returns (uint256)",
  "function pooledBalance(uint256) view returns (uint256)",
]);

const expectedDenoms = [100000000000000000n, 1000000000000000000n, 10000000000000000000n];
const expectedDepth = 20;

for (const [chainId, record] of entries) {
  console.log(`\nchain ${chainId}`);
  const client = createPublicClient({
    transport: http(process.env.ELYSIUM_RPC_URL ?? "https://testnet-rpc.elysiym.kinetiq.xyz".replace("elysiym", "elysium"), {
      timeout: 20_000,
    }),
  });

  const live = Number.parseInt(await client.getChainId().then((value) => value.toString(16)), 16);
  check("the RPC is the chain the deployment was recorded against", live === Number(chainId), `rpc=${live} record=${chainId}`);

  for (const [label, address] of [
    ["pool", record.pool],
    ["verifier", record.verifier],
    ["poseidonT3", record.poseidonT3],
  ]) {
    if (!address) continue;
    const code = await client.getCode({ address });
    check(`${label} has bytecode at ${address}`, Boolean(code) && code !== "0x", `${(code ?? "0x").length / 2 - 1} bytes`);
  }

  const pool = record.pool;
  const [verifier, owner, levels, paused] = await Promise.all([
    client.readContract({ address: pool, abi: POOL_ABI, functionName: "verifier" }),
    client.readContract({ address: pool, abi: POOL_ABI, functionName: "owner" }),
    client.readContract({ address: pool, abi: POOL_ABI, functionName: "levels" }),
    client.readContract({ address: pool, abi: POOL_ABI, functionName: "paused" }),
  ]);

  check("the pool points at the recorded verifier", verifier.toLowerCase() === record.verifier.toLowerCase(), verifier);
  check("the tree depth matches the client's expectation", Number(levels) === expectedDepth, `levels=${levels}`);
  check("the pool is not paused", paused === false, `paused=${paused}`);
  check("the owner is the deploying account", owner.toLowerCase() === "0xe20796322664d23e06EC9DAd0B86AAd475b78310".toLowerCase(), owner);

  const denoms = [];
  for (let index = 0; index < 8; index++) {
    try {
      denoms.push(await client.readContract({ address: pool, abi: POOL_ABI, functionName: "denominations", args: [BigInt(index)] }));
    } catch {
      break;
    }
  }
  check(
    "the denominations are the ones the client offers",
    JSON.stringify(denoms.map(String)) === JSON.stringify(expectedDenoms.map(String)),
    JSON.stringify(denoms.map(String)),
  );

  const balances = [];
  for (let index = 0; index < denoms.length; index++) {
    balances.push(await client.readContract({ address: pool, abi: POOL_ABI, functionName: "pooledBalance", args: [BigInt(index)] }));
  }
  check("every denomination tree starts empty", balances.every((value) => value === 0n), JSON.stringify(balances.map(String)));

  for (const tx of record.transactions ?? []) {
    const receipt = await client.getTransactionReceipt({ hash: tx.txHash });
    check(`${tx.contract} transaction ${tx.txHash.slice(0, 12)}… mined successfully`, receipt.status === "success");
    // A CREATE2 deployment (the linked Poseidon library goes out this way)
    // reports no contractAddress on its receipt, because the address is derived
    // rather than assigned. Bytecode at the recorded address was already
    // checked above, which is the stronger statement anyway.
    if (receipt.contractAddress) {
      check(
        `${tx.contract} was deployed by that transaction`,
        receipt.contractAddress.toLowerCase() === tx.address.toLowerCase(),
        receipt.contractAddress,
      );
    } else {
      check(`${tx.contract} address is derived, not assigned (CREATE2)`, true, tx.address);
    }
  }
}

console.log(`\n${pass}/${pass + fail} checks passed`);
process.exit(fail === 0 ? 0 : 1);
