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
  /** Transaction hash of the deployment, for explorer verification. */
  txHash: string;
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
