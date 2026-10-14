"use client";

/**
 * Client-side view of the chain.
 *
 * The values come from `@/config/chain`, which is the single source of truth.
 * The public RPC and explorer URLs are read from `NEXT_PUBLIC_*` first because
 * the non-public variables are not present in a browser bundle; both fall back
 * to the verified Elysium testnet endpoints when nothing is configured.
 */
import { createPublicClient, defineChain, http, type Chain } from "viem";
import { activeChain } from "@/config/chain";

export const elysium: Chain = defineChain({
  id: activeChain.chainId,
  name: activeChain.name,
  nativeCurrency: {
    name: activeChain.nativeToken.name,
    symbol: activeChain.nativeToken.symbol,
    decimals: activeChain.nativeToken.decimals,
  },
  rpcUrls: { default: { http: [activeChain.rpcUrl] } },
  blockExplorers: { default: { name: "Elysium Explorer", url: activeChain.explorerUrl } },
  testnet: true,
});

export function publicClient() {
  return createPublicClient({ chain: elysium, transport: http(activeChain.rpcUrl, { timeout: 20_000 }) });
}

export function explorerTxUrl(hash: string): string {
  return `${activeChain.explorerUrl}/tx/${hash}`;
}
