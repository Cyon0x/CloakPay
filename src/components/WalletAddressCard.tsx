"use client";

import { useCallback, useEffect, useState } from "react";
import { Icon } from "@/components/Icon";
import { readBalance } from "@/lib/client/transfer";
import { formatWei } from "@/lib/format";

/**
 * The wallet address, with the two things a faucet trip needs: a copy button
 * and the current balance, so the effect of the claim is visible on return
 * rather than assumed.
 */
export function WalletAddressCard({
  address,
  symbol,
  decimals = 18,
  explorerUrl,
}: {
  address: string | null;
  symbol: string;
  decimals?: number;
  explorerUrl?: string | null;
}) {
  const [balance, setBalance] = useState<bigint | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [copied, setCopied] = useState<"idle" | "ok" | "failed">("idle");

  const read = useCallback(async () => {
    if (!address) {
      setState("ready");
      return;
    }
    setState("loading");
    const value = await readBalance(address as `0x${string}`);
    if (value === null) {
      setState("error");
      setBalance(null);
      return;
    }
    setBalance(value);
    setState("ready");
  }, [address]);

  useEffect(() => {
    void read();
  }, [read]);

  async function copy() {
    if (!address) return;
    try {
      await navigator.clipboard.writeText(address);
      setCopied("ok");
    } catch {
      setCopied("failed");
    }
    setTimeout(() => setCopied("idle"), 2000);
  }

  if (!address) {
    return (
      <p className="muted tiny">
        This account has no wallet yet. Finish onboarding and your address will appear here.
      </p>
    );
  }

  return (
    <div className="stack-sm">
      <div className="code-line mono" style={{ wordBreak: "break-all" }}>
        {address}
      </div>
      <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={copy}
          aria-label="Copy your wallet address"
        >
          <Icon name={copied === "ok" ? "check" : "copy"} size={14} />
          {copied === "ok" ? "Copied" : "Copy address"}
        </button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => void read()}>
          <Icon name="refresh" size={14} />
          Refresh balance
        </button>
        {explorerUrl ? (
          <a className="btn btn-ghost btn-sm" href={explorerUrl} target="_blank" rel="noreferrer noopener">
            <Icon name="external" size={14} />
            Explorer
          </a>
        ) : null}
      </div>
      <p className="tiny muted" role="status" aria-live="polite">
        {copied === "failed"
          ? "Your browser blocked the clipboard. Select the address above to copy it."
          : copied === "ok"
            ? "Address copied."
            : state === "loading"
              ? "Reading the balance…"
              : state === "error"
                ? "Balance unavailable — the node did not answer."
                : `Balance ${formatWei(balance ?? 0n, decimals, 6)} ${symbol}`}
      </p>
    </div>
  );
}
