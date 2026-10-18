import React, { useCallback, useEffect, useState } from "react";
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { api, APP_URL } from "../../src/api";
import { useAuth } from "../../src/auth";
import { useNotifications } from "../../src/notifications";
import { Badge, Button, Card, Field, Loading, Mono, Notice } from "../../src/components/ui";
import { Lockup } from "../../src/components/Logo";
import { activeChain } from "../../src/chain";
import { hasWalletOnDevice, isUnlocked } from "../../src/wallet";
import { color, radius, space, type } from "../../src/theme";
import { readableError } from "../../src/errors";

interface WalletResponse {
  wallet: { address: string | null; viewingKeyId: string | null } | null;
}

/**
 * You.
 *
 * Account, wallet, recovery and sign out live here. Notifications have their
 * own tab, so this screen only points at the inbox. Nothing on this screen
 * states a custody claim the implementation cannot back: the wallet is
 * described as self-custodial because the key is generated on the device and
 * the server only ever holds a sealed envelope.
 */
export default function Settings() {
  const router = useRouter();
  const { user, signOut } = useAuth();
  const { unread } = useNotifications();
  const [wallet, setWallet] = useState<WalletResponse["wallet"]>(null);
  const [onDevice, setOnDevice] = useState(false);
  const [loading, setLoading] = useState(true);
  const [displayName, setDisplayName] = useState(user?.displayName ?? "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [walletData, device] = await Promise.all([
        api<WalletResponse>("/api/wallet"),
        hasWalletOnDevice(),
      ]);
      setWallet(walletData.wallet);
      setOnDevice(device);
    } catch (caught) {
      setError(readableError(caught, 'Your account details could not be loaded. Try again.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function saveName() {
    setSaving(true);
    setError(null);
    try {
      await api("/api/onboarding", {
        method: "POST",
        body: JSON.stringify({ step: "complete", displayName: displayName || undefined }),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 1800);
    } catch (caught) {
      setError(readableError(caught, 'Your account details could not be loaded. Try again.'));
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <Loading label="Loading your settings" />;

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <ScrollView contentContainerStyle={styles.body}>
        <View style={styles.header}>
          <Lockup markSize={24} />
        </View>
        <View style={styles.identityCard}>
          <View style={styles.identityAvatar}>
            <Text style={styles.identityInitial}>{(user?.displayName ?? user?.username ?? "C").slice(0, 1).toUpperCase()}</Text>
          </View>
          <View style={styles.identityCopy}>
            <Text style={styles.identityEyebrow}>CloakPay account</Text>
            <Text style={styles.title}>@{user?.username}</Text>
            <Text style={styles.muted}>{user?.displayName ?? "No display name set"}</Text>
          </View>
          <Badge kind="public" />
        </View>

        {error ? (
          <View style={styles.block}>
            <Notice tone="error">{error}</Notice>
          </View>
        ) : null}

        <Card style={styles.card}>
          <Text style={styles.cardTitle}>Profile</Text>
          <Field label="Display name" value={displayName} onChangeText={setDisplayName} maxLength={60} placeholder="Your name" />
          <View style={styles.fieldGap} />
          <Field label="Username" value={user?.username ?? ""} editable={false} onChangeText={() => undefined} hint="Usernames are unique and case-insensitive. Changing one is not supported yet." />
          <Button
            title={saved ? "Saved" : "Save profile"}
            variant="secondary"
            loading={saving}
            onPress={saveName}
            style={styles.action}
          />
        </Card>

        <Card style={styles.card}>
          <Text style={styles.cardTitle}>Signed in with</Text>
          <View style={styles.kv}>
            <Text style={styles.kvValue}>Google or X</Text>
            <Badge kind="confirmed" />
          </View>
          <Text style={styles.hint}>
            The provider account id is the identity CloakPay stores. A display name or an email address is
            never used as the account key, and two accounts are never merged because they look similar.
          </Text>
        </Card>

        <Card style={styles.card}>
          <Text style={styles.cardTitle}>Wallet</Text>
          {wallet ? (
            <>
              <View style={styles.kv}>
                <Text style={styles.label}>Status</Text>
                <Text style={styles.kvValue}>Self-custodial</Text>
              </View>
              <Text style={styles.hint}>
                View or copy your receiving address on the Receive screen.
              </Text>
              <View style={styles.kv}>
                <Text style={styles.label}>Unlocked this session</Text>
                <Text style={styles.kvValue}>{isUnlocked() ? "Yes" : "No"}</Text>
              </View>
              <Text style={styles.hint}>
                {onDevice
                  ? "The key was generated on this device and the sealed envelope is in the platform keychain. CloakPay holds a copy it cannot open."
                  : "This device has no sealed envelope yet. Restore from your recovery phrase, or unlock once with your passphrase and it will be stored here."}
              </Text>
            </>
          ) : (
            <Text style={styles.muted}>No wallet on this account. Finish setup to create one.</Text>
          )}
        </Card>

        <Card style={styles.card}>
          <Text style={styles.cardTitle}>Recovery</Text>
          <Text style={styles.muted}>
            Your twelve words restore the wallet on any device and are the only thing that can. The
            passphrase is a convenience that encrypts the local copy; CloakPay cannot reset either, and
            signing in with Google or X does not restore a wallet on its own.
          </Text>
        </Card>

        <Card style={styles.card}>
          <Text style={styles.cardTitle}>Privacy</Text>
          <Text style={styles.muted}>
            Payments settle on {activeChain.name}. A public transfer is visible to anyone who looks, and
            CloakPay labels it that way. Your activity list is private to your account and is never served
            from a public endpoint.
          </Text>
        </Card>

        <Card style={styles.card}>
          <Text style={styles.cardTitle}>Notifications</Text>
          <Text style={styles.hint}>
            Payments and confirmations live in the Alerts tab, with an unread count in the tab bar.
            Preview text never includes an amount or a counterparty.
          </Text>
          <Button
            title={unread > 0 ? `Open notifications · ${unread} unread` : "Open notifications"}
            variant="secondary"
            onPress={() => router.push("/notifications")}
            style={styles.action}
          />
        </Card>

        <Card style={styles.card}>
          <Text style={styles.cardTitle}>Network</Text>
          <View style={styles.kv}>
            <Text style={styles.label}>Chain</Text>
            <Text style={styles.kvValue}>{activeChain.name}</Text>
          </View>
          <View style={styles.kv}>
            <Text style={styles.label}>Chain id</Text>
            <Text style={styles.kvValue}>{activeChain.chainId}</Text>
          </View>
          <Pressable
            accessibilityRole="link"
            onPress={() => Linking.openURL(activeChain.explorerUrl)}
            style={styles.inline}
          >
            <Text style={styles.inlineText}>Open the explorer</Text>
          </Pressable>
        </Card>

        <Card style={styles.card}>
          <Text style={styles.cardTitle}>Legal and support</Text>
          <Text style={styles.muted}>
            The privacy policy and the terms live on the web app, which is also where the protocol write-up
            is. They are the same document you are agreeing to here.
          </Text>
          <Pressable
            accessibilityRole="link"
            onPress={() => Linking.openURL(`${APP_URL}/privacy`)}
            style={styles.inline}
          >
            <Text style={styles.inlineText}>Privacy policy</Text>
          </Pressable>
          <Pressable
            accessibilityRole="link"
            onPress={() => Linking.openURL(`${APP_URL}/terms`)}
            style={styles.inline}
          >
            <Text style={styles.inlineText}>Terms of service</Text>
          </Pressable>
          <Pressable
            accessibilityRole="link"
            onPress={() => Linking.openURL(`${APP_URL}/how-it-works`)}
            style={styles.inline}
          >
            <Text style={styles.inlineText}>How private payments work</Text>
          </Pressable>
        </Card>

        <Button title="Sign out" variant="danger" style={styles.action} onPress={() => signOut()} />

        <Text style={styles.foot}>
          CloakPay is a testnet product. Nothing here holds real value and it has not been independently
          audited.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: color.paper50 },
  body: { padding: space.xl, paddingBottom: 120, gap: space.sm },
  header: { marginBottom: space.md },
  title: { ...type.title, color: color.ink950 },
  muted: { ...type.small, color: color.slate600 },
  identityCard: { flexDirection: "row", alignItems: "center", gap: space.lg, padding: space.lg, borderWidth: 1, borderColor: color.glassBorder, borderRadius: radius.xl, backgroundColor: color.glassSurface, marginBottom: space.sm, shadowColor: "#14171b", shadowOpacity: 0.06, shadowRadius: 14, shadowOffset: { width: 0, height: 8 }, elevation: 3 },
  identityAvatar: { width: 54, height: 54, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: color.glassBorder, borderRadius: 17, backgroundColor: color.paper100 },
  identityInitial: { fontSize: 20, fontWeight: "600", color: color.ink900 },
  identityCopy: { flex: 1, minWidth: 0 },
  identityEyebrow: { ...type.label, color: color.slate500, marginBottom: 2 },
  block: { marginTop: space.md },
  card: { marginTop: space.md },
  cardTitle: { ...type.heading, color: color.ink950, marginBottom: 6 },
  label: { ...type.label, color: color.slate500 },
  hint: { ...type.tiny, color: color.slate600, marginTop: space.sm },
  kv: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 5, gap: space.md },
  kvValue: { fontSize: 14, fontWeight: "500", color: color.ink900 },
  fieldGap: { marginTop: space.md },
  action: { marginTop: space.lg },
  inline: { marginTop: space.sm, alignSelf: "flex-start" },
  inlineText: { color: color.accent700, fontWeight: "600", fontSize: 13 },
  foot: { ...type.tiny, color: color.slate500, marginTop: space.xl },
});
