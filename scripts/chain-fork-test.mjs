#!/usr/bin/env node
/**
 * Runs the deployed shielded pool against a fork of Elysium testnet.
 *
 * Addresses come from `src/config/pool-deployments.json`, so the test always
 * exercises what is actually recorded as deployed, and no address is ever typed
 * into Solidity. Requires network access to the RPC.
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = fileURLToPath(new URL("../", import.meta.url));
const deployments = JSON.parse(
  readFileSync(path.join(root, "src", "config", "pool-deployments.json"), "utf8"),
);

const entries = Object.entries(deployments);
if (entries.length === 0) {
  console.error("No deployment is recorded. Nothing to fork-test.");
  process.exit(1);
}

const [chainId, record] = entries[0];
console.log(`Forking chain ${chainId} to exercise the deployed pool at ${record.pool}\n`);

execFileSync(
  "forge",
  ["test", "--match-path", "test/ShieldedPoolFork.t.sol", "-vv"],
  {
    cwd: path.join(root, "contracts"),
    stdio: "inherit",
    env: {
      ...process.env,
      POOL_ADDRESS: record.pool,
      VERIFIER_ADDRESS: record.verifier,
      EXPECTED_CHAIN_ID: String(chainId),
      ELYSIUM_RPC_URL:
        process.env.ELYSIUM_RPC_URL ?? "https://testnet-rpc.elysium.kinetiq.xyz",
    },
  },
);
