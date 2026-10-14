"use client";

/**
 * Native HYPE transfers, signed in the browser.
 *
 * The account is derived from the user's own mnemonic, so the private key exists
 * only inside this tab for the moments it takes to sign. The transaction is
 * broadcast straight to the public Elysium RPC, exactly as any other wallet
 * would, which is why the UI labels the result Public: it is observable.
 *
 * Nothing here touches the shielded pool. Private payments use a different
 * path (deposit, prove, withdraw) that is gated on a real deployment.
 */
import { createWalletClient, http, type Hex } from "viem";
import { mnemonicToAccount, privateKeyToAccount } from "viem/accounts";
import { elysium, publicClient } from "./chain";

export interface FeeEstimate {
  gas: bigint;
  gasPrice: bigint;
  feeWei: bigint;
}

/**
 * A plain native transfer to an account costs exactly 21000 gas, so that is the
 * floor. Node estimation is used when it succeeds because it is more accurate
 * if the recipient turns out to be a contract, but an unfunded wallet must not
 * be shown "unavailable" for a fee that is perfectly well known.
 */
const NATIVE_TRANSFER_GAS = 21_000n;

export async function estimateNativeTransfer(
  from: `0x${string}`,
  to: `0x${string}`,
  amountWei: bigint,
): Promise<FeeEstimate | null> {
  try {
    const client = publicClient();
    const gasPrice = await client.getGasPrice();
    let gas = NATIVE_TRANSFER_GAS;
    try {
      const estimated = await client.estimateGas({ account: from, to, value: amountWei });
      if (estimated > gas) gas = estimated;
    } catch {
      // Balance too low to simulate, or the node refused. The 21000 floor holds.
    }
    return { gas, gasPrice, feeWei: gas * gasPrice };
  } catch {
    return null;
  }
}

export async function readBalance(address: `0x${string}`): Promise<bigint | null> {
  try {
    return await publicClient().getBalance({ address });
  } catch {
    return null;
  }
}

export async function readNonce(address: `0x${string}`): Promise<number | null> {
  try {
    return await publicClient().getTransactionCount({ address });
  } catch {
    return null;
  }
}

export function accountFromMnemonic(mnemonic: string) {
  return mnemonicToAccount(mnemonic.trim());
}

export function accountFromPrivateKey(key: Hex) {
  return privateKeyToAccount(key);
}

/** Broadcasts and returns the hash immediately so the UI can show it. */
export async function broadcastNativeTransfer(params: {
  mnemonic: string;
  to: `0x${string}`;
  amountWei: bigint;
}): Promise<Hex> {
  const account = accountFromMnemonic(params.mnemonic);
  const client = createWalletClient({
    account,
    chain: elysium,
    transport: http(elysium.rpcUrls.default.http[0], { timeout: 30_000 }),
  });
  return client.sendTransaction({ to: params.to, value: params.amountWei });
}

export type ReceiptOutcome =
  | { status: "success"; blockNumber: bigint }
  | { status: "reverted"; blockNumber: bigint }
  | { status: "timeout" };

export async function awaitReceipt(hash: Hex): Promise<ReceiptOutcome> {
  try {
    const receipt = await publicClient().waitForTransactionReceipt({
      hash,
      timeout: 90_000,
      pollingInterval: 3_000,
    });
    return receipt.status === "success"
      ? { status: "success", blockNumber: receipt.blockNumber }
      : { status: "reverted", blockNumber: receipt.blockNumber };
  } catch {
    // The transaction may still confirm; the caller must not treat this as failure.
    return { status: "timeout" };
  }
}

/** Normalises whatever an RPC throws into something safe to display. */
export function describeTransferError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (/insufficient funds/i.test(message)) {
    return "Your wallet does not have enough HYPE to cover the amount and the fee.";
  }
  if (/nonce/i.test(message)) {
    return "There is already a pending transaction from this wallet. Wait for it to confirm and retry.";
  }
  if (/gas required exceeds|exceeds block gas limit/i.test(message)) {
    return "The network rejected the fee. Try again in a moment.";
  }
  if (/network|fetch|timeout|ECONNREFUSED/i.test(message)) {
    return "The Elysium RPC did not respond. Check your connection and try again.";
  }
  return "The transfer was rejected by the network.";
}
