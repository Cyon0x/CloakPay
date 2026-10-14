/**
 * Central network configuration.
 *
 * Every chain constant in CloakPay is read from here. Nothing else in the
 * codebase should hardcode a chain ID, RPC URL, explorer URL, or token
 * address.
 *
 * Verified 2026-10-14 against https://elysium.kinetiq.xyz/docs/building-on-elysium
 * and by querying eth_chainId against the live testnet RPC, which returned
 * 0x185d9 (99801) and a client version of `nitro/vlocal+...` — confirming the
 * chain is an Arbitrum Orbit (Nitro/ArbOS) deployment.
 */

export type ContractAddress = `0x${string}`;

export interface ChainContracts {
  /** Canonical CREATE2 multicall contract. */
  multicall3: ContractAddress;
  /** Canonical wrapped HYPE. */
  WHYPE: ContractAddress;
  /** Canonical USDC on Elysium testnet. Decimals must be read on-chain, not assumed. */
  USDC: ContractAddress;
  /** Canonical bridge / gateway router. */
  gatewayRouter: ContractAddress;
}

export interface ChainConfig {
  key: "elysium-testnet";
  name: string;
  chainId: number;
  hexChainId: string;
  rpcUrl: string;
  explorerUrl: string;
  faucetUrl: string;
  nativeToken: { symbol: string; name: string; decimals: number };
  contracts: ChainContracts;
  /**
   * Whether a Groth16 (BN254) verifier can run on this chain. Arbitrum Nitro
   * implements the EIP-196/197 precompiles at 0x06/0x07/0x08, so pairing
   * checks are available. Confirmed empirically by deploying and verifying
   * during `npm run chain:check`, never assumed.
   */
  bn254Precompiles: boolean;
}

const ELYSIUM_TESTNET: ChainConfig = {
  key: "elysium-testnet",
  name: "Elysium Testnet",
  chainId: 99801,
  hexChainId: "0x18699",
  rpcUrl: process.env.ELYSIUM_RPC_URL ?? "https://testnet-rpc.elysium.kinetiq.xyz",
  explorerUrl: "https://elysium.kinetiq.xyz/testnet-explorer",
  faucetUrl: "https://elysium.kinetiq.xyz/testnet-faucet",
  nativeToken: { symbol: "HYPE", name: "Hyperliquid", decimals: 18 },
  contracts: {
    multicall3: "0xcA11bde05977b3631167028862bE2a173976CA11",
    WHYPE: "0xCD57F65c2B0e5881CFC2E609F7CD53b746E1F234",
    USDC: "0x7D29d8047B905000459c0E80c34a26CeedcB47b2",
    gatewayRouter: "0x89659883a9d980925733B0A698F117AAb65ac718",
  },
  bn254Precompiles: true,
};

export const CHAINS = { "elysium-testnet": ELYSIUM_TESTNET } as const;

export const activeChain: ChainConfig = ELYSIUM_TESTNET;

export function explorerTx(hash: string): string {
  return `${activeChain.explorerUrl}/tx/${hash}`;
}

export function explorerAddress(address: string): string {
  return `${activeChain.explorerUrl}/address/${address}`;
}

/** Chain as an EIP-1193 / EIP-3085 wallet_addEthereumChain payload. */
export function walletAddChainParams() {
  return {
    chainId: activeChain.hexChainId,
    chainName: activeChain.name,
    nativeCurrency: {
      name: activeChain.nativeToken.name,
      symbol: activeChain.nativeToken.symbol,
      decimals: activeChain.nativeToken.decimals,
    },
    rpcUrls: [activeChain.rpcUrl],
    blockExplorerUrls: [activeChain.explorerUrl],
  };
}
