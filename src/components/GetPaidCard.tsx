"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Icon } from "@/components/Icon";

/**
 * The Get Paid card. The link it shows is the user's real public payment page,
 * built by the dashboard from APP_URL and the account's username — not a
 * placeholder. Copy and share act on that same value; when the clipboard or the
 * share sheet is unavailable the message says so instead of pretending.
 */
export function GetPaidCard({
  username,
  link,
}: {
  username: string | null;
  link: string | null;
}) {
  const [copied, setCopied] = useState<"idle" | "ok" | "failed">("idle");
  const [canShare, setCanShare] = useState(false);

  useEffect(() => {
    setCanShare(typeof navigator !== "undefined" && typeof navigator.share === "function");
  }, []);

  async function copy() {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopied("ok");
    } catch {
      setCopied("failed");
    }
    setTimeout(() => setCopied("idle"), 2000);
  }

  async function share() {
    if (!link) return;
    try {
      await navigator.share({ title: "Pay me on CloakPay", text: `Pay @${username} on CloakPay`, url: link });
    } catch {
      // Dismissing the sheet is not an error worth reporting.
    }
  }

  return (
    <>
      <div className="receive-link-row">
        <Link href="/receive" className="receive-link-main">
          <span className="receive-link-title">
            <Icon name="link" size={14} strokeWidth={1.7} />
            Your receive link
          </span>
          <span className="receive-link-url mono">{link ?? `@${username ?? "you"}`}</span>
        </Link>
        {link ? (
          <>
            <button
              type="button"
              className="icon-btn"
              onClick={copy}
              aria-label="Copy your receive link"
              title="Copy your receive link"
            >
              <Icon name={copied === "ok" ? "check" : "copy"} size={15} />
            </button>
            {canShare ? (
              <button
                type="button"
                className="icon-btn"
                onClick={share}
                aria-label="Share your receive link"
                title="Share your receive link"
              >
                <Icon name="share" size={15} />
              </button>
            ) : null}
          </>
        ) : null}
      </div>
      <span className="tiny muted" role="status" aria-live="polite">
        {copied === "ok"
          ? "Receive link copied."
          : copied === "failed"
            ? "Your browser blocked the clipboard. Select the link on the Receive page."
            : ""}
      </span>
      <Link href="/receive" className="dash-card-action get-paid-details">
        Receiving details
        <Icon name="chevronRight" size={15} />
      </Link>
    </>
  );
}
