/** The Elysium chain, from the same constants the web app uses. */
import { defineChain } from "viem";
import Constants from "expo-constants";

const extra = (Constants.expoConfig?.extra ?? {}) as Record<string, unknown>;

export const activeChain = {
  name: "Elysium Testnet",
  chainId: Number(process.env.EXPO_PUBLIC_ELYSIUM_CHAIN_ID ?? extra.chainId ?? 99801),
  rpcUrl:
    process.env.EXPO_PUBLIC_ELYSIUM_RPC_URL ?? "https://testnet-rpc.elysium.kinetiq.xyz",
  explorerUrl:
    process.env.EXPO_PUBLIC_EXPLORER_URL ??
    (typeof extra.explorerUrl === "string" ? extra.explorerUrl : "https://elysium.kinetiq.xyz/testnet-explorer"),
  faucetUrl: "https://elysium.kinetiq.xyz/testnet-faucet",
  nativeToken: { symbol: "HYPE", name: "Hyperliquid", decimals: 18 },
} as const;

export const elysium = defineChain({
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

export const explorerTx = (hash: string) => `${activeChain.explorerUrl}/tx/${hash}`;
