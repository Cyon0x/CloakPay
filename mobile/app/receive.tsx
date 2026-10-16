import React, { useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Share, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import * as Clipboard from "expo-clipboard";
import QRCode from "react-native-qrcode-svg";
import { api, APP_URL } from "../src/api";
import { useAuth } from "../src/auth";
import { Button, Card, Field, Notice } from "../src/components/ui";
import { loadPool, type PoolInfo } from "../src/pool";
import { color, radius, space, type } from "../src/theme";

/**
 * Receive.
 *
 * The QR encodes the same public profile URL a shared link uses, so a scan and
 * a paste land on the same page. The URL carries a username and nothing else:
 * no key, no secret, and no note.
 */
export default function Receive() {
  const { user } = useAuth();
  const router = useRouter();
  const [pool, setPool] = useState<PoolInfo | null>(null);
  const [wallet, setWallet] = useState<{ address: string | null } | null>(null);
  const [amount, setAmount] = useState("");
  const [title, setTitle] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    loadPool().then(setPool).catch(() => undefined);
  }, []);

  useEffect(() => {
    api<{ wallet: { address: string | null } | null }>("/api/wallet")
      .then((data) => setWallet(data.wallet))
      .catch(() => undefined);
  }, []);

  const username = user?.username ?? "";
  const identity = `${APP_URL}/u/${username}`;
  const linkUrl = created ? `${APP_URL}/pay/${created}` : null;

  async function copy(label: string, value: string) {
    await Clipboard.setStringAsync(value);
    setCopied(label);
    setTimeout(() => setCopied(null), 1600);
  }

  async function createLink() {
    setCreating(true);
    setError(null);
    try {
      const parsed = amount.trim();
      const body: Record<string, unknown> = {
        title: title.trim() || undefined,
        mode: "public",
        reusable: true,
      };
      if (parsed) {
        const denomination = pool?.pool.denominations.find(
          (item) => item.label.split(" ")[0] === parsed,
        );
        if (denomination) body.denominationId = denomination.id;
        else body.amount = parsed;
      }
      const result = await api<{ code: string }>("/api/links", {
        method: "POST",
        body: JSON.stringify(body),
      });
      setCreated(result.code);
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setCreating(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <Pressable accessibilityRole="button" onPress={() => router.back()} style={styles.back}>
          <Text style={styles.backText}>Back</Text>
        </Pressable>

        <Text style={styles.eyebrow}>Receive</Text>
        <Text style={styles.title}>@{username}</Text>
        <Text style={styles.muted}>
          Anyone who has this link can pay you by username. They never need your wallet address.
        </Text>

        <Card style={styles.card}>
          <View style={styles.qrWrap}>
            <QRCode value={identity} size={188} backgroundColor={color.paper0} color={color.ink950} />
          </View>
          <Text style={styles.qrCaption}>{identity}</Text>
          <View style={styles.actions}>
            <Button
              title={copied === "identity" ? "Copied" : "Copy link"}
              variant="secondary"
              style={styles.grow}
              onPress={() => copy("identity", identity)}
            />
            <Button
              title="Share"
              style={styles.grow}
              onPress={() => Share.share({ message: `Pay me on CloakPay: ${identity}` })}
            />
          </View>
          <Pressable accessibilityRole="button" onPress={() => router.push("/send")} style={styles.inline}>
            <Text style={styles.inlineText}>Send someone a payment instead</Text>
          </Pressable>
        </Card>

        <Card style={styles.card}>
          <Text style={styles.cardTitle}>Shielded pool — coming soon</Text>
          <Text style={styles.muted}>
            Private payments are coming soon. Until then, payments to @{username} arrive as ordinary
            transfers.
          </Text>
        </Card>

        <Card style={styles.card}>
          <Text style={styles.cardTitle}>Receive from external wallet</Text>
          {wallet?.address ? (
            <>
              <Text style={styles.addressText} selectable>
                {wallet.address}
              </Text>
              <View style={styles.actions}>
                <Button
                  title={copied === "address" ? "Copied" : "Copy address"}
                  variant="secondary"
                  style={styles.grow}
                  onPress={() => copy("address", wallet.address ?? "")}
                />
              </View>
              <Text style={styles.muted}>
                Use this address to receive HYPE from outside CloakPay.
              </Text>
            </>
          ) : (
            <Text style={styles.muted}>No wallet on this account yet.</Text>
          )}
        </Card>

        <Card style={styles.card}>
          <Text style={styles.cardTitle}>Create a payment link</Text>
          <Text style={styles.muted}>
            A link with a fixed amount is easier to pay than a bare request. Reusable by default; you can
            switch it off from Links.
          </Text>
          <View style={styles.fieldGap} />
          <Field label="Amount (optional)" value={amount} onChangeText={setAmount} placeholder="1" keyboardType="numeric" />
          <View style={styles.fieldGap} />
          <Field label="What is it for? (optional)" value={title} onChangeText={setTitle} placeholder="Rent" maxLength={80} />

          {error ? (
            <View style={styles.fieldGap}>
              <Notice tone="error">{error}</Notice>
            </View>
          ) : null}

          {linkUrl ? (
            <View style={styles.created}>
              <Text style={styles.label}>Your link is ready</Text>
              <Text style={styles.linkText} selectable>
                {linkUrl}
              </Text>
              <View style={styles.actions}>
                <Button
                  title={copied === "link" ? "Copied" : "Copy"}
                  variant="secondary"
                  style={styles.grow}
                  onPress={() => copy("link", linkUrl)}
                />
                <Button
                  title="Share"
                  style={styles.grow}
                  onPress={() => Share.share({ message: `Pay me on CloakPay: ${linkUrl}` })}
                />
              </View>
            </View>
          ) : (
            <Button title="Create link" loading={creating} onPress={createLink} style={styles.action} />
          )}
        </Card>

        <Text style={styles.foot}>
          A payment link is public by nature. Anyone who holds it can open it, and whoever opens it first
          claims a one-time link.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: color.paper50 },
  body: { padding: space.xl, paddingBottom: 120, gap: space.sm },
  back: { paddingVertical: space.sm, alignSelf: "flex-start" },
  backText: { color: color.accent700, fontWeight: "600", fontSize: 14 },
  eyebrow: { ...type.label, color: color.slate500 },
  title: { ...type.display, color: color.ink950 },
  muted: { ...type.small, color: color.slate600 },
  card: { marginTop: space.md },
  cardTitle: { ...type.heading, color: color.ink950, marginBottom: 6 },
  qrWrap: {
    alignSelf: "center",
    padding: space.lg,
    backgroundColor: color.paper0,
    borderWidth: 1,
    borderColor: color.lineSoft,
    borderRadius: radius.lg,
  },
  qrCaption: { ...type.tiny, color: color.slate500, textAlign: "center", marginTop: space.md },
  actions: { flexDirection: "row", gap: space.sm, marginTop: space.lg },
  grow: { flex: 1 },
  action: { marginTop: space.lg },
  inline: { marginTop: space.lg, alignSelf: "center" },
  inlineText: { color: color.accent700, fontWeight: "600", fontSize: 13 },
  label: { ...type.label, color: color.slate500 },
  fieldGap: { marginTop: space.md },
  created: { marginTop: space.md, gap: 6 },
  linkText: {
    ...type.small,
    color: color.ink900,
    backgroundColor: color.paper100,
    borderWidth: 1,
    borderColor: color.lineSoft,
    borderRadius: radius.sm,
    padding: space.md,
  },
  addressText: {
    ...type.small,
    color: color.ink900,
    backgroundColor: color.paper100,
    borderWidth: 1,
    borderColor: color.lineSoft,
    borderRadius: radius.sm,
    padding: space.md,
  },
  foot: { ...type.tiny, color: color.slate500, marginTop: space.lg },
});
