"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Card, Notice } from "@/components/ui";
import { Icon } from "@/components/Icon";
import { PaymentReceipt } from "@/components/PaymentReceipt";
import { useSettlement } from "./payment/useSettlement";
import { AmountInput } from "./payment/AmountInput";
import { readBalance } from "@/lib/client/transfer";
import { isUnlocked } from "@/lib/client/wallet";
import { formatWei } from "@/lib/format";
import { validateAmount } from "@/lib/amount";

export interface CheckoutLink {
  code: string;
  title: string | null;
  description: string | null;
  amountWei: string | null;
  denominationId: string | null;
  mode: string;
  reusable: boolean;
  maxUses: number | null;
  uses: number;
  expiresAt: string | null;
  claimable: boolean;
  reason: string | null;
  recipientUsername: string;
  recipientDisplayName: string | null;
}

const BLOCKERS: Record<string, string> = {
  expired: "This link has expired.",
  exhausted: "This link has reached its usage limit.",
  disabled: "The owner has switched this link off.",
};

/**
 * The payer's side of a payment link.
 *
 * The recipient's address is never part of this page: it is handed to the payer
 * only by the settlement endpoint, at the moment they commit to paying.
 */
export function CheckoutPanel({
  link,
  signedIn,
  isOwner,
  walletAddress,
  payerUsername,
  faucetUrl,
}: {
  link: CheckoutLink;
  signedIn: boolean;
  isOwner: boolean;
  walletAddress: string | null;
  /** The signed-in payer's username, so the receipt can name both parties. */
  payerUsername: string | null;
  faucetUrl: string;
}) {
  const settlement = useSettlement();
  const [passphrase, setPassphrase] = useState("");
  const [balance, setBalance] = useState<bigint | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [startedAt, setStartedAt] = useState<string | null>(null);
  /** Only used when the link leaves the amount to the payer. */
  const [amount, setAmount] = useState("");

  useEffect(() => {
    if (!walletAddress) return;
    readBalance(walletAddress as `0x${string}`).then(setBalance);
  }, [walletAddress]);

  const amountWei = link.amountWei ? BigInt(link.amountWei) : 0n;
  const privateRequested = link.mode === "private";
  // A link with no amount asks the payer to choose one. The validator is the
  // same one the send form uses, so a figure accepted there is accepted here.
  const freeAmount = !link.amountWei;
  const amountCheck = validateAmount(amount, { decimals: 18, symbol: "HYPE", balanceWei: balance });
  const payableWei = freeAmount ? (amountCheck.ok ? amountCheck.wei : null) : amountWei;

  if (settlement.state.phase === "confirmed" || settlement.state.phase === "submitted") {
    const { intent } = settlement.state;
    return (
      <Card>
        <div style={{ padding: 24 }}>
          <PaymentReceipt
            receiptId={intent.paymentId}
            status={settlement.state.phase === "confirmed" ? "confirmed" : "submitted"}
            fromUsername={payerUsername ?? "you"}
            toUsername={intent.recipientUsername ?? link.recipientUsername}
            amountWei={intent.amountWei}
            symbol="HYPE"
            createdAt={startedAt ?? new Date().toISOString()}
            chainName="Elysium Testnet"
            downloadable={settlement.state.phase === "confirmed"}
          />
          <div className="row" style={{ gap: 8, marginTop: 18 }}>
            <Link href="/activity" className="btn btn-secondary btn-sm">
              View activity
            </Link>
            <Link href="/dashboard" className="btn btn-ghost btn-sm">
              Done
            </Link>
          </div>
        </div>
      </Card>
    );
  }

  return (
    <Card>
      <div style={{ padding: 24 }}>
        <div className="row" style={{ gap: 12 }}>
          <span className="avatar" style={{ width: 42, height: 42, fontSize: 16 }}>
            {link.recipientUsername.slice(0, 1).toUpperCase()}
          </span>
          <div className="grow">
            <h1 style={{ fontSize: 19 }}>@{link.recipientUsername}</h1>
            {link.recipientDisplayName ? <p className="tiny muted">{link.recipientDisplayName}</p> : null}
          </div>
        </div>

        {freeAmount ? (
          <div style={{ marginTop: 20 }}>
            <AmountInput
              id="checkout-amount"
              value={amount}
              onChange={setAmount}
              symbol="HYPE"
              balanceWei={balance}
              label="Amount"
              hint="This request leaves the amount to you."
            />
          </div>
        ) : (
          <div className="amount-display" style={{ marginTop: 20 }}>
            <span className="mono">{formatWei(amountWei)}</span>
            <span className="amount-display-unit">HYPE</span>
          </div>
        )}

        {link.title ? <p style={{ marginTop: 14, fontWeight: 500 }}>{link.title}</p> : null}
        {link.description ? <p className="tiny muted" style={{ marginTop: 6 }}>{link.description}</p> : null}

        <dl className="kv" style={{ marginTop: 18 }}>
          <dt>Link</dt>
          <dd className="mono">/{link.code}</dd>
          <dt>Uses</dt>
          <dd className="mono">
            {link.uses}
            {link.maxUses === null ? "" : ` / ${link.maxUses}`}
            {link.reusable ? "" : " · one-time"}
          </dd>
          <dt>Expires</dt>
          <dd>{link.expiresAt ? new Date(link.expiresAt).toISOString().slice(0, 10) : "never"}</dd>
        </dl>

        <div style={{ marginTop: 18 }}>
          {!link.claimable ? (
            <Notice tone="error" title="This link cannot be paid">
              {BLOCKERS[link.reason ?? ""] ?? "The link is no longer usable."}
            </Notice>
          ) : isOwner ? (
            <Notice tone="info" title="This is your own link">
              Open it from another account to test the payer&apos;s side.
            </Notice>
          ) : !signedIn ? (
            <>
              <Notice tone="info" title="Sign in to pay">
                CloakPay needs an account so the payment lands in your history and the receipt has an owner.
                Google and X are the only options.
              </Notice>
              <Link
                href={`/signin?next=${encodeURIComponent(`/pay/${link.code}`)}`}
                className="btn btn-primary btn-block"
                style={{ marginTop: 14 }}
              >
                Sign in and continue
              </Link>
            </>
          ) : !walletAddress ? (
            <Notice tone="warn" title="Your wallet is not set up">
              Finish onboarding to create a wallet before paying.
            </Notice>
          ) : privateRequested ? (
            <Notice tone="warn" title="This link asks for a private payment">
              Private payments are not available yet, so this link cannot be paid. Ask the owner to send you
              a new one.
            </Notice>
          ) : settlement.state.phase === "failed" ? (
            <>
              <Notice tone="error" title="Payment did not go through">
                {settlement.state.message}
              </Notice>
              <button className="btn btn-secondary btn-block" style={{ marginTop: 12 }} onClick={settlement.reset}>
                Try again
              </button>
            </>
          ) : settlement.state.phase === "ready" ? (
            <>
              <dl className="kv">
                <dt>Wallet balance</dt>
                <dd className="mono">{balance === null ? "—" : `${formatWei(balance)} HYPE`}</dd>
              </dl>
              <label className="field" style={{ marginTop: 14 }}>
                <span className="label">
                  <Icon name="lock" size={13} /> Wallet passphrase
                </span>
                <input
                  className="input"
                  type="password"
                  value={passphrase}
                  onChange={(event) => setPassphrase(event.target.value)}
                  disabled={isUnlocked()}
                  placeholder={isUnlocked() ? "Already unlocked this session" : "Unlock to sign"}
                  autoComplete="current-password"
                />
              </label>
              <label className="checkline" style={{ marginTop: 12 }}>
                <input
                  type="checkbox"
                  checked={confirmed}
                  onChange={(event) => setConfirmed(event.target.checked)}
                />
                <span className="tiny">
                  I understand this is a public transfer. The amount, my wallet and theirs are all visible on
                  chain.
                </span>
              </label>
              <div className="row" style={{ gap: 8, marginTop: 14 }}>
                <button
                  className="btn btn-primary grow"
                  disabled={!confirmed}
                  onClick={() => settlement.confirm(passphrase)}
                >
                  Pay now
                </button>
                <button className="btn btn-ghost" onClick={settlement.reset}>
                  Cancel
                </button>
              </div>
            </>
          ) : (
            <>
              <p className="tiny muted">
                Paying <span className="mono">@{link.recipientUsername}</span> from your CloakPay account.
              </p>
              <button
                className="btn btn-primary btn-block"
                style={{ marginTop: 12 }}
                disabled={settlement.state.phase === "preparing" || payableWei === null}
                onClick={async () => {
                  const intent = await settlement.prepare({
                    linkCode: link.code,
                    amountWei: payableWei?.toString(),
                    // The link's owner chose how they want to be paid, and the
                    // server refuses a mismatch. Sending anything other than
                    // the link's own mode would just be a request to break the
                    // promise the link makes.
                    privacy: link.mode === "private" ? "private" : "public",
                  });
                  if (intent) setStartedAt(new Date().toISOString());
                }}
              >
                {settlement.state.phase === "preparing" ? "Preparing…" : "Continue to payment"}
              </button>
              <p className="tiny muted" style={{ marginTop: 12 }}>
                Next you will see exactly what will be sent and the network fee, then confirm.
              </p>
            </>
          )}
        </div>

        <p className="tiny muted" style={{ marginTop: 16 }}>
          Testnet only. Get HYPE from the{" "}
          <a className="link" href={faucetUrl} target="_blank" rel="noreferrer noopener">
            Elysium faucet
          </a>
          .
        </p>
      </div>
    </Card>
  );
}
