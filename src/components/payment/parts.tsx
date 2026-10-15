"use client";

import { useEffect, useRef, useState } from "react";
import { Badge, Notice } from "@/components/ui";
import { Icon } from "@/components/Icon";
import { validateExternalAddress } from "@/lib/address";

export interface Recipient {
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  canReceivePrivately: boolean;
}

/**
 * Username lookup for the private flow.
 *
 * This control deals in usernames only. The wallet behind the account is never
 * fetched, never rendered, and never returned to this component, so a private
 * payment cannot leak an address through the payer's own screen.
 */
export function RecipientPicker({
  value,
  onSelect,
  autoFocus,
}: {
  value: Recipient | null;
  onSelect: (recipient: Recipient | null) => void;
  autoFocus?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Recipient[]>([]);
  const [searching, setSearching] = useState(false);
  const [touched, setTouched] = useState(false);
  const requestId = useRef(0);

  useEffect(() => {
    if (value) return;
    const trimmed = query.trim().replace(/^@/, "");
    if (trimmed.length < 2) {
      setResults([]);
      return;
    }
    setSearching(true);
    const id = ++requestId.current;
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(`/api/users/search?q=${encodeURIComponent(trimmed)}`, {
          cache: "no-store",
        });
        const body = await response.json();
        if (id === requestId.current) setResults(body.ok ? body.data.results : []);
      } catch {
        if (id === requestId.current) setResults([]);
      } finally {
        if (id === requestId.current) setSearching(false);
      }
    }, 220);
    return () => clearTimeout(timer);
  }, [query, value]);

  if (value) {
    return (
      <div className="chosen">
        <span className="avatar" aria-hidden="true">
          {value.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={value.avatarUrl} alt="" />
          ) : (
            value.username.slice(0, 1).toUpperCase()
          )}
        </span>
        <span className="grow">
          <span className="chosen-name">@{value.username}</span>
          <span className="tiny muted">{value.displayName ?? "CloakPay account"}</span>
        </span>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={() => {
            onSelect(null);
            setQuery("");
          }}
        >
          <Icon name="close" size={14} />
          Change
        </button>
      </div>
    );
  }

  return (
    <div className="search-block">
      <label className="field">
        <span className="label">Recipient username</span>
        <span className="input-with-icon">
          <Icon name="search" size={16} className="input-icon" />
          <input
            className="input mono"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setTouched(true);
            }}
            placeholder="username"
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            autoFocus={autoFocus}
            aria-describedby="recipient-hint"
          />
        </span>
        <span className="hint" id="recipient-hint">
          Two or more characters. CloakPay resolves the account by username; a wallet address has no place in
          this form.
        </span>
      </label>

      {searching ? <p className="tiny muted">Searching…</p> : null}

      {results.length > 0 ? (
        <ul className="result-list" role="listbox" aria-label="Matching usernames">
          {results.map((result) => (
            <li key={result.username}>
              <button type="button" className="result" onClick={() => onSelect(result)}>
                <span className="avatar" aria-hidden="true">
                  {result.avatarUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={result.avatarUrl} alt="" />
                  ) : (
                    result.username.slice(0, 1).toUpperCase()
                  )}
                </span>
                <span className="grow">
                  <span className="chosen-name">@{result.username}</span>
                  <span className="tiny muted">{result.displayName ?? "CloakPay account"}</span>
                </span>
                <Badge kind={result.canReceivePrivately ? "private" : "setup"}>
                  {result.canReceivePrivately ? "Private ready" : "No viewing key"}
                </Badge>
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {touched && !searching && query.trim().length >= 2 && results.length === 0 ? (
        <p className="tiny muted">No account matches that username.</p>
      ) : null}
    </div>
  );
}

/**
 * The external-wallet destination field.
 *
 * This is the only place in the product that asks for an address, and it is
 * paired with a plain statement that the transfer is public. Validation reports
 * shape, checksum, zero-address and self-send problems rather than letting a
 * doomed transfer reach the signing step.
 */
export function AddressPicker({
  value,
  onChange,
  self,
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  self?: string | null;
  disabled?: boolean;
}) {
  const [focused, setFocused] = useState(false);
  const trimmed = value.trim();
  const result = validateExternalAddress(trimmed, self);
  const showError = !focused && trimmed !== "" && !result.ok;

  return (
    <label className="field">
      <span className="label">Recipient wallet address</span>
      <input
        className="input mono"
        value={value}
        onChange={(event) => onChange(event.target.value.trim())}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        placeholder="0x…"
        autoComplete="off"
        autoCapitalize="none"
        spellCheck={false}
        disabled={disabled}
        aria-invalid={showError || undefined}
        aria-describedby="address-hint"
      />
      <span className="hint" id="address-hint" aria-live="polite">
        {showError ? (
          <span className="hint-error">{result.reason}</span>
        ) : (
          `An address on ${"Elysium Testnet"}. This transfer is public.`
        )}
      </span>
    </label>
  );
}

/**
 * The settlement choice.
 *
 * The two options are different recipients, not two settings for the same
 * transfer: one takes a CloakPay username and can only settle through the
 * shielded pool, the other takes a wallet address and settles as an ordinary
 * public transfer. Private is disabled unless the pool is deployed *and* the
 * client flow can spend a note.
 */
export function SettlementPicker({
  value,
  onChange,
  privateReady,
  privateBlocker,
}: {
  value: "private" | "public";
  onChange: (value: "private" | "public") => void;
  privateReady: boolean;
  privateBlocker: string;
}) {
  return (
    <fieldset className="fieldset">
      <legend className="label">How it settles</legend>
      <div className="choice-list">
        <button
          type="button"
          className="choice"
          aria-pressed={value === "private"}
          disabled={!privateReady}
          onClick={() => onChange("private")}
        >
          <span className="choice-icon">
            <Icon name="shield" size={17} />
          </span>
          <span className="grow">
            <span className="choice-title">
              Private — CloakPay users <Badge kind={privateReady ? "private" : "setup"} />
            </span>
            <span className="choice-body">
              Send to a CloakPay username using the supported private payment flow.
            </span>
            {!privateReady ? <span className="choice-note">{privateBlocker}</span> : null}
          </span>
        </button>
        <button
          type="button"
          className="choice"
          aria-pressed={value === "public"}
          onClick={() => onChange("public")}
        >
          <span className="choice-icon">
            <Icon name="external" size={17} />
          </span>
          <span className="grow">
            <span className="choice-title">
              Direct Transfer — External wallets <Badge kind="public" />
            </span>
            <span className="choice-body">
              Send a public on-chain transfer to an external wallet address.
            </span>
          </span>
        </button>
      </div>
    </fieldset>
  );
}

/**
 * Confirmation of a settled payment. Every value shown is read back from the
 * chain, and the two settlement paths are described differently because they
 * are different: a public transfer moves funds to an address, a private
 * payment spends a note.
 */
export function Receipt({
  amountLabel,
  symbol,
  txHash,
  explorerUrl,
  status,
  blockNumber,
  toLabel,
  toAddress,
  privacy = "public",
}: {
  amountLabel: string;
  symbol?: string;
  txHash: string;
  explorerUrl: string;
  status: "submitted" | "confirmed" | "failed";
  blockNumber?: bigint | null;
  toLabel: string;
  toAddress?: string | null;
  privacy?: "private" | "public";
}) {
  const isPrivate = privacy === "private";
  return (
    <div className="receipt">
      <div className="row-between">
        <p className="label" style={{ margin: 0 }}>
          Receipt
        </p>
        <Badge kind={status === "confirmed" ? "confirmed" : status === "failed" ? "failed" : "pending"} />
      </div>
      <p className="receipt-amount mono">
        {amountLabel} {symbol ?? "HYPE"}
      </p>
      <dl className="kv" style={{ marginTop: 14 }}>
        <dt>{isPrivate ? "Paid" : "Sent to"}</dt>
        <dd className="mono">{toLabel}</dd>
        {/* A private payment deliberately has no address to show: the pool
            published a nullifier and a commitment instead. */}
        {toAddress && !isPrivate ? (
          <>
            <dt>Address</dt>
            <dd className="mono" style={{ wordBreak: "break-all" }}>
              {toAddress}
            </dd>
          </>
        ) : null}
        <dt>Settlement</dt>
        <dd>{isPrivate ? "Private — shielded pool" : "Direct transfer"}</dd>
        {blockNumber !== undefined && blockNumber !== null ? (
          <>
            <dt>Block</dt>
            <dd className="mono">{blockNumber.toString()}</dd>
          </>
        ) : null}
      </dl>
      <div className="code-line mono" style={{ marginTop: 14 }}>
        {txHash}
      </div>
      <div className="row" style={{ gap: 10, marginTop: 14 }}>
        <a className="btn btn-secondary btn-sm" href={explorerUrl} target="_blank" rel="noreferrer noopener">
          <Icon name="external" size={14} />
          Open on the explorer
        </a>
      </div>
      <p className="tiny muted" style={{ marginTop: 12 }}>
        {isPrivate
          ? "The chain recorded a spent nullifier and a new commitment, not an address or a recipient. The note was sealed to the recipient's viewing key, so only they can open it."
          : "This transfer is public. The sender, recipient, amount and timing are all visible on chain."}
      </p>
    </div>
  );
}

/** The one sentence about the pool, shared so no two screens can disagree. */
export function PoolUnavailableNotice({ sentence, faucetUrl }: { sentence: string; faucetUrl?: string }) {
  return (
    <Notice tone="warn" title="Private payments are not open yet">
      {sentence} CloakPay will not quietly send a public transfer in place of a private one, so the private
      option stays disabled until it can be done properly.
      {faucetUrl ? (
        <>
          {" "}
          Testnet HYPE is available from the{" "}
          <a className="link" href={faucetUrl} target="_blank" rel="noreferrer noopener">
            Elysium faucet
          </a>
          .
        </>
      ) : null}
    </Notice>
  );
}
