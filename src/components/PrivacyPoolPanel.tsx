"use client";

/**
 * The shielded pool, as the user operates it.
 *
 * Three actions, and nothing decorative:
 *
 *   * deposit  — move a fixed size of HYPE into the pool and keep the note;
 *   * list     — show the notes this device can actually spend, as derived
 *                from the pool's own events and the chain's nullifier set;
 *   * withdraw — pay one of those notes out to an external address.
 *
 * Everything secret stays in this tab. The proof is generated here, the note is
 * decrypted here, and the passphrase that unseals the wallet is never sent
 * anywhere. The server is only ever handed ciphertext.
 */
import { useCallback, useEffect, useState } from "react";
import { Card, Notice } from "@/components/ui";
import { Icon } from "@/components/Icon";
import { explorerTxUrl } from "@/lib/client/chain";
import { isUnlocked, unlockWallet, type WalletSecret } from "@/lib/client/wallet";
import {
  ShieldedError,
  balanceOf,
  shield,
  spendableNotes,
  withdrawPrivately,
  type ShieldedNote,
} from "@/lib/client/shielded";
import { validateExternalAddress } from "@/lib/address";
import { formatWei } from "@/lib/format";
import type { Hex } from "viem";

export interface PoolDenomination {
  id: string;
  label: string;
  wei: string;
}

type Result =
  | { kind: "deposit"; txHash: Hex; label: string }
  | { kind: "withdraw"; txHash: Hex; label: string };

