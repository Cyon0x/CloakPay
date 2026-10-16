import React, { useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Redirect, useRouter } from "expo-router";
import * as Clipboard from "expo-clipboard";
import { api } from "../src/api";
import { useAuth } from "../src/auth";
import { Button, Card, Field, Loading, Mono, Notice } from "../src/components/ui";
import { Lockup } from "../src/components/Logo";
import { createWallet } from "../src/wallet";
import { activeChain } from "../src/chain";
import { color, radius, space, type } from "../src/theme";

type Stage = "username" | "wallet" | "recovery";

/**
 * Three steps: claim a username, choose a passphrase, write down the phrase.
 *
 * Everything that touches a secret happens on the device. The server is handed
 * the username, the public address, the viewing public key, and an envelope it
 * cannot open, and nothing else.
 */
export default function Onboarding() {
  const { ready, user, refresh } = useAuth();
  const router = useRouter();
  const [stage, setStage] = useState<Stage>("username");
  const [username, setUsername] = useState(user?.username ?? "");
  const [displayName, setDisplayName] = useState(user?.displayName ?? "");
  const [passphrase, setPassphrase] = useState("");
  const [confirm, setConfirm] = useState("");
  const [address, setAddress] = useState<string | null>(null);
  const [mnemonic, setMnemonic] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  if (!ready) return <Loading label="Loading your account" />;
  if (!user) return <Redirect href="/signin" />;
  if (user.onboardingStep === "complete") return <Redirect href="/(tabs)" />;

  async function claimUsername() {
    setBusy(true);
    setError(null);
    try {
      const check = await api<{ available: boolean; reason: string | null }>(
        `/api/username/check?u=${encodeURIComponent(username)}`,
        { anonymous: true },
      );
      if (!check.available) {
        setError(check.reason ?? "That username is not available.");
        return;
      }
      await api("/api/onboarding", {
        method: "POST",
        body: JSON.stringify({ step: "wallet", username, displayName: displayName || undefined }),
      });
      setStage("wallet");
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function create() {
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
      const { sealed, secret } = await createWallet(passphrase);
      await api("/api/wallet", {
        method: "POST",
        body: JSON.stringify({
          address: sealed.address,
          keyEnvelope: sealed.envelope,
          viewingPublicKey: sealed.viewingPublicKey,
          viewingKeyId: sealed.viewingKeyId,
        }),
      });
      setAddress(sealed.address);
      setMnemonic(secret.mnemonic);
      setStage("recovery");
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function finish() {
    setBusy(true);
    try {
      await api("/api/onboarding", { method: "POST", body: JSON.stringify({ step: "complete" }) });
      await refresh();
      router.replace("/(tabs)");
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <View style={styles.brand}>
          <Lockup markSize={26} />
        </View>
        <Text style={styles.title}>
          {stage === "username" ? "Three things and you are done" : stage === "wallet" ? "Secure your wallet" : "Write this down"}
        </Text>
        <Text style={styles.sub}>
          {stage === "username"
            ? "A username, a wallet, and a passphrase. Nothing else is needed before you can use CloakPay."
            : stage === "wallet"
              ? "Your passphrase encrypts the wallet on this device. Only you can open it, and CloakPay cannot reset it for you."
              : "These twelve words are the only way to restore this wallet. Nothing else can."}
        </Text>

        {error ? (
          <View style={styles.gap}>
            <Notice tone="error">{error}</Notice>
          </View>
        ) : null}

        {stage === "username" ? (
          <>
            <Card style={styles.gap}>
              <Field
                label="Username"
                prefix="@"
                value={username}
                onChangeText={(value) => setUsername(value.toLowerCase().replace(/[^a-z0-9_]/g, ""))}
                placeholder="cyon"
                autoCapitalize="none"
                maxLength={20}
                hint="Lowercase letters, numbers, underscores. 3 to 20 characters."
              />
              <View style={styles.fieldGap} />
              <Field
                label="Display name (optional)"
                value={displayName}
                onChangeText={setDisplayName}
                placeholder="Your name"
                maxLength={60}
                hint="Shown next to your username. You can change it later."
              />
            </Card>
            <Notice tone="info" title="Testnet">
              {activeChain.name} has no monetary value and CloakPay has not been audited.
            </Notice>
            <Button title="Claim username" loading={busy} onPress={claimUsername} style={styles.action} />
          </>
        ) : null}

        {stage === "wallet" ? (
          <>
            <Card style={styles.gap}>
              <Field
                label="Passphrase"
                value={passphrase}
                onChangeText={setPassphrase}
                secureTextEntry
                placeholder="At least 8 characters"
                hint="Longer is stronger. Do not reuse a password you use elsewhere."
              />
              <View style={styles.fieldGap} />
              <Field
                label="Confirm passphrase"
                value={confirm}
                onChangeText={setConfirm}
                secureTextEntry
                placeholder="Type it again"
              />
            </Card>
            <Notice tone="warn" title="There is no password reset">
              If you forget this passphrase you can still restore the wallet from the twelve words, which is
              the step after this one.
            </Notice>
            <Button title="Create wallet" loading={busy} onPress={create} style={styles.action} />
          </>
        ) : null}

        {stage === "recovery" ? (
          <>
            <Card style={styles.gap}>
              <Text style={styles.label}>Recovery phrase</Text>
              <Mono style={styles.mnemonic}>{mnemonic}</Mono>
              <Text style={styles.hint}>
                Anyone who has these words can spend this wallet. Keep them offline and never paste them into
                a message, a note, or a website.
              </Text>
              <Button
                title={copied ? "Copied" : "Copy to clipboard"}
                variant="secondary"
                style={styles.fieldGap}
                onPress={async () => {
                  await Clipboard.setStringAsync(mnemonic ?? "");
                  setCopied(true);
                }}
              />
            </Card>
            {address ? (
              <Card style={styles.gap}>
                <Text style={styles.hint}>
                  Your wallet is created. CloakPay does not print the address here: the Receive screen shows
                  it, under “Receive from external wallet”, for money arriving from outside CloakPay.
                </Text>
              </Card>
            ) : null}
            <Button
              title={copied ? "I have written it down" : "Copy and continue"}
              loading={busy}
              onPress={finish}
              style={styles.action}
            />
          </>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: color.paper50 },
  body: { padding: space.xl, paddingBottom: space.xxl, gap: space.md },
  brand: { marginBottom: space.md },
  title: { ...type.display, color: color.ink950 },
  sub: { ...type.small, color: color.slate600 },
  gap: { marginTop: space.xs },
  fieldGap: { marginTop: space.lg },
  action: { marginTop: space.sm },
  label: { ...type.label, color: color.slate500 },
  mnemonic: {
    fontSize: 16,
    lineHeight: 26,
    color: color.ink900,
    backgroundColor: color.paper100,
    borderRadius: radius.md,
    padding: space.lg,
  },
  hint: { ...type.tiny, color: color.slate600 },
});
