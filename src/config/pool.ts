import type { ContractAddress } from "./chain";

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

const deployments: Record<string, PoolDeployment | undefined> = {
  // Populated at deploy time. Empty entries mean "not deployed yet".
};

export function getPoolDeployment(chainId: number): PoolDeployment | undefined {
  return deployments[String(chainId)];
}
