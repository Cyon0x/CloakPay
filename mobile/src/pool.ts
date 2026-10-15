/**
 * Pool configuration, read from the same endpoint the web app reads.
 *
 * Denomination sizes are not duplicated here on purpose: the pool accepts a
 * fixed set, and a second copy of that set is a second thing to keep in step.
 * `deployed` records whether a contract address exists on the server, while
 * `privateReady` is the narrower question of whether this app can actually
 * complete a private payment. Every privacy label depends on `privateReady`:
 * a deployed pool with no deposit and withdrawal flow cannot spend a note.
 */
import { api } from "./api";

export interface PoolDenomination {
  id: string;
  label: string;
  wei: string;
}

export interface PoolInfo {
  chain: {
    name: string;
    chainId: number;
    hexChainId: string;
    rpcUrl: string;
    explorerUrl: string;
    faucetUrl: string;
    nativeToken: { symbol: string; name: string; decimals: number };
  };
  pool: {
    depth: number;
    denominations: PoolDenomination[];
    deployed: boolean;
    privateReady: boolean;
    address: string | null;
    verifier: string | null;
    explorer: string | null;
  };
}

let cached: PoolInfo | null = null;

export async function loadPool(): Promise<PoolInfo> {
  if (cached) return cached;
  cached = await api<PoolInfo>("/api/pool", { anonymous: true });
  return cached;
}
