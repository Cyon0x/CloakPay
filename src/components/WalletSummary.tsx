"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Icon } from "@/components/Icon";
import { readBalance } from "@/lib/client/transfer";
import { formatWei } from "@/lib/format";

/**
 * The top of the dashboard: the real balance of the signed-in user's wallet,
 * their username, and the two actions people actually came to use.
 *
 * The balance is read from the chain through the same public client the
 * transfer code uses. When the read fails the panel says so and offers a retry;
 * it never falls back to a remembered, cached or invented number, because a
 * balance someone might act on must be the balance the chain reports.
 *
 * The address arrives so the balance can be read, and does not leave this
 * function: CloakPay shows an address on the Receive page and nowhere else.
 */
export function WalletSummary({
  address,
  username,
  symbol,
  decimals = 18,
}: {
  address: string | null;
  username: string | null;
  symbol: string;
  decimals?: number;
}) {
  const [balance, setBalance] = useState<bigint | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [copied, setCopied] = useState<"idle" | "ok" | "failed">("idle");
  const [hidden, setHidden] = useState(false);
  const lastRead = useRef(0);

  const read = useCallback(
    async (force = false) => {
      if (!address) {
        setState("ready");
        return;
      }
      // Returning to the tab is a good moment to refresh, but a burst of focus
      // events must not become a burst of RPC calls.
      const now = Date.now();
      if (!force && now - lastRead.current < 15_000) return;
      lastRead.current = now;
      setState((current) => (current === "ready" ? current : "loading"));
      const value = await readBalance(address as `0x${string}`);
      if (value === null) {
        setState("error");
        setBalance(null);
        return;
      }
      setBalance(value);
      setState("ready");
    },
    [address],
  );

  useEffect(() => {
    void read(true);
  }, [read]);

  useEffect(() => {
    if (!address) return;
    const onWake = () => void read();
    window.addEventListener("focus", onWake);
    document.addEventListener("visibilitychange", onWake);
    return () => {
      window.removeEventListener("focus", onWake);
      document.removeEventListener("visibilitychange", onWake);
    };
  }, [address, read]);

  async function copyUsername() {
    if (!username) return;
    try {
      await navigator.clipboard.writeText(username);
      setCopied("ok");
    } catch {
      // A blocked clipboard is common on http and in embedded browsers. The
      // username stays on screen and selectable, so nothing is lost.
      setCopied("failed");
    }
    setTimeout(() => setCopied("idle"), 2000);
  }

  return (
    <section className="wallet-card wallet-card-v2" aria-labelledby="balance-heading">
      <div className="wallet-orb" aria-hidden="true" />
      <div className="wallet-v2-head">
        <span className="wallet-v2-icon" aria-hidden="true">
          <Icon name="wallet" size={21} strokeWidth={1.6} />
        </span>
        <div className="wallet-v2-copy">
          <p className="wallet-label" id="balance-heading">Wallet Balance</p>
          <p className="balance-amount mono">
            {state === "loading" ? (
              <span className="skeleton balance-skeleton" aria-hidden="true" />
            ) : state === "error" ? (
              <span className="balance-unavailable">—</span>
            ) : hidden ? (
              <span aria-label="Balance hidden">••••••</span>
            ) : (
              formatWei(balance ?? 0n, decimals, 6)
            )}
            <span className="balance-unit">{symbol}</span>
          </p>
          <p className="balance-meta" role="status" aria-live="polite">
            {state === "loading" ? (
              "Reading the balance from Elysium…"
            ) : state === "error" ? (
              <>
                Balance unavailable.{" "}
                <button type="button" className="link tiny" onClick={() => void read(true)}>
                  Retry
                </button>
              </>
            ) : address ? (
              `Elysium Testnet · ${symbol}`
            ) : (
              "No wallet on this account yet."
            )}
          </p>
        </div>
        <button
          type="button"
          className="wallet-eye"
          onClick={() => setHidden((value) => !value)}
          aria-label={hidden ? "Show balance" : "Hide balance"}
          aria-pressed={hidden}
          title={hidden ? "Show balance" : "Hide balance"}
        >
          <Icon name={hidden ? "eyeOff" : "eye"} size={16} strokeWidth={1.7} />
        </button>
      </div>

      <div className="wallet-v2-foot">
        {username ? (
          <button
            type="button"
            className="username-chip username-chip-button"
            onClick={copyUsername}
            aria-label={`Copy your username, ${username}`}
            title="Copy username"
          >
            <Icon name={copied === "ok" ? "check" : "copy"} size={13} />
            <span className="mono">@{username}</span>
          </button>
        ) : null}
        <span className="tiny wallet-copy-status" role="status" aria-live="polite">
          {copied === "failed" ? "Clipboard blocked — select the username to copy it." : ""}
        </span>
        <Link href="/faucet" className="wallet-add-funds">
          <Icon name="plus" size={15} strokeWidth={1.9} />
          Add Funds
        </Link>
        <Link href="/receive" className="wallet-open" aria-label="Open receive details" title="Receive">
          <Icon name="chevronRight" size={18} strokeWidth={1.8} />
        </Link>
      </div>
    </section>
  );
}
