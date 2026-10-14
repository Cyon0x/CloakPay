#!/usr/bin/env node
/**
 * Builds the withdraw circuit end to end:
 *
 *   1. compile circom -> r1cs, wasm, sym
 *   2. obtain Powers of Tau (reuse, download, or generate locally)
 *   3. Groth16 setup + a phase-2 contribution
 *   4. export verifying key + Solidity verifier
 *   5. copy the proving artifacts the browser needs into public/zk
 *
 * SECURITY: by default this generates a *local, single-party* setup. That is
 * fine for testnet development and is NOT safe for mainnet. See
 * docs/PRIVACY_PROTOCOL.md ("Trusted setup") for what a production ceremony
 * would need to look like.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, copyFileSync, statSync, readFileSync } from "node:fs";
import { createHash, randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = fileURLToPath(new URL("../../", import.meta.url));
const circuits = path.join(root, "circuits");
const build = path.join(circuits, "build");
const ptauDir = path.join(circuits, "ptau");
const publicZk = path.join(root, "public", "zk");

const CIRCOM = path.join(root, "node_modules", ".bin", "circom2");
const SNARKJS = path.join(root, "node_modules", ".bin", "snarkjs");
const PTAU_POWER = Number(process.env.PTAU_POWER ?? 14);
const CIRCUIT = process.env.CIRCUIT ?? "withdraw";

const PTAU_MIRRORS = [
  `https://storage.googleapis.com/zkevm/ptau/powersOfTau28_hez_final_${PTAU_POWER}.ptau`,
  `https://hermez.s3-eu-west-1.amazonaws.com/powersOfTau28_hez_final_${PTAU_POWER}.ptau`,
  `https://snark-artifacts.pse.dev/powersOfTau28_hez_final_${PTAU_POWER}.ptau`,
];

function run(bin, args, label) {
  process.stdout.write(`  ${label} ... `);
  try {
    execFileSync(bin, args, { stdio: ["ignore", "pipe", "pipe"], maxBuffer: 1 << 28 });
    console.log("ok");
  } catch (error) {
    console.log("FAILED");
    console.error(error.stderr?.toString() ?? error.message);
    process.exit(1);
  }
}

mkdirSync(build, { recursive: true });
mkdirSync(ptauDir, { recursive: true });
mkdirSync(publicZk, { recursive: true });

/* 1 ── compile ────────────────────────────────────────────────────────────── */
if (!existsSync(path.join(build, `${CIRCUIT}.r1cs`))) {
  console.log("Compiling circuit");
  run(CIRCOM, [path.join(circuits, `${CIRCUIT}.circom`), "--r1cs", "--wasm", "--sym", "-o", build], "circom");
} else {
  console.log("Reusing existing r1cs (delete circuits/build to force a recompile)");
}

const constraints = execFileSync(SNARKJS, ["r1cs", "info", path.join(build, `${CIRCUIT}.r1cs`)])
  .toString()
  .trim();
console.log(`\nCircuit shape:\n${constraints}\n`);

/* 2 ── powers of tau ──────────────────────────────────────────────────────── */
const ptauPath = path.join(ptauDir, `pot${PTAU_POWER}_final.ptau`);
let ptauProvenance = "reused";

if (!existsSync(ptauPath)) {
  let downloaded = false;
  for (const url of PTAU_MIRRORS) {
    process.stdout.write(`  downloading ${path.basename(url)} ... `);
    try {
      execFileSync("curl", ["-sSL", "-m", "300", "-f", "-o", ptauPath, url], { stdio: "pipe" });
      console.log("ok");
      downloaded = true;
      ptauProvenance = "public-multi-party-ceremony";
      break;
    } catch {
      console.log("unavailable");
    }
  }

  if (!downloaded) {
    console.log("  No public ceremony file reachable. Generating a local one.");
    console.log("  This is a DEVELOPMENT setup and must not be used for mainnet values.");
    ptauProvenance = "local-development-only";
    const seed0 = path.join(ptauDir, `pot${PTAU_POWER}_0000.ptau`);
    const seed1 = path.join(ptauDir, `pot${PTAU_POWER}_0001.ptau`);
    run(SNARKJS, ["powersoftau", "new", "bn128", String(PTAU_POWER), seed0, "-v"], "powersoftau new");
    const entropy = randomBytes(64).toString("hex");
    run(
      SNARKJS,
      ["powersoftau", "contribute", seed0, seed1, `--name=CloakPay development setup`, `-e=${entropy}`, "-v"],
      "powersoftau contribute",
    );
    run(SNARKJS, ["powersoftau", "prepare", "phase2", seed1, ptauPath, "-v"], "prepare phase2");
  }
}

