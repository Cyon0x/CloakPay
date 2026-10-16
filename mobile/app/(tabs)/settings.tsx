import React, { useCallback, useEffect, useState } from "react";
import { Linking, Pressable, ScrollView, StyleSheet, Switch, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { api, APP_URL } from "../../src/api";
import { useAuth } from "../../src/auth";
import { Badge, Button, Card, Field, Loading, Mono, Notice } from "../../src/components/ui";
import { Lockup } from "../../src/components/Logo";
import { activeChain } from "../../src/chain";
import { hasWalletOnDevice, isUnlocked } from "../../src/wallet";
import { color, radius, space, type } from "../../src/theme";

interface WalletResponse {
  wallet: { address: string | null; viewingKeyId: string | null } | null;
}

interface Notification {
  id: string;
  kind: string;
  title: string;
  body: string | null;
  read_at: string | null;
  created_at: string;
}

/**
 * You.
 *
 * Account, wallet, recovery, notifications and sign out live here. Nothing on
 * this screen states a custody claim the implementation cannot back: the wallet
 * is described as self-custodial because the key is generated on the device and
 * the server only ever holds a sealed envelope.
 */
export default function Settings() {
  const { user, signOut } = useAuth();
  const [wallet, setWallet] = useState<WalletResponse["wallet"]>(null);
  const [onDevice, setOnDevice] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [displayName, setDisplayName] = useState(user?.displayName ?? "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pushEnabled, setPushEnabled] = useState(true);

  const load = useCallback(async () => {
    try {
      const [walletData, notificationData, device] = await Promise.all([
        api<WalletResponse>("/api/wallet"),
        api<{ notifications: Notification[] }>("/api/notifications"),
        hasWalletOnDevice(),
      ]);
      setWallet(walletData.wallet);
      setNotifications(notificationData.notifications.slice(0, 4));
      setOnDevice(device);
    } catch (caught) {
      setError((caught as Error).message);
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
      setError((caught as Error).message);
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
        <Text style={styles.title}>@{user?.username}</Text>
        <Text style={styles.muted}>{user?.displayName ?? "No display name set"}</Text>

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
                The address this wallet receives at is on the Receive screen, under “Receive from external
                wallet”. It is the only place CloakPay shows one: payments here are addressed to usernames,
                not to addresses.
              </Text>
              <View style={styles.kv}>
                <Text style={styles.label}>Viewing key</Text>
                <Text style={styles.kvValue}>{wallet.viewingKeyId ? "Published" : "Missing"}</Text>
              </View>
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
          <View style={styles.kv}>
            <Text style={styles.cardTitle}>Notifications</Text>
            <Switch
              value={pushEnabled}
              onValueChange={setPushEnabled}
              trackColor={{ true: color.ink900, false: color.lineStrong }}
              accessibilityLabel="Notifications"
            />
          </View>
          <Text style={styles.hint}>
            {pushEnabled
              ? "In-app alerts for payments, links and account changes. Preview text never includes an amount or a counterparty."
              : "Turned off. Alerts still land in your activity list."}
          </Text>
          {notifications.length > 0 ? (
            <View style={styles.divider}>
              {notifications.map((item) => (
                <View key={item.id} style={styles.notification}>
                  <Text style={styles.notificationTitle}>{item.title}</Text>
                  {item.body ? <Text style={styles.hint}>{item.body}</Text> : null}
                </View>
              ))}
            </View>
          ) : null}
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
  divider: { marginTop: space.md, borderTopWidth: 1, borderTopColor: color.lineSoft, paddingTop: space.sm },
  notification: { paddingVertical: space.sm, gap: 2 },
  notificationTitle: { fontSize: 14, fontWeight: "500", color: color.ink900 },
  foot: { ...type.tiny, color: color.slate500, marginTop: space.xl },
});
