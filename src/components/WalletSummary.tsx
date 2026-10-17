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
    <div className="wallet-row">
      <section className="wallet-card" aria-labelledby="balance-heading">
        <div className="wallet-art" aria-hidden="true">
          <svg viewBox="0 0 800 280" preserveAspectRatio="xMidYMid slice" fill="none">
            <path
              d="M-60 232C90 224 150 176 268 174c112-2 190 44 312 28 106-14 180-56 280-46"
              stroke="currentColor"
              opacity="0.55"
            />
            <path
              d="M-20 262C118 238 190 205 292 204c118-1 208 32 322 18 92-11 160-40 226-34"
              stroke="currentColor"
              opacity="0.32"
            />
            <path
              d="M40 152c104-38 168-58 268-40 104 19 176 58 286 44 74-10 130-33 186-27"
              stroke="currentColor"
              opacity="0.2"
            />
            <path
              d="M120 106c84-22 144-40 238-20 90 19 156 47 244 38 62-7 108-22 158-17"
              stroke="currentColor"
              opacity="0.12"
            />
          </svg>
        </div>

        <div className="wallet-top">
          <p className="wallet-label" id="balance-heading">
            <Icon name="wallet" size={14} strokeWidth={1.7} />
            Wallet balance
          </p>
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
              Couldn't read the balance. The node did not answer.{" "}
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

        {username ? (
          <div className="wallet-foot">
            <span className="username-chip">
              <Icon name="user" size={13} strokeWidth={1.8} />
              <span className="mono">@{username}</span>
            </span>
            <button
              type="button"
              className="wallet-copy"
              onClick={copyUsername}
              aria-label={`Copy your username, ${username}`}
              title="Copy username"
            >
              <Icon name={copied === "ok" ? "check" : "copy"} size={13} />
              {copied === "ok" ? "Copied" : "Copy"}
            </button>
            <span className="tiny" role="status" aria-live="polite">
              {copied === "failed" ? "Clipboard blocked — select the username to copy it." : ""}
            </span>
          </div>
        ) : null}
      </section>

      <div className="wallet-actions">
        <Link href="/send" className="wallet-action wallet-action-primary">
          <Icon name="send" size={16} strokeWidth={1.8} />
          Send
        </Link>
        <Link href="/receive" className="wallet-action wallet-action-secondary">
          <Icon name="receive" size={16} strokeWidth={1.8} />
          Receive
        </Link>
      </div>
    </div>
  );
}
