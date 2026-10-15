"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createSealedWallet, stashSecret, addressFromMnemonic } from "@/lib/client/wallet";
import { Notice } from "./ui";

type Stage = "username" | "wallet" | "passphrase" | "recovery" | "done";

/**
 * Onboarding runs entirely in the browser until it has something safe to send:
 * the username, the public address, the viewing public key, and an envelope the
 * server cannot open.
 */
export function OnboardingWizard({
  initialUsername,
  initialDisplayName,
  initialStage = "username",
}: {
  initialUsername: string;
  initialDisplayName: string;
  /**
   * Where the wizard opens. Someone who already claimed a username resumes at
   * the wallet; asking them to claim one again is a loop, not progress.
   */
  initialStage?: Stage;
  /** Kept for completeness so the wizard cannot drift from the active network. */
  chainId?: number;
}) {
  const router = useRouter();
  const [stage, setStage] = useState<Stage>(initialStage);
  const [username, setUsername] = useState(initialUsername);
  const [displayName, setDisplayName] = useState(initialDisplayName);
  const [passphrase, setPassphrase] = useState("");
  const [confirm, setConfirm] = useState("");
  const [mnemonic, setMnemonic] = useState<string | null>(null);
  const [address, setAddress] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submitUsername() {
    setBusy(true);
    setError(null);
    try {
      // A failure to answer the question is not a "no" answer. Only a genuine
      // `available: false` means the name is unavailable; anything else says so
      // in its own words, because sending someone to try a different username
      // when the database is down just wastes their time.
      let check: { ok?: boolean; data?: { available?: boolean; reason?: string | null } };
      try {
        check = await fetch(`/api/username/check?u=${encodeURIComponent(username)}`).then((r) => r.json());
      } catch {
        setError("Couldn't check username availability. Please try again.");
        return;
      }
      if (!check.ok) {
        setError("Couldn't check username availability. Please try again.");
        return;
      }
      if (!check.data?.available) {
        setError(check.data?.reason ?? "That username is not available.");
        return;
      }

      let body: { ok?: boolean; error?: { message?: string } };
      try {
        body = await fetch("/api/onboarding", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ step: "wallet", username, displayName }),
        }).then((r) => r.json());
      } catch {
        setError("Couldn't save your username. Check your connection and try again.");
        return;
      }
      if (!body.ok) {
        setError(body.error?.message ?? "That did not work.");
        return;
      }
      setStage("wallet");
    } finally {
      setBusy(false);
    }
  }

  async function submitPassphrase() {
    setError(null);
    if (passphrase.length < 8) {
      setError("Use at least 8 characters. Length matters more than symbols.");
      return;
    }
    if (passphrase !== confirm) {
      setError("Those passphrases do not match.");
      return;
    }
    setBusy(true);
    try {
      const { sealed, secret } = await createSealedWallet(passphrase);
      const response = await fetch("/api/wallet", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          address: sealed.address,
          keyEnvelope: sealed.envelope,
          viewingPublicKey: sealed.viewingPublicKey,
          viewingKeyId: sealed.viewingKeyId,
        }),
      });
      const body = await response.json();
      if (!body.ok) {
        setError(body.error?.message ?? "Could not save the wallet.");
        return;
      }
      stashSecret(secret);
      setMnemonic(secret.mnemonic);
      setAddress(sealed.address);
      setStage("recovery");
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function finish() {
    setBusy(true);
    await fetch("/api/onboarding", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ step: "complete" }),
    });
    router.push("/dashboard");
    router.refresh();
  }

  return (
    <div className="stack">
      {error ? <Notice tone="error">{error}</Notice> : null}

      {stage === "username" ? (
        <section className="card" style={{ padding: 22 }}>
          <h2 style={{ fontSize: 17 }}>1. Claim your username</h2>
          <p className="tiny muted" style={{ marginTop: 6 }}>
            This is how people will pay you. It is unique and case-insensitive.
          </p>
          <div className="stack" style={{ marginTop: 16 }}>
            <label className="field">
              <span className="label">Username</span>
              <div className="row" style={{ gap: 8 }}>
                <span className="muted mono">@</span>
                <input
                  className="input mono"
                  value={username}
                  onChange={(event) => setUsername(event.target.value.toLowerCase())}
                  placeholder="cyon"
                  autoComplete="off"
                  spellCheck={false}
                  maxLength={20}
                />
              </div>
              <span className="hint">Lowercase letters, numbers, underscores. 3 to 20 characters.</span>
            </label>
            <label className="field">
              <span className="label">Display name (optional)</span>
              <input
                className="input"
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
                maxLength={60}
                placeholder="Eghosa"
              />
            </label>
            <button className="btn btn-primary" onClick={submitUsername} disabled={busy || username.length < 3}>
              {busy ? "Checking…" : "Continue"}
            </button>
          </div>
        </section>
      ) : null}

      {stage === "wallet" ? (
        <section className="card" style={{ padding: 22 }}>
          <h2 style={{ fontSize: 17 }}>2. Create your wallet</h2>
          <p className="tiny muted" style={{ marginTop: 6 }}>
            A 12-word recovery phrase is generated here, in your browser. CloakPay is self-custodial: the
            server never sees the phrase, and only stores an encrypted copy you unlock with a passphrase.
          </p>
          <button className="btn btn-primary" style={{ marginTop: 16 }} onClick={() => setStage("passphrase")}>
            Generate my wallet
          </button>
        </section>
      ) : null}

      {stage === "passphrase" ? (
        <section className="card" style={{ padding: 22 }}>
          <h2 style={{ fontSize: 17 }}>3. Choose a passphrase</h2>
          <p className="tiny muted" style={{ marginTop: 6 }}>
            It protects the backup copy of your wallet. A short PIN is weak enough to be guessed offline, so
            use at least 8 characters. A few unrelated words is ideal. Write it down somewhere separate
            from your recovery phrase.
          </p>
          <div className="stack" style={{ marginTop: 16 }}>
            <label className="field">
              <span className="label">Passphrase</span>
              <input
                className="input"
                type="password"
                value={passphrase}
                onChange={(event) => setPassphrase(event.target.value)}
                autoComplete="new-password"
              />
            </label>
            <label className="field">
              <span className="label">Confirm passphrase</span>
              <input
                className="input"
                type="password"
                value={confirm}
                onChange={(event) => setConfirm(event.target.value)}
                autoComplete="new-password"
              />
            </label>
            <button className="btn btn-primary" onClick={submitPassphrase} disabled={busy}>
              {busy ? "Sealing…" : "Create wallet"}
            </button>
          </div>
        </section>
      ) : null}

      {stage === "recovery" ? (
        <section className="card" style={{ padding: 22 }}>
          <h2 style={{ fontSize: 17 }}>4. Write down your recovery phrase</h2>
          <Notice tone="warn" title="This is the only real backup">
            These twelve words are your wallet. Anyone who has them can spend your funds. CloakPay cannot
            recover them for you, and your passphrase does not replace them.
          </Notice>
          <div className="code-line mono" style={{ marginTop: 16, fontSize: 14, lineHeight: 1.9 }}>
            {mnemonic}
          </div>
          {address ? (
            <p className="tiny muted" style={{ marginTop: 10 }}>
              Wallet address <span className="mono">{address}</span>
            </p>
          ) : null}
          <button className="btn btn-primary" style={{ marginTop: 16 }} onClick={finish} disabled={busy}>
            {busy ? "Finishing…" : "I have written it down"}
          </button>
        </section>
      ) : null}
    </div>
  );
}
