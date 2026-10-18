"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/Icon";

export interface Recipient {
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
}

/**
 * Username lookup.
 *
 * This control deals in usernames only. The wallet behind an account is never
 * fetched, never rendered, and never returned to this component: the payer
 * picks a person, and the addressing stays on the server.
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
  const inputRef = useRef<HTMLInputElement>(null);

  // Focusing on mount is handy with a keyboard, but on a phone it opens the
  // keyboard and zooms the layout before the page has been read.
  useEffect(() => {
    if (autoFocus && window.matchMedia("(min-width: 760px)").matches) {
      inputRef.current?.focus();
    }
  }, [autoFocus]);

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
            ref={inputRef}
            aria-describedby="recipient-hint"
          />
        </span>
        <span className="hint" id="recipient-hint">
          Two or more characters. CloakPay resolves the account by username; there is no address to look up
          or paste.
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
                <Icon name="arrowRight" size={14} />
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {touched && !searching && query.trim().length >= 2 && results.length === 0 ? (
        <p className="tiny muted">No CloakPay account matches that username.</p>
      ) : null}
    </div>
  );
}
