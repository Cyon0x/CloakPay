import type { ContractAddress } from "./chain";
import recordedDeployments from "./pool-deployments.json";

/**
 * Shielded pool configuration.
 *
 * CloakPay's first privacy milestone is a shielded pool that holds the chain's
 * native token (HYPE). Using the native asset avoids depending on an
 * ERC-20 whose decimals and transfer semantics have not been verified on this
 * chain, and it keeps amount accounting in a single unit.
 */

export const MERKLE_TREE_DEPTH = 20;

/** Denominations are expressed in wei so accounting stays integer-only. */
export interface Denomination {
  id: string;
  label: string;
  wei: bigint;
}

export const DENOMINATIONS: Denomination[] = [
  { id: "hype-0.1", label: "0.1 HYPE", wei: 100_000_000_000_000_000n },
  { id: "hype-1", label: "1 HYPE", wei: 1_000_000_000_000_000_000n },
  { id: "hype-10", label: "10 HYPE", wei: 10_000_000_000_000_000_000n },
];

export function denominationById(id: string): Denomination | undefined {
  return DENOMINATIONS.find((d) => d.id === id);
}

/**
 * Deployed contract addresses. These are populated by `npm run chain:deploy`
 * and must never be invented. When unset, the app shows the pool as
 * unconfigured rather than pretending a pool exists.
 */
export interface PoolDeployment {
  chainId: number;
  pool: ContractAddress;
  verifier: ContractAddress;
  deployedAt: string;
  /** Transaction hash of the pool deployment, for explorer verification. */
  txHash: string;
  /** Transaction hash of the verifier deployment. */
  verifierTxHash?: string;
  /** Linked Poseidon library, deployed alongside the pool. */
  poseidonT3?: string | null;
  /** Every transaction the deployment sent, in the order it sent them. */
  transactions?: { contract: string; address: string; txHash: string }[];
  /** Hash of the verifying key used to generate the deployed verifier. */
  verifyingKeyHash: string;
  denominationId: string;
  /** The circuit the verifier was generated from, e.g. "withdraw-20". */
  circuit: string;
}

/**
 * Written by `npm run chain:deploy` after a broadcast succeeds, and by nothing
 * else. An empty object means the pool is not deployed anywhere, which is what
 * the UI reports.
 */
const deployments = recordedDeployments as Record<string, PoolDeployment | undefined>;

export function getPoolDeployment(chainId: number): PoolDeployment | undefined {
  return deployments[String(chainId)];
}

/**
 * Whether a shielded pool is actually reachable on the given chain.
 *
 * The whole product gates on this. Private payment flows, private payment
 * links, and the "Private" privacy label are only offered when it is true, so
 * an undeployed pool can never be papered over with a public transfer.
 */
export function poolIsDeployed(chainId: number): boolean {
  return Boolean(getPoolDeployment(chainId));
}

/**
 * Whether the browser can currently carry a shielded payment all the way
 * through: deposit, note sealing, Groth16 proof, withdraw.
 *
 * The contracts can be deployed long before that client flow ships, and the
 * two are not the same claim. Turning private payments on the moment an
 * address exists would let the UI offer a "private" payment that in fact
 * settles as an observable transfer, which is the single worst failure this
 * product could have. So the client half is tracked separately and stays off
 * until `src/lib/client/shielded.ts` exists and is exercised end to end.
 */
export const SHIELDED_CLIENT_READY = false;

/**
 * The only predicate the payment flows should ask. True means a private
 * payment can actually be executed, not merely that a contract exists.
 */
export function privatePaymentsAvailable(chainId: number): boolean {
  return SHIELDED_CLIENT_READY && poolIsDeployed(chainId);
}

export type PoolStatus = "ready" | "in-development" | "not-deployed";

/**
 * Three honest states, so every surface can say the same true thing:
 *   ready           a pool is deployed and the client flow can spend a note
 *   in-development  a pool is deployed, the browser flow is still being built
 *   not-deployed    no pool address has been recorded for this chain
 */
export function poolStatus(chainId: number): PoolStatus {
  if (!poolIsDeployed(chainId)) return "not-deployed";
  return SHIELDED_CLIENT_READY ? "ready" : "in-development";
}

/** One sentence describing the pool, shared by every screen that mentions it. */
export function poolStatusSentence(chainId: number): string {
  switch (poolStatus(chainId)) {
    case "ready":
      return "The shielded pool is live and private payments are open.";
    case "in-development":
      return "The shielded pool contracts are deployed on this network, but CloakPay's deposit and withdrawal flow is still being built, so a private payment cannot be completed yet.";
    default:
      return "The shielded pool has no deployment on this network yet, so a private payment cannot be made.";
  }
}