export function PrivacyPoolPanel({
  denominations,
  symbol,
  walletAddress,
}: {
  denominations: PoolDenomination[];
  symbol: string;
  walletAddress: string | null;
}) {
  const [secret, setSecret] = useState<WalletSecret | null>(null);
  const [passphrase, setPassphrase] = useState("");
  const [unlocking, setUnlocking] = useState(false);
  const [unlockError, setUnlockError] = useState<string | null>(null);

  const [notes, setNotes] = useState<ShieldedNote[] | null>(null);
  const [notesError, setNotesError] = useState<string | null>(null);

  const [busy, setBusy] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);

  const [withdrawFrom, setWithdrawFrom] = useState<string | null>(null);
  const [withdrawTo, setWithdrawTo] = useState("");

  const refresh = useCallback(async (wallet: WalletSecret) => {
    setNotesError(null);
    try {
      setNotes(await spendableNotes(wallet));
    } catch (error) {
      setNotes(null);
      setNotesError(
        error instanceof ShieldedError
          ? error.message
          : "The shielded notes could not be read from the pool.",
      );
    }
  }, []);

  // A wallet unlocked earlier in the tab is reused, so returning to this page
  // does not ask for the passphrase a second time.
  useEffect(() => {
    if (!isUnlocked()) return;
    let cancelled = false;
    unlockWallet()
      .then((wallet) => {
        if (cancelled) return;
        setSecret(wallet);
        return refresh(wallet);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [refresh]);

  async function unlock() {
    setUnlocking(true);
    setUnlockError(null);
    try {
      const wallet = await unlockWallet(passphrase || undefined);
      setSecret(wallet);
      setPassphrase("");
      await refresh(wallet);
    } catch (error) {
      setUnlockError(error instanceof Error ? error.message : "The wallet could not be unlocked.");
    } finally {
      setUnlocking(false);
    }
  }

  async function deposit(denomination: PoolDenomination) {
    if (!secret) return;
    setBusy(`deposit:${denomination.id}`);
    setActionError(null);
    setResult(null);
    try {
      const { txHash } = await shield(secret, denomination.id);
      setResult({ kind: "deposit", txHash, label: denomination.label });
      await refresh(secret);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "The deposit did not go through.");
    } finally {
      setBusy(null);
    }
  }

  async function withdraw(note: ShieldedNote) {
    if (!secret) return;
    const destination = validateExternalAddress(withdrawTo, walletAddress);
    if (!destination.ok) {
      setActionError(destination.reason);
      return;
    }
    setBusy(`withdraw:${note.id ?? note.commitment.toString()}`);
    setActionError(null);
    setResult(null);
    try {
      const { txHash } = await withdrawPrivately(secret, {
        note,
        recipient: destination.address,
      });
      setResult({
        kind: "withdraw",
        txHash,
        label: `${formatWei(note.note.amountWei)} ${symbol}`,
      });
      setWithdrawFrom(null);
      setWithdrawTo("");
      await refresh(secret);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "The withdrawal did not go through.");
    } finally {
      setBusy(null);
    }
  }

  if (!walletAddress) {
    return (
      <Card>
        <div style={{ padding: 22 }}>
          <p className="table-head">No wallet yet</p>
          <p className="tiny muted" style={{ marginTop: 10 }}>
            Finish setting up your account and this page will hold your shielded notes.
          </p>
        </div>
      </Card>
    );
  }

  if (!secret) {
    return (
      <Card>
        <div style={{ padding: 22 }} className="stack">
          <p className="table-head">Unlock to use the pool</p>
          <p className="tiny muted">
            Depositing, sending and withdrawing all need the wallet that lives in this browser. The passphrase
            opens it here; it is never sent to CloakPay.
          </p>
          <label className="field">
            <span className="label">
              <Icon name="lock" size={13} /> Wallet passphrase
            </span>
            <input
              className="input"
              type="password"
              value={passphrase}
              onChange={(event) => setPassphrase(event.target.value)}
              autoComplete="current-password"
              placeholder="Your passphrase"
            />
          </label>
          {unlockError ? <p className="tiny hint-error">{unlockError}</p> : null}
          <button className="btn btn-primary btn-sm" disabled={unlocking} onClick={() => void unlock()}>
            {unlocking ? "Unlocking…" : "Unlock wallet"}
          </button>
        </div>
      </Card>
    );
  }

  const shieldedBalance = notes ? balanceOf(notes) : null;

  return (
    <div className="stack">
      <Card>
        <div style={{ padding: 22 }}>
          <div className="row-between">
            <p className="table-head">Shielded balance</p>
            <button className="btn btn-ghost btn-sm" onClick={() => void refresh(secret)}>
              <Icon name="refresh" size={14} />
              Refresh
            </button>
          </div>
          <p className="stat-value mono" style={{ marginTop: 10 }}>
            {notesError
              ? "—"
              : shieldedBalance === null
                ? "reading…"
                : `${formatWei(shieldedBalance)} ${symbol}`}
          </p>
          <p className="tiny muted" style={{ marginTop: 8 }}>
            Counted from the notes this device can decrypt whose commitment is in the pool&rsquo;s tree and
            whose nullifier the chain still reports as unspent. A deposit that has not been mined yet, or a
            note this device cannot open, is worth zero here.
          </p>
          {notesError ? (
            <div style={{ marginTop: 14 }}>
              <Notice tone="warn" title="The pool could not be read">
                {notesError}
              </Notice>
            </div>
          ) : null}
        </div>
      </Card>

      {result ? (
        <Notice tone="info" title={result.kind === "deposit" ? "Deposit confirmed" : "Withdrawal confirmed"}>
          {result.kind === "deposit"
            ? `${result.label} is shielded. The note is stored in this browser and on your account as ciphertext.`
            : `${result.label} was released to the address you chose. The pool published the nullifier, so the note can never be spent again.`}{" "}
          <a className="link" href={explorerTxUrl(result.txHash)} target="_blank" rel="noreferrer noopener">
            View the transaction
          </a>
        </Notice>
      ) : null}

      {actionError ? (
        <Notice tone="error" title="That did not go through">
          {actionError}
        </Notice>
      ) : null}

      <Card>
        <div style={{ padding: 22 }}>
          <p className="table-head">Deposit into the pool</p>
          <p className="tiny muted" style={{ marginTop: 8 }}>
            The amount you deposit is public: an observer sees that an address put one of these sizes in.
            What is not public is which note comes back out.
          </p>
          <div className="row" style={{ gap: 10, marginTop: 14, flexWrap: "wrap" }}>
            {denominations.map((denomination) => (
              <button
                key={denomination.id}
                className="btn btn-secondary btn-sm"
                disabled={busy !== null}
                onClick={() => void deposit(denomination)}
              >
                <Icon name="plus" size={14} />
                {busy === `deposit:${denomination.id}` ? "Depositing…" : denomination.label}
              </button>
            ))}
          </div>
        </div>
      </Card>

      <Card>
        <div style={{ padding: 22 }}>
          <p className="table-head">Your notes</p>
          {notes === null ? (
            <p className="tiny muted" style={{ marginTop: 10 }}>
              Reading the pool…
            </p>
          ) : notes.length === 0 ? (
            <p className="tiny muted" style={{ marginTop: 10 }}>
              No spendable notes. Deposit one above, or receive a private payment.
            </p>
          ) : (
            <ul style={{ listStyle: "none", margin: "14px 0 0", padding: 0 }}>
              {notes.map((note) => {
                const key = note.id ?? note.commitment.toString();
                const open = withdrawFrom === key;
                return (
                  <li key={key} className="stack-sm" style={{ paddingBottom: 12, marginBottom: 12 }}>
                    <div className="row-between">
                      <span className="row" style={{ gap: 8 }}>
                        <Icon name="shield" size={15} />
                        <span className="mono" style={{ fontSize: 14 }}>
                          {formatWei(note.note.amountWei)} {symbol}
                        </span>
                        <span className="tiny muted">
                          leaf {note.leafIndex} · {note.note.denominationId}
                        </span>
                      </span>
                      <button
                        className="btn btn-ghost btn-sm"
                        onClick={() => {
                          setWithdrawFrom(open ? null : key);
                          setActionError(null);
                        }}
                      >
                        {open ? "Cancel" : "Withdraw"}
                      </button>
                    </div>
                    {open ? (
                      <div className="stack-sm">
                        <label className="field">
                          <span className="label">External wallet address</span>
                          <input
                            className="input mono"
                            value={withdrawTo}
                            onChange={(event) => setWithdrawTo(event.target.value)}
                            placeholder="0x…"
                            autoComplete="off"
                            spellCheck={false}
                          />
                          <span className="hint">
                            This payout is a public transaction. The amount and the receiving address are
                            visible on chain, and the timing can be compared with deposits.
                          </span>
                        </label>
                        <button
                          className="btn btn-primary btn-sm"
                          disabled={busy !== null}
                          onClick={() => void withdraw(note)}
                        >
                          {busy === `withdraw:${key}` ? "Proving…" : "Prove and withdraw"}
                        </button>
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </Card>
    </div>
  );
}
