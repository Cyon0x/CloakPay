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
    <section className="balance-panel" aria-labelledby="balance-heading">
      <div className="balance-main">
        <p className="balance-label" id="balance-heading">
          Wallet balance
        </p>

        <p className="balance-amount mono">
          {state === "loading" ? (
            <span className="skeleton balance-skeleton" aria-hidden="true" />
          ) : state === "error" ? (
            <span className="balance-unavailable">—</span>
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
              Couldn't read the balance. The node did not answer.{" "}
              <button type="button" className="link tiny" onClick={() => void read(true)}>
                Retry
              </button>
            </>
          ) : address ? (
            <>
              <span className="mono tiny">{`${address.slice(0, 10)}…${address.slice(-6)}`}</span> on Elysium
              Testnet · {symbol} is the only asset CloakPay holds.
            </>
          ) : (
            "No wallet on this account yet."
          )}
        </p>

        {username ? (
          <div className="username-row">
            <span className="username-chip">
              <span className="mono">@{username}</span>
            </span>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={copyUsername}
              aria-label={`Copy your username, ${username}`}
              title="Copy username"
            >
              <Icon name={copied === "ok" ? "check" : "copy"} size={14} />
              Copy
            </button>
            <span className="tiny muted" role="status" aria-live="polite">
              {copied === "ok"
                ? "Username copied."
                : copied === "failed"
                  ? "Your browser blocked the clipboard. Select the username to copy it."
                  : ""}
            </span>
          </div>
        ) : null}
      </div>

      <div className="balance-actions">
        <Link href="/send" className="btn btn-primary">
          <Icon name="send" size={16} />
          Send
        </Link>
        <Link href="/receive" className="btn btn-secondary">
          <Icon name="receive" size={16} />
          Receive
        </Link>
      </div>
    </section>
  );
}
