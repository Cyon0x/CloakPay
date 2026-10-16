import type { ContractAddress } from "./chain";
import recordedDeployments from "./pool-deployments.json";
import { shieldedPoolEnabled } from "./features";

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
  { id: "hype-0.01", label: "0.01 HYPE", wei: 10_000_000_000_000_000n },
  { id: "hype-0.1", label: "0.1 HYPE", wei: 100_000_000_000_000_000n },
  { id: "hype-1", label: "1 HYPE", wei: 1_000_000_000_000_000_000n },
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
  /**
   * Block the pool was deployed in. The client rebuilds the commitment tree
   * from the pool's own events, and this is where it starts scanning, so it has
   * to be recorded rather than guessed.
   */
  deployBlock?: number;
  /** Transaction hash of the pool deployment, for explorer verification. */
  txHash: string;
  /** Transaction hash of the verifier deployment. */
  verifierTxHash?: string;
  /** Linked Poseidon library, deployed alongside the pool. */
  poseidonT3?: string | null;
  /** Verifier generated from `circuits/transfer.circom`. */
  transferVerifier?: string | null;
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
 *
 * It is on because that flow now runs: `scripts/shielded-e2e.mjs` deposits a
 * real note, proves and settles a shielded transfer to a second account,
 * decrypts the delivered note and withdraws it, on Elysium Testnet, against
 * this deployment. Flip it back to false the moment that stops being true --
 * an unavailable private payment is recoverable, a mislabelled one is not.
 */
export const SHIELDED_CLIENT_READY = true;

/**
 * The only predicate the payment flows should ask. True means a private
 * payment can actually be executed, not merely that a contract exists.
 *
 * The client flow being able to spend a note is not the same as CloakPay
 * offering the feature: the pool is switched off in `src/config/features.ts`
 * while username-to-username payments are the whole product, and this returns
 * false for as long as that is the case. The contracts, the circuits and the
 * client flow underneath are untouched.
 */
export function privatePaymentsAvailable(chainId: number): boolean {
  return SHIELDED_CLIENT_READY && shieldedPoolEnabled() && poolIsDeployed(chainId);
}

export type PoolStatus = "ready" | "paused" | "in-development" | "not-deployed";

/**
 * Honest states, so every surface can say the same true thing:
 *   paused          the pool exists and works, and CloakPay is not offering it
 *   ready           a pool is deployed and the client flow can spend a note
 *   in-development  a pool is deployed, the browser flow is still being built
 *   not-deployed    no pool address has been recorded for this chain
 */
export function poolStatus(chainId: number): PoolStatus {
  if (!poolIsDeployed(chainId)) return "not-deployed";
  if (!shieldedPoolEnabled()) return "paused";
  return SHIELDED_CLIENT_READY ? "ready" : "in-development";
}

/**
 * One short sentence describing the pool, shared by every screen that mentions
 * it. Written for the person reading the screen, not for the engineer who
 * built it: the pool's design, its contracts and its proofs are documented in
 * `docs/ARCHITECTURE.md`, and repeating any of that here is noise a user has to
 * read past to use the product.
 */
export function poolStatusSentence(chainId: number): string {
  switch (poolStatus(chainId)) {
    case "paused":
      return "Private payments are coming soon.";
    case "ready":
      return "The shielded pool is live.";
    case "in-development":
      return "The shielded pool is not open yet.";
    default:
      return "The shielded pool is not available on this network yet.";
  }
}
