"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, Notice } from "@/components/ui";
import { Icon } from "@/components/Icon";
import { PrivacyPicker } from "./payment/parts";
import { CopyField } from "./CopyField";
import { QrCode } from "./QrCode";

/**
 * Creates a payment link.
 *
 * The link is an identifier, not a secret: it carries no key and no note. What
 * it reveals is a username, an optional amount, and an optional description,
 * all of which the owner typed on this screen.
 */
export function LinkComposer({
  denominations,
  poolDeployed,
  appUrl,
}: {
  denominations: { id: string; label: string }[];
  poolDeployed: boolean;
  appUrl: string;
}) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [denominationId, setDenominationId] = useState(denominations[1]?.id ?? denominations[0]?.id ?? "");
  const [mode, setMode] = useState<"private" | "public">(poolDeployed ? "private" : "public");
  const [oneTime, setOneTime] = useState(false);
  const [expires, setExpires] = useState("0");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<string | null>(null);

  async function create() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/links", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: title.trim() || undefined,
          description: description.trim() || undefined,
          denominationId,
          mode,
          reusable: !oneTime,
          maxUses: oneTime ? 1 : undefined,
          expiresInHours: expires === "0" ? undefined : Number(expires),
        }),
      });
      const body = await response.json();
      if (!body.ok) {
        setError(body.error?.message ?? "Could not create that link.");
        return;
      }
      setCreated(body.data.code);
      router.refresh();
    } catch {
      setError("Could not reach CloakPay. Check your connection.");
    } finally {
      setBusy(false);
    }
  }

  if (created) {
    const url = `${appUrl}/pay/${created}`;
    return (
      <Card>
        <div style={{ padding: 24 }}>
          <div className="row" style={{ gap: 8 }}>
            <Icon name="check" size={16} />
            <p className="table-head" style={{ margin: 0 }}>
              Link ready
            </p>
          </div>
          <div style={{ marginTop: 18 }}>
            <CopyField label="Share this link" value={url} />
          </div>
          <div style={{ marginTop: 22, textAlign: "center" }}>
            <QrCode value={url} />
          </div>
          <div className="row" style={{ gap: 8, marginTop: 20 }}>
            <Link href="/links" className="btn btn-primary btn-sm">
              Manage links
            </Link>
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => {
                setCreated(null);
                setTitle("");
                setDescription("");
              }}
            >
              Create another
            </button>
          </div>
        </div>
      </Card>
    );
  }

  return (
    <div className="split">
      <Card>
        <div style={{ padding: 22 }} className="stack">
          <label className="field">
            <span className="label">What is it for? (optional)</span>
            <input
              className="input"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              maxLength={80}
              placeholder="Split the studio rent"
            />
          </label>
          <label className="field">
            <span className="label">Description (optional)</span>
            <input
              className="input"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              maxLength={200}
              placeholder="Shown on the payment page"
            />
          </label>

          <fieldset className="fieldset">
            <legend className="label">Amount</legend>
            <div className="amount-grid">
              {denominations.map((denomination) => (
                <button
                  key={denomination.id}
                  type="button"
                  className="amount-choice"
                  aria-pressed={denominationId === denomination.id}
                  onClick={() => setDenominationId(denomination.id)}
                >
                  <span className="amount-value mono">{denomination.label.split(" ")[0]}</span>
                  <span className="amount-unit">HYPE</span>
                </button>
              ))}
            </div>
          </fieldset>

          <PrivacyPicker value={mode} onChange={setMode} poolDeployed={poolDeployed} />

          <fieldset className="fieldset">
            <legend className="label">Rules</legend>
            <div className="stack-sm">
              <label className="checkline">
                <input
                  type="checkbox"
                  checked={oneTime}
                  onChange={(event) => setOneTime(event.target.checked)}
                />
                <span className="tiny">One-time. It stops working after the first payment.</span>
              </label>
              <label className="field">
                <span className="label">Expires</span>
                <select
                  className="select"
                  value={expires}
                  onChange={(event) => setExpires(event.target.value)}
                >
                  <option value="0">Never</option>
                  <option value="24">In 24 hours</option>
                  <option value="168">In 7 days</option>
                  <option value="720">In 30 days</option>
                </select>
              </label>
            </div>
          </fieldset>
        </div>
      </Card>

      <div className="stack">
        {error ? <Notice tone="error">{error}</Notice> : null}
        {!poolDeployed ? (
          <Notice tone="warn" title="Private links are unavailable">
            Until the shielded pool has a recorded deployment, links can only request a direct transfer.
            The payer is told exactly that.
          </Notice>
        ) : null}
        <Card>
          <div style={{ padding: 22 }}>
            <p className="table-head">What a link can carry</p>
            <ul className="stack-sm" style={{ marginTop: 10, paddingLeft: 18, color: "var(--color-slate-700)" }}>
              <li>A username, so the payer knows who they are paying.</li>
              <li>A fixed amount and asset, or nothing at all.</li>
              <li>An expiry and a usage limit.</li>
            </ul>
            <p className="tiny muted" style={{ marginTop: 12 }}>
              It never carries a private key, a note secret, or a wallet address. Anyone who has the link
              can open the page, which is worth remembering before you post it publicly.
            </p>
            <button className="btn btn-primary btn-block" style={{ marginTop: 18 }} disabled={busy} onClick={create}>
              {busy ? "Creating…" : "Create link"}
            </button>
          </div>
        </Card>
      </div>
    </div>
  );
}
