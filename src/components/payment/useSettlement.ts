"use client";

import { useCallback, useState } from "react";
import { unlockWallet } from "@/lib/client/wallet";
import { awaitReceipt, broadcastNativeTransfer, describeTransferError } from "@/lib/client/transfer";
import { ShieldedError, payUsername, spendableNotes } from "@/lib/client/shielded";
import { fieldToHex } from "@/protocol/field";
import type { Hex } from "viem";

export interface SettlementIntent {
  paymentId: string;
  privacy: "private" | "public";
  /**
   * The recipient's wallet address — public transfers only.
   *
   * A private payment is addressed by username and settles through the pool, so
   * this is null for it and the payer never learns an address.
   */
  to: `0x${string}` | null;
  /** The recipient's CloakPay username — private payments only. */
  recipientUsername: string | null;
  amountWei: string;
  denominationId: string | null;
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

/** The message a user should see when the private path cannot even start. */
const PRIVATE_UNAVAILABLE =
  "This payment is set up to be made privately, and that option is not open yet. Send a standard CloakPay payment instead.";

/**
 * Drives one settlement end to end, along whichever of the two paths it is.
 *
 * The two paths share a shape and nothing else:
 *
 *   * a *public* transfer records the attempt, the browser signs and
 *     broadcasts a native transfer, and only a real receipt marks it confirmed;
 *   * a *private* payment unlocks the wallet locally, spends a shielded note
 *     with a Groth16 proof, and the pool's receipt is what marks it confirmed.
 *
 * The one thing this hook will never do is settle a payment announced as
 * private by any other means. There is no fallback: if the private path cannot
 * run, it fails and says so.
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

  /** Spends a shielded note and pays a username. No address is involved. */
  const confirmPrivate = useCallback(
    async (intent: SettlementIntent, passphrase?: string): Promise<void> => {
      const username = intent.recipientUsername;
      if (!username) {
        setState({
          phase: "failed",
          message: "That payment has no CloakPay username to pay.",
          intent,
        });
        return;
      }

      let txHash: Hex;
      let nullifierHash: string;
      let blockNumber: bigint;
      try {
        // Unlocking happens here rather than in `prepare`, so nothing is
        // decrypted until the user has actually asked to pay.
        const secret = await unlockWallet(passphrase);

        // The spendable set is derived from the pool's own events and the
        // chain's nullifier set, not from a cached balance. If a note is listed
        // here it is because the contract would accept it.
        const notes = await spendableNotes(secret);
        const note = notes.find((item) => item.note.denominationId === intent.denominationId);
        if (!note) {
          setState({ phase: "failed", message: PRIVATE_UNAVAILABLE, intent });
          return;
        }

        const result = await payUsername(secret, { note, recipientUsername: username });
        txHash = result.txHash;
        nullifierHash = fieldToHex(result.spentNullifier);
        blockNumber = result.blockNumber;
      } catch (error) {
        setState({
          phase: "failed",
          message:
            error instanceof ShieldedError
              ? error.message
              : describeTransferError(error),
          intent,
        });
        return;
      }

      // The transfer is already mined: `payUsername` waits for the receipt and
      // throws on a revert, so reaching this point means the pool accepted it.
      setState({ phase: "submitted", intent, txHash });
      await patchPayment(intent.paymentId, { status: "submitted", txHash, nullifierHash });
      await patchPayment(intent.paymentId, { status: "confirmed", txHash });
      setState({ phase: "confirmed", intent, txHash, blockNumber });
    },
    [],
  );

  /** Signs and broadcasts a native transfer to an external address. */
  const confirmPublic = useCallback(
    async (intent: SettlementIntent, passphrase?: string): Promise<void> => {
      if (!intent.to) {
        setState({
          phase: "failed",
          message: "That payment has no destination address.",
          intent,
        });
        return;
      }
      const to = intent.to;

      setState({ phase: "signing" });
      try {
        const secret = await unlockWallet(passphrase);
        const txHash = await broadcastNativeTransfer({
          mnemonic: secret.mnemonic,
          to,
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
    [],
  );

  const confirm = useCallback(
    async (passphrase?: string) => {
      if (state.phase !== "ready") return;
      const intent = state.intent;
      setState({ phase: "signing" });
      if (intent.privacy === "private") {
        await confirmPrivate(intent, passphrase);
        return;
      }
      await confirmPublic(intent, passphrase);
    },
    [state, confirmPrivate, confirmPublic],
  );

  const reset = useCallback(() => setState({ phase: "idle" }), []);

  return { state, prepare, confirm, reset };
}
