/**
 * Native HYPE transfers, signed on the device.
 *
 * The key never leaves the phone. The signed transaction goes straight to the
 * public Elysium RPC, so the result is observable on chain and is labelled
 * Public in every surface that shows it.
 */
import { createPublicClient, createWalletClient, http, type Hex } from "viem";
import { mnemonicToAccount } from "viem/accounts";
import { activeChain, elysium } from "./chain";

export function publicClient() {
  return createPublicClient({ chain: elysium, transport: http(activeChain.rpcUrl, { timeout: 20_000 }) });
}

export async function readBalance(address: `0x${string}`): Promise<bigint | null> {
  try {
    return await publicClient().getBalance({ address });
  } catch {
    return null;
  }
}

export async function estimateFee(address: `0x${string}`): Promise<bigint | null> {
  try {
    const gasPrice = await publicClient().getGasPrice();
    return gasPrice * 21_000n;
  } catch {
    return null;
  }
}

export async function broadcastTransfer(params: {
  mnemonic: string;
  to: `0x${string}`;
  amountWei: bigint;
}): Promise<Hex> {
  const account = mnemonicToAccount(params.mnemonic.trim());
  const client = createWalletClient({
    account,
    chain: elysium,
    transport: http(activeChain.rpcUrl, { timeout: 30_000 }),
  });
  return client.sendTransaction({ to: params.to, value: params.amountWei });
}

export async function awaitReceipt(hash: Hex) {
  try {
    const receipt = await publicClient().waitForTransactionReceipt({
      hash,
      timeout: 90_000,
      pollingInterval: 4_000,
    });
    return receipt.status === "success"
      ? ({ status: "success", blockNumber: receipt.blockNumber } as const)
      : ({ status: "reverted", blockNumber: receipt.blockNumber } as const);
  } catch {
    return { status: "timeout" } as const;
  }
}

export function describeTransferError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (/insufficient funds/i.test(message)) return "Not enough HYPE to cover the amount and the fee.";
  if (/nonce/i.test(message)) return "A transaction from this wallet is still pending. Try again shortly.";
  if (/network|fetch|timeout/i.test(message)) return "The Elysium RPC did not respond. Try again.";
  return "The network rejected this transfer.";
}