/* 3 ── groth16 setup ──────────────────────────────────────────────────────── */
const zkey0 = path.join(build, `${CIRCUIT}_0000.zkey`);
const zkeyFinal = path.join(build, `${CIRCUIT}_final.zkey`);
const vkeyPath = path.join(build, `${CIRCUIT}_verification_key.json`);

if (!existsSync(zkey0)) {
  run(SNARKJS, ["groth16", "setup", path.join(build, `${CIRCUIT}.r1cs`), ptauPath, zkey0], "groth16 setup");
}

run(
  SNARKJS,
  [
    "zkey",
    "contribute",
    zkey0,
    zkeyFinal,
    `--name=CloakPay phase2 contribution`,
    `-e=${randomBytes(64).toString("hex")}`,
    "-v",
  ],
  "zkey contribute",
);

run(SNARKJS, ["zkey", "export", "verificationkey", zkeyFinal, vkeyPath], "export verification key");

const verifierOut = path.join(root, "contracts", "src", "Groth16Verifier.sol");
run(SNARKJS, ["zkey", "export", "solidityverifier", zkeyFinal, verifierOut], "export solidity verifier");

/* 4 ── publish proving artifacts ──────────────────────────────────────────── */
const wasmSrc = path.join(build, `${CIRCUIT}_js`, `${CIRCUIT}.wasm`);
copyFileSync(wasmSrc, path.join(publicZk, `${CIRCUIT}.wasm`));
copyFileSync(zkeyFinal, path.join(publicZk, `${CIRCUIT}.zkey`));

const hashFile = (p) => createHash("sha256").update(readFileSync(p)).digest("hex");
const manifest = {
  circuit: CIRCUIT,
  depth: 20,
  publicSignals: ["root", "nullifierHash", "recipient", "relayer", "fee"],
  ptauPower: PTAU_POWER,
  ptauProvenance,
  artifacts: {
    wasm: { file: `${CIRCUIT}.wasm`, bytes: statSync(path.join(publicZk, `${CIRCUIT}.wasm`)).size, sha256: hashFile(path.join(publicZk, `${CIRCUIT}.wasm`)) },
    zkey: { file: `${CIRCUIT}.zkey`, bytes: statSync(path.join(publicZk, `${CIRCUIT}.zkey`)).size, sha256: hashFile(path.join(publicZk, `${CIRCUIT}.zkey`)) },
    verifier: { file: "contracts/src/Groth16Verifier.sol", sha256: hashFile(verifierOut) },
    verificationKey: { file: `circuits/build/${CIRCUIT}_verification_key.json`, sha256: hashFile(vkeyPath) },
  },
  generatedAt: new Date().toISOString(),
};

const { writeFileSync } = await import("node:fs");
writeFileSync(path.join(publicZk, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");

console.log(`\nProving artifacts published to public/zk (trusted setup: ${ptauProvenance})`);
console.log(`  withdraw.wasm  ${(manifest.artifacts.wasm.bytes / 1024).toFixed(0)} KB`);
console.log(`  withdraw.zkey  ${(manifest.artifacts.zkey.bytes / 1024 / 1024).toFixed(1)} MB`);
console.log(`  verifier       contracts/src/Groth16Verifier.sol`);
