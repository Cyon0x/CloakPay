"use client";

import { useEffect, useRef, useState } from "react";
import { Badge, Notice } from "@/components/ui";
import { Icon } from "@/components/Icon";

export interface Recipient {
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  canReceivePrivately: boolean;
}

/** Username search. Results reveal a payment identity and nothing else. */
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
        <span className="label">Recipient</span>
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
          Two or more characters. You pay a username; the wallet behind it stays hidden.
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
                  {result.canReceivePrivately ? "Private ready" : "Public only"}
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

export function AmountPicker({
  denominations,
  value,
  onChange,
}: {
  denominations: { id: string; label: string }[];
  value: string;
  onChange: (id: string) => void;
}) {
  return (
    <fieldset className="fieldset">
      <legend className="label">Amount</legend>
      <div className="amount-grid">
        {denominations.map((denomination) => (
          <button
            key={denomination.id}
            type="button"
            className="amount-choice"
            aria-pressed={value === denomination.id}
            onClick={() => onChange(denomination.id)}
          >
            <span className="amount-value mono">{denomination.label.split(" ")[0]}</span>
            <span className="amount-unit">HYPE</span>
          </button>
        ))}
      </div>
      <p className="hint">
        The pool accepts fixed sizes only. Fixed denominations are what keep amounts from giving away
        which payment is which.
      </p>
    </fieldset>
  );
}

export function PrivacyPicker({
  value,
  onChange,
  poolDeployed,
}: {
  value: "private" | "public";
  onChange: (value: "private" | "public") => void;
  poolDeployed: boolean;
}) {
  return (
    <fieldset className="fieldset">
      <legend className="label">How it settles</legend>
      <div className="choice-list">
        <button
          type="button"
          className="choice"
          aria-pressed={value === "private"}
          disabled={!poolDeployed}
          onClick={() => onChange("private")}
        >
          <span className="choice-icon">
            <Icon name="shield" size={17} />
          </span>
          <span className="grow">
            <span className="choice-title">
              Private <Badge kind={poolDeployed ? "private" : "setup"} />
            </span>
            <span className="choice-body">
              {poolDeployed
                ? "Into the shielded pool. The chain sees a deposit and later a withdrawal, with nothing joining them."
                : "The shielded pool has no deployment on this network yet, so this cannot be selected."}
            </span>
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
              Direct transfer <Badge kind="public" />
            </span>
            <span className="choice-body">
              A normal HYPE transfer between two wallets. Anyone can look it up, including the amount and
              both addresses.
            </span>
          </span>
        </button>
      </div>
    </fieldset>
  );
}

export function Receipt({
  amountLabel,
  txHash,
  explorerUrl,
  status,
  blockNumber,
  recipient,
}: {
  amountLabel: string;
  txHash: string;
  explorerUrl: string;
  status: "submitted" | "confirmed" | "failed";
  blockNumber?: bigint | null;
  recipient: string;
}) {
  return (
    <div className="receipt">
      <div className="row-between">
        <p className="label" style={{ margin: 0 }}>
          Receipt
        </p>
        <Badge kind={status === "confirmed" ? "confirmed" : status === "failed" ? "failed" : "pending"} />
      </div>
      <p className="receipt-amount mono">{amountLabel} HYPE</p>
      <dl className="kv" style={{ marginTop: 14 }}>
        <dt>Paid to</dt>
        <dd className="mono">@{recipient}</dd>
        <dt>Settlement</dt>
        <dd>Direct transfer</dd>
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
        This transfer is public. The sender, recipient, amount and timing are all visible on chain.
      </p>
    </div>
  );
}

export function PoolUnavailableNotice({ faucetUrl }: { faucetUrl: string }) {
  return (
    <Notice tone="warn" title="Privacy is not switched on yet">
      The shielded pool contracts are written, compiled and covered by tests, but no deployment has been
      recorded for {""}
      this network. Until an address exists, CloakPay will not offer a private payment, and it will not
      quietly send a public one instead. Direct transfers are labelled Public wherever they appear.
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
