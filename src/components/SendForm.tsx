"use client";

import { useCallback, useEffect, useState } from "react";
import { Card, Notice } from "@/components/ui";
import { Icon } from "@/components/Icon";
import { ComingSoon } from "@/components/ComingSoon";
import { PaymentReceipt } from "@/components/PaymentReceipt";
import { RecipientPicker, type Recipient } from "./payment/parts";
import { AmountInput } from "./payment/AmountInput";
import { useSettlement } from "./payment/useSettlement";
import { estimateNativeTransfer, readBalance, type FeeEstimate } from "@/lib/client/transfer";
import { isUnlocked } from "@/lib/client/wallet";
import { validateAmount } from "@/lib/amount";
import { formatWei } from "@/lib/format";

export interface SendFormProps {
  /**
   * The signed-in user's own wallet address.
   *
   * This is the wallet CloakPay signs with, and it is used here for exactly two
   * things: reading the balance and estimating the fee. It is never rendered.
   * The recipient's address arrives from the settlement endpoint for the same
   * internal purpose and is never rendered either.
   */
  walletAddress: string | null;
  senderUsername: string;
  symbol: string;
  decimals: number;
  faucetUrl: string;
  /** A username from a `?to=` link, pre-filled into the picker. */
  initialRecipient?: string;
}

/**
 * Paying another CloakPay user by username.
 *
 * One flow, and the whole of it: pick a username, type an amount, review who
 * and how much, sign, and keep the receipt. No wallet address is typed, shown,
 * or needed at any point — CloakPay resolves the username to the account it
 * belongs to on the server, and the settlement endpoint hands the browser a
 * destination only so the transaction can be signed.
 *
 * The payment itself is an ordinary native HYPE transfer on Elysium, signed in
 * this browser. That is worth saying out loud on the review screen: it moves
 * real testnet funds, and it is visible on chain.
 */
