"use client";

import { useState } from "react";
import { Icon } from "@/components/Icon";

/**
 * Copy, and say whether it worked.
 *
 * Small enough to sit directly beside the value it copies, because that is
 * where a person reaches for it. When the browser refuses the clipboard — http,
 * or an embedded webview — the message says so and points at the value itself
 * rather than claiming a copy that did not happen.
 */
export function CopyButton({
  value,
  label,
  className = "btn btn-secondary btn-sm",
}: {
  value: string;
  /** What is being copied, for the accessible name: "Copy the username". */
  label: string;
  className?: string;
}) {
  const [state, setState] = useState<"idle" | "ok" | "failed">("idle");

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setState("ok");
    } catch {
      setState("failed");
    }
    setTimeout(() => setState("idle"), 2000);
  }

  return (
    <>
      <button
        type="button"
        className={className}
        onClick={copy}
        aria-label={`Copy ${label}`}
      >
        <Icon name={state === "ok" ? "check" : "copy"} size={14} />
        {state === "ok" ? "Copied" : "Copy"}
      </button>
      <span className="tiny muted" role="status" aria-live="polite">
        {state === "failed" ? "Your browser blocked the clipboard. Select the value to copy it." : ""}
      </span>
    </>
  );
}
