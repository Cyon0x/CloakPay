"use client";

import { useCallback, useState } from "react";
import { unlockWallet } from "@/lib/client/wallet";
import { awaitReceipt, broadcastNativeTransfer, describeTransferError } from "@/lib/client/transfer";
import type { Hex } from "viem";

export interface SettlementIntent {
  paymentId: string;
  to: `0x${string}`;
  amountWei: string;
  denominationId: string;
  asset: string;
}

export type SettlementState =
  | { phase: "idle" }
  | { phase: "preparing" }
  | { phase: "ready"; intent: SettlementIntent }
  | { phase: "signing" }
  | { phase: "submitted"; intent: SettlementIntent; txHash: Hex }
  | { phase: "confirmed"; intent: SettlementIntent; txHash: Hex; blockNumber: bigint | null }
  | { phase: "failed"; message: string; intent?: SettlementIntent; txHash?: Hex };

async function patchPayment(
  paymentId: string,
  body: Record<string, unknown>,
): Promise<boolean> {
  const response = await fetch(`/api/payments/${paymentId}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return response.ok;
}

/**
 * Drives one public settlement end to end.
 *
 * The order matters: the server records the attempt and returns the payout
 * address, the browser signs and broadcasts, and only a real receipt moves the
 * record to confirmed. A broadcast that never confirms stays submitted, which
 * is what it actually is.
 */
export function useSettlement() {
  const [state, setState] = useState<SettlementState>({ phase: "idle" });

  const prepare = useCallback(async (payload: Record<string, unknown>) => {
    setState({ phase: "preparing" });
    try {
      const response = await fetch("/api/payments/intent", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await response.json();
      if (!body.ok) {
        setState({ phase: "failed", message: body.error?.message ?? "Could not start the payment." });
        return null;
      }
      const intent: SettlementIntent = body.data;
      setState({ phase: "ready", intent });
      return intent;
    } catch {
      setState({ phase: "failed", message: "Could not reach CloakPay. Check your connection." });
      return null;
    }
  }, []);

  const confirm = useCallback(
    async (passphrase?: string) => {
      if (state.phase !== "ready") return;
      const intent = state.intent;
      setState({ phase: "signing" });
      try {
        const secret = await unlockWallet(passphrase);
        const txHash = await broadcastNativeTransfer({
          mnemonic: secret.mnemonic,
          to: intent.to,
          amountWei: BigInt(intent.amountWei),
        });
        setState({ phase: "submitted", intent, txHash });
        await patchPayment(intent.paymentId, { status: "submitted", txHash });

        const receipt = await awaitReceipt(txHash);
        if (receipt.status === "success") {
          await patchPayment(intent.paymentId, { status: "confirmed", txHash });
          setState({ phase: "confirmed", intent, txHash, blockNumber: receipt.blockNumber });
        } else if (receipt.status === "reverted") {
          await patchPayment(intent.paymentId, {
            status: "failed",
            txHash,
            failureReason: "reverted on chain",
          });
          setState({
            phase: "failed",
            message: "The network reverted this transfer. Nothing was sent.",
            intent,
            txHash,
          });
        }
        // "timeout" leaves the record submitted, which is accurate.
      } catch (error) {
        setState({
          phase: "failed",
          message: describeTransferError(error),
          intent,
        });
      }
    },
    [state],
  );

  const reset = useCallback(() => setState({ phase: "idle" }), []);

  return { state, prepare, confirm, reset };
}
