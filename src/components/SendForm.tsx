"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Card, Notice } from "@/components/ui";
import { Icon } from "@/components/Icon";
import {
  AddressPicker,
  PoolUnavailableNotice,
  Receipt,
  RecipientPicker,
  SettlementPicker,
  type Recipient,
} from "./payment/parts";
import { AmountInput } from "./payment/AmountInput";
import { useSettlement } from "./payment/useSettlement";
import { estimateNativeTransfer, readBalance, type FeeEstimate } from "@/lib/client/transfer";
import { isUnlocked } from "@/lib/client/wallet";
import { explorerTxUrl } from "@/lib/client/chain";
import { formatWei } from "@/lib/format";
import { AMOUNT_PRESETS, parseAmount, validateAmount } from "@/lib/amount";
import { validateExternalAddress } from "@/lib/address";

export interface SendFormProps {
  walletAddress: string | null;
  /** The pool is deployed *and* the client can spend a note. */
  privateReady: boolean;
  /** One accurate sentence about the pool, from the config single source of truth. */
  poolSentence: string;
  faucetUrl: string;
  denominations: { id: string; label: string; wei: string }[];
  symbol: string;
  decimals: number;
  initialRecipient?: string;
}

type Mode = "private" | "external";

export function SendForm({
  walletAddress,
  privateReady,
  poolSentence,
  faucetUrl,
  denominations,
  symbol,
  decimals,
  initialRecipient,
}: SendFormProps) {
  const [mode, setMode] = useState<Mode>(privateReady ? "private" : "external");
  const [recipient, setRecipient] = useState<Recipient | null>(null);
  const [address, setAddress] = useState("");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [passphrase, setPassphrase] = useState("");
  const [balance, setBalance] = useState<bigint | null>(null);
  const [balanceError, setBalanceError] = useState(false);
  const [fee, setFee] = useState<FeeEstimate | null>(null);
  const [feeError, setFeeError] = useState(false);
  const [sent, setSent] = useState<{ label: string; address: string | null } | null>(null);

  const settlement = useSettlement();

  const denominationWei = useMemo(
    () => denominations.map((item) => BigInt(item.wei)),
    [denominations],
  );

  // The pool settles in fixed sizes, so a private payment may only carry one of
  // them. An external transfer has no such limit: the chain accepts any amount
  // that fits the token's precision.
  const allowedWei = mode === "private" ? denominationWei : null;
  const presets = useMemo(
    () =>
      mode === "private"
        ? denominations.map((item) => item.label.split(" ")[0])
        : AMOUNT_PRESETS,
    [mode, denominations],
  );

  const rules = { decimals, symbol, balanceWei: balance, allowedWei };
  const amountCheck = validateAmount(amount, rules);
  const destination = validateExternalAddress(address, walletAddress);
  const destinationOk = mode === "private" ? Boolean(recipient) : destination.ok;

  const refreshBalance = useCallback(async () => {
    if (!walletAddress) return;
    const value = await readBalance(walletAddress as `0x${string}`);
    setBalance(value);
    setBalanceError(value === null);
  }, [walletAddress]);

  useEffect(() => {
    void refreshBalance();
  }, [refreshBalance]);

  useEffect(() => {
    if (!initialRecipient) return;
    let cancelled = false;
    fetch(`/api/users/search?q=${encodeURIComponent(initialRecipient)}`, { cache: "no-store" })
      .then((response) => response.json())
      .then((body) => {
        if (cancelled || !body.ok) return;
        const match = (body.results as Recipient[] | undefined)?.find(
          (item) => item.username.toLowerCase() === initialRecipient.toLowerCase(),
        );
        if (match) setRecipient(match);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [initialRecipient]);

  const estimateWei = useMemo(() => {
    const parsed = parseAmount(amount, decimals);
    return parsed.ok ? parsed.wei : 0n;
  }, [amount, decimals]);

  useEffect(() => {
    if (!walletAddress) return;
    const to =
      mode === "external" && destination.ok ? destination.address : (walletAddress as `0x${string}`);
    let cancelled = false;
    setFeeError(false);
    estimateNativeTransfer(walletAddress as `0x${string}`, to, estimateWei).then((estimate) => {
      if (cancelled) return;
      setFee(estimate);
      setFeeError(estimate === null);
    });
    return () => {
      cancelled = true;
    };
  }, [walletAddress, mode, destination, estimateWei, settlement.state.phase]);

  const amountWei = amountCheck.ok ? amountCheck.wei : 0n;
  const total = fee ? amountWei + fee.feeWei : null;
  const shortfall = balance !== null && total !== null ? total - balance : null;

  const busy =
    settlement.state.phase === "preparing" ||
    settlement.state.phase === "signing" ||
    settlement.state.phase === "submitted";

  const canReview = destinationOk && amountCheck.ok && !busy && !(shortfall !== null && shortfall > 0n);

  async function start() {
    if (!amountCheck.ok || !destinationOk) return;
    if (mode === "private") {
      const denomination = denominations.find((item) => BigInt(item.wei) === amountCheck.wei);
      if (!denomination || !recipient) return;
      setSent({ label: `@${recipient.username}`, address: null });
      await settlement.prepare({
        toUsername: recipient.username,
        denominationId: denomination.id,
        privacy: "private",
        note: note.trim() || undefined,
      });
      return;
    }
    if (!destination.ok) return;
    setSent({
      label: `${destination.address.slice(0, 10)}…${destination.address.slice(-6)}`,
      address: destination.address,
    });
    await settlement.prepare({
      toAddress: destination.address,
      amountWei: amountCheck.wei.toString(),
      privacy: "public",
      note: note.trim() || undefined,
    });
  }

  if (!walletAddress) {
    return (
      <Card>
        <div style={{ padding: 22 }}>
          <p className="table-head">No wallet yet</p>
          <p className="muted tiny" style={{ marginTop: 10 }}>
            A wallet is created during onboarding and it lives in your browser. Finish setting up your account
            and you can send from here.
          </p>
          <Link href="/onboarding" className="btn btn-primary btn-sm" style={{ marginTop: 16 }}>
            Finish setup
          </Link>
        </div>
      </Card>
    );
  }

  if (settlement.state.phase === "confirmed" || settlement.state.phase === "submitted") {
    const { intent, txHash } = settlement.state;
    return (
      <Card>
        <div style={{ padding: 22 }}>
          <Receipt
            amountLabel={formatWei(BigInt(intent.amountWei))}
            symbol={symbol}
            txHash={txHash}
            explorerUrl={explorerTxUrl(txHash)}
            status={settlement.state.phase === "confirmed" ? "confirmed" : "submitted"}
            blockNumber={settlement.state.phase === "confirmed" ? settlement.state.blockNumber : null}
            toLabel={sent?.label ?? "recipient"}
            toAddress={sent?.address ?? null}
          />
          <div className="row" style={{ gap: 8, marginTop: 18 }}>
            <button
              className="btn btn-primary btn-sm"
              onClick={() => {
                settlement.reset();
                setRecipient(null);
                setAddress("");
                setAmount("");
                setNote("");
                setSent(null);
                void refreshBalance();
              }}
            >
              Send another
            </button>
            <Link href="/activity" className="btn btn-secondary btn-sm">
              View activity
            </Link>
            <button className="btn btn-ghost btn-sm" onClick={() => void refreshBalance()}>
              <Icon name="refresh" size={14} />
              Refresh balance
            </button>
          </div>
        </div>
      </Card>
    );
  }

  return (
    <div className="split">
      <div className="stack">
        {!privateReady ? <PoolUnavailableNotice sentence={poolSentence} faucetUrl={faucetUrl} /> : null}

        <Card>
          <div style={{ padding: 22 }} className="stack">
            <SettlementPicker
              value={mode === "private" ? "private" : "public"}
              onChange={(next) => {
                setMode(next === "private" ? "private" : "external");
                setAmount("");
              }}
              privateReady={privateReady}
              privateBlocker={poolSentence}
            />

            {mode === "private" ? (
              <RecipientPicker value={recipient} onSelect={setRecipient} autoFocus />
            ) : (
              <>
                <AddressPicker value={address} onChange={setAddress} self={walletAddress} />
                <Notice tone="warn" title="This transfer is public">
                  A direct transfer is an ordinary on-chain transaction. The amount, both addresses and the
                  time are visible to anyone, and they stay visible forever. It is not a private payment.
                </Notice>
              </>
            )}

            <AmountInput
              id="send-amount"
              value={amount}
              onChange={setAmount}
              symbol={symbol}
              decimals={decimals}
              balanceWei={balance}
              allowedWei={allowedWei}
              presets={presets}
              label={`Amount in ${symbol}`}
              hint={
                mode === "private"
                  ? "The pool settles in the fixed sizes above so that no amount identifies a payment."
                  : balance === null
                    ? "Type any amount. Your balance is still being read from the network."
                    : `You have ${formatWei(balance)} ${symbol}. The network fee is charged on top.`
              }
            />

            <label className="field">
              <span className="label">Note (optional)</span>
              <input
                className="input"
                value={note}
                onChange={(event) => setNote(event.target.value)}
                maxLength={140}
                placeholder="What is this for?"
              />
              <span className="hint">Stored with the payment record. It is never written to the chain.</span>
            </label>
          </div>
        </Card>

        {settlement.state.phase === "failed" ? (
          <Notice tone="error" title="Payment did not go through">
            {settlement.state.message}
          </Notice>
        ) : null}
      </div>

      <div className="stack">
        <Card>
          <div style={{ padding: 22 }}>
            <p className="table-head">Summary</p>
            <div className="amount-display" style={{ marginTop: 14 }}>
              <span className="mono">{amountCheck.ok ? formatWei(amountCheck.wei) : "—"}</span>
              <span className="amount-display-unit">{symbol}</span>
            </div>
            <dl className="kv" style={{ marginTop: 16 }}>
              <dt>To</dt>
              <dd className="mono">
                {mode === "private"
                  ? recipient
                    ? `@${recipient.username}`
                    : "choose a username"
                  : destination.ok
                    ? `${destination.address.slice(0, 12)}…${destination.address.slice(-8)}`
                    : "enter a wallet address"}
              </dd>
              <dt>Settlement</dt>
              <dd>{mode === "private" ? "Private — CloakPay users" : "Direct Transfer — External wallets"}</dd>
              <dt>Network fee</dt>
              <dd className="mono">
                {fee ? `~${formatWei(fee.feeWei, 18, 8)} ${symbol}` : feeError ? "unavailable" : "estimating…"}
              </dd>
              <dt>Wallet balance</dt>
              <dd className="mono">
                {balanceError ? (
                  <button type="button" className="link tiny" onClick={() => void refreshBalance()}>
                    Unavailable — retry
                  </button>
                ) : balance === null ? (
                  "reading…"
                ) : (
                  `${formatWei(balance)} ${symbol}`
                )}
              </dd>
            </dl>

            {shortfall !== null && shortfall > 0n ? (
              <div style={{ marginTop: 16 }}>
                <Notice tone="warn" title={`Not enough ${symbol}`}>
                  You need about {formatWei(shortfall)} more {symbol} to cover the amount and the fee. Get
                  testnet funds from the{" "}
                  <a className="link" href={faucetUrl} target="_blank" rel="noreferrer noopener">
                    Elysium faucet
                  </a>
                  .
                </Notice>
              </div>
            ) : null}

            {settlement.state.phase === "ready" ? (
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
                  {sent?.address
                    ? `Confirming a public transfer of ${formatWei(BigInt(settlement.state.intent.amountWei))} ${symbol} to ${sent.address}.`
                    : `Confirming a payment of ${formatWei(BigInt(settlement.state.intent.amountWei))} ${symbol}.`}
                </p>
                <button className="btn btn-primary btn-block" onClick={() => settlement.confirm(passphrase)}>
                  Sign and send
                </button>
                <button className="btn btn-ghost btn-sm btn-block" onClick={settlement.reset}>
                  Cancel
                </button>
              </div>
            ) : (
              <button
                className="btn btn-primary btn-block"
                style={{ marginTop: 16 }}
                disabled={!canReview}
                onClick={start}
              >
                {settlement.state.phase === "preparing" ? "Preparing…" : "Review payment"}
              </button>
            )}

            {mode === "external" ? (
              <p className="tiny muted" style={{ marginTop: 10 }}>
                You will see the address, the amount and the fee before anything is signed, and the real
                transaction hash afterwards.
              </p>
            ) : null}
          </div>
        </Card>

        <Card className="card-quiet">
          <div style={{ padding: 20 }}>
            <p className="table-head">What the recipient sees</p>
            <p className="tiny muted" style={{ marginTop: 8 }}>
              {mode === "private"
                ? "A private payment shows the amount, the note and your username. Your wallet address is not part of the payment."
                : "Their activity list shows the amount, the note and the sending address. A public transfer is visible on chain to everyone, not only to them."}
            </p>
          </div>
        </Card>
      </div>
    </div>
  );
}
