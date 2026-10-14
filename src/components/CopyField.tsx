"use client";

import { useEffect, useState } from "react";

/** Copy controls are the one place clipboard access is needed, so they are client-only. */
export function CopyField({
  value,
  label,
  multiline = false,
}: {
  value: string;
  label?: string;
  multiline?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const [shareable, setShareable] = useState(false);

  // navigator is only available in the browser, so the share affordance is
  // resolved after mount rather than during render.
  useEffect(() => {
    setShareable(typeof navigator !== "undefined" && "share" in navigator);
  }, []);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  }

  async function share() {
    try {
      if (navigator.share) await navigator.share({ text: value });
    } catch {
      /* the user dismissed the sheet */
    }
  }


  return (
    <div className="stack-sm">
      {label ? <span className="label">{label}</span> : null}
      <div className={multiline ? "code-line" : "input"} style={multiline ? undefined : { display: "flex", alignItems: "center" }}>
        <span className="mono truncate" style={{ flex: 1, fontSize: multiline ? undefined : 13 }}>
          {value}
        </span>
      </div>
      <div className="row" style={{ gap: 8 }}>
        <button type="button" className="btn btn-secondary btn-sm" onClick={copy}>
          {copied ? "Copied" : "Copy"}
        </button>
        {shareable ? (
          <button type="button" className="btn btn-ghost btn-sm" onClick={share}>
            Share
          </button>
        ) : null}
        <span className="tiny muted" aria-live="polite">
          {copied ? "Copied to the clipboard." : ""}
        </span>
      </div>
    </div>
  );
}
