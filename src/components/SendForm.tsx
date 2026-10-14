"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Card, Notice } from "@/components/ui";
import { Icon } from "@/components/Icon";
import { AmountPicker, PrivacyPicker, PoolUnavailableNotice, Receipt, RecipientPicker, type Recipient } from "./payment/parts";
import { useSettlement } from "./payment/useSettlement";
import { estimateNativeTransfer, readBalance, type FeeEstimate } from "@/lib/client/transfer";
import { isUnlocked } from "@/lib/client/wallet";
import { explorerTxUrl } from "@/lib/client/chain";
import { formatWei } from "@/lib/format";

export interface SendFormProps {
  walletAddress: string | null;
  poolDeployed: boolean;
  faucetUrl: string;
  denominations: { id: string; label: string; wei: string }[];
  initialRecipient?: string;
}

export function SendForm({
  walletAddress,
  poolDeployed,
  faucetUrl,
  denominations,
  initialRecipient,
}: SendFormProps) {
  const [recipient, setRecipient] = useState<Recipient | null>(null);
  const [denominationId, setDenominationId] = useState(denominations[1]?.id ?? denominations[0]?.id ?? "");
  const [privacy, setPrivacy] = useState<"private" | "public">(poolDeployed ? "private" : "public");
  const [note, setNote] = useState("");
  const [passphrase, setPassphrase] = useState("");
  const [balance, setBalance] = useState<bigint | null>(null);
  const [fee, setFee] = useState<FeeEstimate | null>(null);
  const [feeError, setFeeError] = useState(false);

  const settlement = useSettlement();
  const denomination = useMemo(
    () => denominations.find((item) => item.id === denominationId) ?? null,
    [denominationId, denominations],
  );

  useEffect(() => {
    if (!initialRecipient) return;
    let cancelled = false;
    fetch(`/api/users/search?q=${encodeURIComponent(initialRecipient)}`, { cache: "no-store" })
      .then((response) => response.json())
      .then((body) => {
        if (cancelled || !body.ok) return;
        const match = (body.data.results as Recipient[]).find(
          (item) => item.username.toLowerCase() === initialRecipient.toLowerCase(),
        );
        if (match) setRecipient(match);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [initialRecipient]);

  useEffect(() => {
    if (!walletAddress) return;
    readBalance(walletAddress as `0x${string}`).then(setBalance);
  }, [walletAddress]);

  useEffect(() => {
    if (!walletAddress || !denomination) return;
    let cancelled = false;
    setFeeError(false);
    estimateNativeTransfer(
      walletAddress as `0x${string}`,
      walletAddress as `0x${string}`,
      BigInt(denomination.wei),
    ).then((estimate) => {
      if (cancelled) return;
      setFee(estimate);
      setFeeError(estimate === null);
    });
    return () => {
      cancelled = true;
    };
  }, [walletAddress, denomination]);

  const amountWei = denomination ? BigInt(denomination.wei) : 0n;
  const total = fee ? amountWei + fee.feeWei : null;
  const shortfall = balance !== null && total !== null ? total - balance : null;

  const busy =
    settlement.state.phase === "preparing" ||
    settlement.state.phase === "signing" ||
    settlement.state.phase === "submitted";

  async function start() {
    if (!recipient || !denomination) return;
    await settlement.prepare({
      toUsername: recipient.username,
      denominationId: denomination.id,
      privacy,
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
            txHash={txHash}
            explorerUrl={explorerTxUrl(txHash)}
            status={settlement.state.phase === "confirmed" ? "confirmed" : "submitted"}
            blockNumber={settlement.state.phase === "confirmed" ? settlement.state.blockNumber : null}
            recipient={recipient?.username ?? "recipient"}
          />
          <div className="row" style={{ gap: 8, marginTop: 18 }}>
            <button
              className="btn btn-primary btn-sm"
              onClick={() => {
                settlement.reset();
                setRecipient(null);
                setNote("");
              }}
            >
              Send another
            </button>
            <Link href="/activity" className="btn btn-secondary btn-sm">
              View activity
            </Link>
          </div>
          {settlement.state.phase === "submitted" ? (
            <Notice tone="info" title="Broadcast, not confirmed yet">
              The transaction is on the network but no receipt has come back. It will keep showing as
              Submitted until a block confirms it.
            </Notice>
          ) : null}
        </div>
      </Card>
    );
  }

  return (
    <div className="split">
      <div className="stack">
        {!poolDeployed ? <PoolUnavailableNotice faucetUrl="" /> : null}

        <Card>
          <div style={{ padding: 22 }} className="stack">
            <RecipientPicker value={recipient} onSelect={setRecipient} autoFocus={!initialRecipient} />
            <AmountPicker
              denominations={denominations}
              value={denominationId}
              onChange={setDenominationId}
            />
            <PrivacyPicker
              value={privacy}
              onChange={setPrivacy}
              poolDeployed={poolDeployed}
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
              <span className="mono">{denomination ? formatWei(amountWei) : "—"}</span>
              <span className="amount-display-unit">HYPE</span>
            </div>
            <dl className="kv" style={{ marginTop: 16 }}>
              <dt>To</dt>
              <dd className="mono">{recipient ? `@${recipient.username}` : "choose a recipient"}</dd>
              <dt>Settlement</dt>
              <dd>{privacy === "public" ? "Direct transfer" : "Shielded pool"}</dd>
              <dt>Network fee</dt>
              <dd className="mono">
                {fee ? `~${formatWei(fee.feeWei, 18, 8)} HYPE` : feeError ? "unavailable" : "estimating…"}
              </dd>
              <dt>Wallet balance</dt>
              <dd className="mono">{balance === null ? "—" : `${formatWei(balance)} HYPE`}</dd>
            </dl>

            {shortfall !== null && shortfall > 0n ? (
              <div style={{ marginTop: 16 }}>
                <Notice tone="warn" title="Not enough HYPE">
                  You need about {formatWei(shortfall)} more HYPE to cover the amount and the fee. Get
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
                disabled={!recipient || busy || privacy === "private" || (shortfall !== null && shortfall > 0n)}
                onClick={start}
              >
                {settlement.state.phase === "preparing" ? "Preparing…" : "Review payment"}
              </button>
            )}

            {privacy === "private" ? (
              <p className="tiny muted" style={{ marginTop: 10 }}>
                Private settlement runs through the shielded pool, which is not deployed on this network.
                Choose a direct transfer to continue today.
              </p>
            ) : null}
          </div>
        </Card>

        <Card className="card-quiet">
          <div style={{ padding: 20 }}>
            <p className="table-head">What the recipient sees</p>
            <p className="tiny muted" style={{ marginTop: 8 }}>
              Their activity list shows the amount, the note and your username. Nothing about your wallet is
              shared beyond what the transaction itself already reveals.
            </p>
          </div>
        </Card>
      </div>
    </div>
  );
}
