"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, Notice } from "@/components/ui";
import { Icon } from "@/components/Icon";
import { AMOUNT_PRESETS, validateAmount } from "@/lib/amount";
import { AmountInput } from "./payment/AmountInput";
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
  symbol,
  decimals,
  appUrl,
}: {
  symbol: string;
  decimals: number;
  appUrl: string;
}) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [oneTime, setOneTime] = useState(false);
  const [expires, setExpires] = useState("0");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<string | null>(null);

  const amountCheck = validateAmount(amount, {
    decimals,
    symbol,
  });
  // An empty amount is a link that lets the payer choose. Anything typed has to
  // be a real amount, so a typo cannot become a silently different request.
  const amountOk = amount.trim() === "" || amountCheck.ok;

  async function create() {
    if (!amountOk) {
      setError(amountCheck.ok ? null : amountCheck.reason);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/links", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: title.trim() || undefined,
          description: description.trim() || undefined,
          amount: amount.trim() || undefined,
          // A link makes no claim about how it settles, because the only way
          // to settle one now is an ordinary transfer between two CloakPay
          // accounts. `record` is that statement, and the server refuses a
          // request for a private link while that path is switched off.
          mode: "record",
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

          <AmountInput
            id="link-amount"
            value={amount}
            onChange={setAmount}
            symbol={symbol}
            decimals={decimals}
            balanceWei={null}
            presets={AMOUNT_PRESETS}
            label={`Amount in ${symbol}`}
            hint="Leave this empty for a link the payer decides the amount on."
          />

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
        <Card>
          <div style={{ padding: 22 }}>
            <p className="table-head">What a link can carry</p>
            <ul className="stack-sm" style={{ marginTop: 10, paddingLeft: 18, color: "var(--color-slate-700)" }}>
              <li>A username, so the payer knows who they are paying.</li>
              <li>A fixed amount and asset, or nothing at all.</li>
              <li>An expiry and a usage limit.</li>
            </ul>
            <p className="tiny muted" style={{ marginTop: 12 }}>
              Anyone who has the link can open it, so treat it as public.
            </p>
            <button
              className="btn btn-primary btn-block"
              style={{ marginTop: 18 }}
              disabled={busy || !amountOk}
              onClick={create}
            >
              {busy ? "Creating…" : "Create link"}
            </button>
          </div>
        </Card>
      </div>
    </div>
  );
}