export function SendForm({
  walletAddress,
  senderUsername,
  symbol,
  decimals,
  faucetUrl,
  initialRecipient,
}: SendFormProps) {
  const [recipient, setRecipient] = useState<Recipient | null>(null);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [passphrase, setPassphrase] = useState("");
  const [balance, setBalance] = useState<bigint | null>(null);
  const [balanceError, setBalanceError] = useState(false);
  const [fee, setFee] = useState<FeeEstimate | null>(null);
  const [feeError, setFeeError] = useState(false);
  /** When the payment row was opened, so the receipt can carry a real time. */
  const [startedAt, setStartedAt] = useState<string | null>(null);

  const settlement = useSettlement();

  const refreshBalance = useCallback(async () => {
    if (!walletAddress) return;
    const value = await readBalance(walletAddress as `0x${string}`);
    setBalance(value);
    setBalanceError(value === null);
  }, [walletAddress]);

  useEffect(() => {
    void refreshBalance();
  }, [refreshBalance]);

  // A link such as /send?to=alice arrives with a username and no address, so
  // the only way to turn it into a recipient is the same lookup the picker
  // uses. An exact match is required: a near miss is not the person who was
  // linked to.
  useEffect(() => {
    const wanted = initialRecipient?.trim().replace(/^@/, "").toLowerCase();
    if (!wanted || recipient) return;
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch(`/api/users/search?q=${encodeURIComponent(wanted)}`, {
          cache: "no-store",
        });
        const body = await response.json();
        const match = body.ok
          ? (body.data.results as Recipient[]).find((item) => item.username.toLowerCase() === wanted)
          : undefined;
        if (!cancelled && match) setRecipient(match);
      } catch {
        /* the picker still works by hand */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [initialRecipient, recipient]);

  const amountCheck = validateAmount(amount, { decimals, symbol, balanceWei: balance });
  const canReview = Boolean(recipient) && amountCheck.ok && settlement.state.phase !== "preparing";

  async function start() {
    if (!recipient || !amountCheck.ok) return;
    setFee(null);
    setFeeError(false);
    // The recipient's address comes back from here and stays in this hook. It
    // is what the browser signs against; the form never reads it.
    const intent = await settlement.prepare({
      toUsername: recipient.username,
      amountWei: amountCheck.wei.toString(),
      privacy: "public",
      note: note.trim() || undefined,
    });
    if (!intent?.to) return;
    setStartedAt(new Date().toISOString());
    const estimate = await estimateNativeTransfer(
      (walletAddress ?? "0x0000000000000000000000000000000000000000") as `0x${string}`,
      intent.to,
      BigInt(intent.amountWei),
    );
    setFee(estimate);
    setFeeError(estimate === null);
  }

  const shortfall =
    balance !== null && amountCheck.ok && fee
      ? amountCheck.wei + fee.feeWei - balance
      : null;

  // ── the receipt ────────────────────────────────────────────────────────────
  const state = settlement.state;
  if (state.phase === "submitted" || state.phase === "confirmed") {
    const confirmed = state.phase === "confirmed";
    return (
      <div className="stack">
        <PaymentReceipt
          receiptId={state.intent.paymentId}
          status={confirmed ? "confirmed" : "submitted"}
          fromUsername={senderUsername}
          toUsername={state.intent.recipientUsername ?? recipient?.username ?? "unknown"}
          amountWei={state.intent.amountWei}
          symbol={symbol}
          createdAt={startedAt ?? new Date().toISOString()}
          note={note.trim() || null}
          chainName="Elysium Testnet"
          downloadable={confirmed}
        />

        {!confirmed ? (
          <Notice tone="info" title="Waiting for the network">
            The transaction is broadcast and CloakPay is watching for its receipt. This page becomes a
            completed receipt with a download the moment the network confirms it — reload to check.
          </Notice>
        ) : null}

        <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
          <button
            className="btn btn-secondary btn-sm"
            onClick={() => {
              settlement.reset();
              setAmount("");
              setPassphrase("");
              setStartedAt(null);
              setFee(null);
              setRecipient(null);
              void refreshBalance();
            }}
          >
            Send another payment
          </button>
          <a className="btn btn-ghost btn-sm" href="/activity">
            View activity
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="stack">
      <div className="split">
        <Card>
          <div style={{ padding: 22 }}>
            <RecipientPicker value={recipient} onSelect={setRecipient} autoFocus={!initialRecipient} />

            <div style={{ marginTop: 20 }}>
              <AmountInput
                value={amount}
                onChange={setAmount}
                symbol={symbol}
                decimals={decimals}
                balanceWei={balance}
                hint={
                  balanceError
                    ? "Balance unavailable — the node did not answer."
                    : balance === null
                      ? "Reading your balance…"
                      : `${formatWei(balance)} ${symbol} available in this account.`
                }
              />
            </div>

            <label className="field" style={{ marginTop: 16 }}>
              <span className="label">Note (optional)</span>
              <input
                className="input"
                value={note}
                onChange={(event) => setNote(event.target.value)}
                maxLength={140}
                placeholder="What is this for?"
              />
            </label>
          </div>
        </Card>

        <div className="stack">
          {settlement.state.phase === "ready" ? (
            <Card>
              <div style={{ padding: 22 }}>
                <p className="table-head">Review the payment</p>
                <dl className="kv" style={{ marginTop: 12 }}>
                  <dt>To</dt>
                  <dd className="mono">@{recipient?.username}</dd>
                  <dt>Amount</dt>
                  <dd className="mono">
                    {formatWei(BigInt(settlement.state.intent.amountWei))} {symbol}
                  </dd>
                  <dt>Asset</dt>
                  <dd className="mono">{symbol}</dd>
                  <dt>From</dt>
                  <dd className="mono">@{senderUsername}</dd>
                  <dt>Network fee</dt>
                  <dd className="mono">
                    {fee
                      ? `~${formatWei(fee.feeWei, 18, 8)} ${symbol}`
                      : feeError
                        ? "unavailable"
                        : "estimating…"}
                  </dd>
                </dl>

                {shortfall !== null && shortfall > 0n ? (
                  <div style={{ marginTop: 16 }}>
                    <Notice tone="warn" title={`Not enough ${symbol}`}>
                      You need about {formatWei(shortfall)} more {symbol} to cover the payment and the fee.{" "}
                      <a className="link" href={faucetUrl} target="_blank" rel="noreferrer noopener">
                        Get testnet funds
                      </a>
                      .
                    </Notice>
                  </div>
                ) : null}

                <div className="stack" style={{ marginTop: 16 }}>
                  <label className="field">
                    <span className="label">
                      <Icon name="lock" size={13} /> Wallet passphrase
                    </span>
                    <input
                      className="input"
                      type="password"
                      value={passphrase}
                      onChange={(event) => setPassphrase(event.target.value)}
                      autoComplete="current-password"
                      placeholder={isUnlocked() ? "Already unlocked this session" : "Unlock to sign"}
                      disabled={isUnlocked()}
                    />
                    <span className="hint">
                      It unseals the wallet in this tab only. It is never sent to CloakPay.
                    </span>
                  </label>
                  <p className="tiny muted">
                    Signing sends {formatWei(BigInt(settlement.state.intent.amountWei))} {symbol} to
                    @{recipient?.username} on {symbol}&apos;s test network. It is a normal public transfer:
                    the chain shows that one address paid another, though not who either belongs to.
                  </p>
                  <button
                    className="btn btn-primary btn-block"
                    disabled={settlement.state.phase !== "ready"}
                    onClick={() => settlement.confirm(passphrase)}
                  >
                    Confirm and send
                  </button>
                  <button className="btn btn-ghost btn-sm btn-block" onClick={settlement.reset}>
                    Cancel
                  </button>
                </div>
              </div>
            </Card>
          ) : (
            <Card>
              <div style={{ padding: 22 }}>
                <p className="table-head">Pay by username</p>
                <p className="tiny muted" style={{ marginTop: 10 }}>
                  CloakPay finds the account from the username. Nothing here asks for an address, and none is
                  shown at any point in the payment.
                </p>
                <button
                  className="btn btn-primary btn-block"
                  style={{ marginTop: 16 }}
                  disabled={!canReview}
                  onClick={() => void start()}
                >
                  {settlement.state.phase === "preparing" ? "Preparing…" : "Review payment"}
                </button>
                {settlement.state.phase === "idle" && !canReview ? (
                  <p className="tiny muted" style={{ marginTop: 10 }}>
                    {!recipient
                      ? "Choose a recipient to continue."
                      : amountCheck.ok
                        ? ""
                        : amountCheck.reason}
                  </p>
                ) : null}
              </div>
            </Card>
          )}

          {settlement.state.phase === "failed" ? (
            <Notice tone="error" title="The payment did not go through">
              {settlement.state.message} Nothing was sent, and you can try again.
            </Notice>
          ) : null}

          <Card className="card-quiet">
            <div style={{ padding: 20 }}>
              <p className="table-head">What the recipient sees</p>
              <p className="tiny muted" style={{ marginTop: 8 }}>
                A payment from @{senderUsername}, the amount, and the time. The two accounts are joined by
                their usernames inside CloakPay; no address is exchanged in either direction or printed on the
                receipt.
              </p>
            </div>
          </Card>
        </div>
      </div>

      <div className="stack" style={{ marginTop: 26 }}>
        <ComingSoon
          title="External Transfer"
          icon="external"
          body="Sending to a wallet outside CloakPay is coming soon."
        />
        <ComingSoon
          title="Shielded Pool"
          icon="shield"
          body="Private payments are coming soon."
        />
      </div>
    </div>
  );
}
