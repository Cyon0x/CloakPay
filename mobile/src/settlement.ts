/**
 * One public settlement, start to finish.
 *
 * The order is the same as the web app's and it matters: the server records the
 * attempt and returns the payout address, the device signs and broadcasts, and
 * only a real receipt moves the record to confirmed. A broadcast that never
 * confirms stays submitted, because that is what it actually is.
 *
 * Nothing here touches the shielded pool. A shielded settlement needs a
 * deployed pool and a proof, and this app says so rather than dressing a
 * visible transfer up as a private one.
 */
import { useCallback, useState } from "react";
import type { Hex } from "viem";
import { api } from "./api";
import { isUnlocked, unlockEnvelope, unlockWallet, type KeyEnvelope } from "./wallet";
import { awaitReceipt, broadcastTransfer, describeTransferError } from "./transfer";

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

async function patchPayment(paymentId: string, body: Record<string, unknown>) {
  try {
    await api(`/api/payments/${paymentId}`, { method: "PATCH", body: JSON.stringify(body) });
  } catch {
    // A status write that fails leaves the server record where it was, which is
    // never worse than the truth. The receipt on screen already reflects the
    // chain, and the next load reconciles.
  }
}

/** Pulls the sealed envelope from the server when this device does not have it. */
async function secretFor(passphrase: string) {
  const { wallet } = await api<{ wallet: { keyEnvelope: KeyEnvelope } | null }>("/api/wallet");
  if (!wallet?.keyEnvelope) {
    throw new Error("This account has no wallet yet. Finish setup first.");
  }
  return unlockEnvelope(wallet.keyEnvelope, passphrase);
}

export function useSettlement() {
  const [state, setState] = useState<SettlementState>({ phase: "idle" });

  const prepare = useCallback(async (payload: Record<string, unknown>) => {
    setState({ phase: "preparing" });
    try {
      const intent = await api<SettlementIntent>("/api/payments/intent", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      setState({ phase: "ready", intent });
      return intent;
    } catch (error) {
      setState({ phase: "failed", message: (error as Error).message });
      return null;
    }
  }, []);

  /**
   * Signs and broadcasts. `passphrase` is only needed when the wallet has not
   * been unlocked yet in this session.
   */
  const confirm = useCallback(
    async (passphrase?: string) => {
      setState((current) => {
        if (current.phase !== "ready") return current;
        return { phase: "signing" };
      });

      const intent = (state.phase === "ready" ? state.intent : null) as SettlementIntent | null;
      if (!intent) return;

      try {
        const secret = isUnlocked() ? await unlockWallet() : await secretFor(passphrase ?? "");
        const txHash = await broadcastTransfer({
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
        setState({ phase: "failed", message: describeTransferError(error), intent });
      }
    },
    [state],
  );

  const reset = useCallback(() => setState({ phase: "idle" }), []);

  return { state, prepare, confirm, reset };
}
