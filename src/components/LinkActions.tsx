"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "./Icon";

/** Copy and enable/disable for a single link row. */
export function LinkActions({
  code,
  url,
  status,
}: {
  code: string;
  url: string;
  status: string;
}) {
  const router = useRouter();
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  }

  async function toggle() {
    setBusy(true);
    try {
      await fetch(`/api/links/${code}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status: status === "active" ? "disabled" : "active" }),
      });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="row" style={{ gap: 6 }}>
      <button type="button" className="btn btn-ghost btn-sm" onClick={copy} aria-label={`Copy link ${code}`}>
        <Icon name={copied ? "check" : "copy"} size={14} />
        <span className="hide-sm">{copied ? "Copied" : "Copy"}</span>
      </button>
      <button
        type="button"
        className="btn btn-ghost btn-sm"
        onClick={toggle}
        disabled={busy}
        aria-label={status === "active" ? `Disable link ${code}` : `Enable link ${code}`}
      >
        {status === "active" ? "Disable" : "Enable"}
      </button>
    </div>
  );
}
