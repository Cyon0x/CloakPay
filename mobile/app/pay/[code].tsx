import React, { useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Link, useLocalSearchParams } from "expo-router";
import QRCode from "react-native-qrcode-svg";
import { api } from "../../src/api";
import { useAuth } from "../../src/auth";
import { Button, Card, Field, Loading, Notice } from "../../src/components/ui";
import { Receipt } from "../../src/components/Receipt";
import { useSettlement } from "../../src/settlement";
import { isUnlocked } from "../../src/wallet";
import { loadPool, type PoolInfo } from "../../src/pool";
import { formatWei } from "../../src/format";
import { color, radius, space, type } from "../../src/theme";

interface CheckoutLink {
  code: string;
  title: string | null;
  description: string | null;
  amountWei: string | null;
  denominationId: string | null;
  mode: string;
  reusable: boolean;
  uses: number;
  maxUses: number | null;
  expiresAt: string | null;
  claimable: boolean;
  reason: string | null;
  recipient: { username: string | null; displayName: string | null; avatarUrl: string | null };
}

const BLOCKERS: Record<string, string> = {
  expired: "This link has expired.",
  exhausted: "This link has reached its usage limit.",
  disabled: "The owner has switched this link off.",
};

/**
 * The payer's side of a payment link.
 *
 * The recipient's address is not part of what this screen receives. It is handed
 * over by the settlement endpoint at the moment the payer commits, which is why
 * opening a link never reveals the wallet behind a username.
 */
export default function Checkout() {
  const { code } = useLocalSearchParams<{ code: string }>();
  const { ready, user } = useAuth();
  const [link, setLink] = useState<CheckoutLink | null>(null);
  const [pool, setPool] = useState<PoolInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [passphrase, setPassphrase] = useState("");
  const [understood, setUnderstood] = useState(false);
  const settlement = useSettlement();

  useEffect(() => {
    if (!code) return;
    Promise.all([
      api<{ link: CheckoutLink }>(`/api/links/${code}`, { anonymous: true }),
      loadPool(),
    ])
      .then(([linkData, poolData]) => {
        setLink(linkData.link);
        setPool(poolData);
      })
      .catch((caught) => setError((caught as Error).message));
  }, [code]);

  if (!ready || (!link && !error)) return <Loading label="Loading the request" />;

  if (error) {
    return (
      <SafeAreaView style={styles.safe} edges={["top"]}>
        <ScrollView contentContainerStyle={styles.body}>
          <Text style={styles.eyebrow}>Payment request</Text>
          <Notice tone="error" title="That link is not usable">
            {error}
          </Notice>
        </ScrollView>
      </SafeAreaView>
    );
  }

  const current = link as CheckoutLink;
  const poolDeployed = Boolean(pool?.pool.deployed);
  const isOwner = Boolean(user?.username && user.username === current.recipient.username);
  const privateRequested = current.mode === "private";

  if (settlement.state.phase === "confirmed" || settlement.state.phase === "submitted") {
    const { intent, txHash } = settlement.state;
    return (
      <SafeAreaView style={styles.safe} edges={["top"]}>
        <ScrollView contentContainerStyle={styles.body}>
          <Text style={styles.eyebrow}>Receipt</Text>
          <Card style={styles.card}>
            <Receipt
              amountLabel={formatWei(BigInt(intent.amountWei))}
              txHash={txHash}
              status={settlement.state.phase === "confirmed" ? "confirmed" : "submitted"}
              blockNumber={settlement.state.phase === "confirmed" ? settlement.state.blockNumber : null}
              recipient={current.recipient.username ?? "recipient"}
            />
          </Card>
          <Link href="/(tabs)" asChild>
            <Button title="Back to home" variant="secondary" style={styles.action} />
          </Link>
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <Text style={styles.eyebrow}>Payment request</Text>
        <Text style={styles.title}>
          {current.amountWei ? `${formatWei(BigInt(current.amountWei))} HYPE` : "Open amount"}
        </Text>
        <Text style={styles.muted}>
          to @{current.recipient.username ?? "unknown"}
          {current.recipient.displayName ? ` · ${current.recipient.displayName}` : ""}
        </Text>

        <Card style={styles.card}>
          {current.title ? <Text style={styles.cardTitle}>{current.title}</Text> : null}
          {current.description ? <Text style={styles.muted}>{current.description}</Text> : null}
          <View style={styles.meta}>
            <Meta label="Asset" value="HYPE" />
            <Meta label="Uses" value={current.maxUses ? `${current.uses} of ${current.maxUses}` : `${current.uses}`} />
            <Meta
              label="Expires"
              value={current.expiresAt ? new Date(current.expiresAt).toLocaleDateString() : "Never"}
            />
          </View>
          {/* The code identifies the request; it is not a secret and cannot be spent. */}
          <View style={styles.qrWrap}>
            <QRCode value={current.code} size={112} backgroundColor={color.paper0} color={color.ink950} />
          </View>
        </Card>

        {!current.claimable ? (
          <Notice tone="warn" title="Not claimable">
            {BLOCKERS[current.reason ?? ""] ?? "The link is no longer usable."}
          </Notice>
        ) : isOwner ? (
          <Notice tone="info" title="This is your own link">
            Open it from another account to test the payer&apos;s side.
          </Notice>
        ) : !user ? (
          <>
            <Notice tone="info" title="Sign in to pay">
              CloakPay needs an account so the payment lands in your history and the receipt has an owner.
              Google and X are the only options.
            </Notice>
            <Link href={`/signin?next=/pay/${current.code}`} asChild>
              <Button title="Sign in and continue" style={styles.action} />
            </Link>
          </>
        ) : privateRequested && !poolDeployed ? (
          <Notice tone="warn" title="This link asks for a private payment">
            Its owner requested a shielded payment, and the pool has no deployment on this network yet.
            CloakPay will not settle it as a public transfer, because that would not be the payment that was
            asked for.
          </Notice>
        ) : settlement.state.phase === "failed" ? (
          <>
            <Notice tone="error" title="Payment did not go through">
              {settlement.state.message}
            </Notice>
            <Button title="Try again" variant="secondary" style={styles.action} onPress={settlement.reset} />
          </>
        ) : settlement.state.phase === "ready" || settlement.state.phase === "signing" ? (
          <Card style={styles.card}>
            <Field
              label="Wallet passphrase"
              value={passphrase}
              onChangeText={setPassphrase}
              secureTextEntry
              editable={!isUnlocked()}
              placeholder={isUnlocked() ? "Already unlocked this session" : "Unlock to sign"}
            />
            <Pressable
              accessibilityRole="checkbox"
              accessibilityState={{ checked: understood }}
              onPress={() => setUnderstood(!understood)}
              style={styles.checkRow}
            >
              <View style={[styles.checkbox, understood && styles.checkboxOn]} />
              <Text style={styles.checkLabel}>
                I understand this is a public transfer. The amount, my wallet and theirs are all visible on
                chain.
              </Text>
            </Pressable>
            <View style={styles.actions}>
              <Button
                title="Pay now"
                loading={settlement.state.phase === "signing"}
                disabled={!understood}
                style={styles.grow}
                onPress={() => settlement.confirm(passphrase)}
              />
              <Button title="Cancel" variant="ghost" onPress={settlement.reset} />
            </View>
          </Card>
        ) : (
          <Card style={styles.card}>
            <Text style={styles.muted}>
              Paying with the wallet on this device. The next step shows exactly what will be sent and the
              network fee, then you confirm.
            </Text>
            <Button
              title={settlement.state.phase === "preparing" ? "Preparing…" : "Continue to payment"}
              loading={settlement.state.phase === "preparing"}
              style={styles.action}
              onPress={() =>
                settlement.prepare({
                  linkCode: current.code,
                  denominationId: current.denominationId ?? "",
                  privacy: "public",
                })
              }
            />
          </Card>
        )}

        <Text style={styles.foot}>
          The link shows only what its owner chose to disclose. It never contains a key or a spending secret,
          and your wallet address is not sent to the recipient&apos;s profile.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metaRow}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.metaValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: color.paper50 },
  body: { padding: space.xl, paddingBottom: 120, gap: space.sm },
  eyebrow: { ...type.label, color: color.slate500 },
  title: { ...type.display, color: color.ink950 },
  muted: { ...type.small, color: color.slate600 },
  card: { marginTop: space.md },
  cardTitle: { ...type.heading, color: color.ink950, marginBottom: 4 },
  meta: { marginTop: space.md, gap: 2 },
  metaRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 4 },
  label: { ...type.label, color: color.slate500 },
  metaValue: { fontSize: 14, color: color.ink900, fontWeight: "500" },
  qrWrap: { alignSelf: "center", marginTop: space.lg },
  action: { marginTop: space.md },
  checkRow: { flexDirection: "row", alignItems: "flex-start", gap: space.md, marginTop: space.lg },
  checkbox: { width: 18, height: 18, borderRadius: 4, borderWidth: 1, borderColor: color.lineStrong, marginTop: 2 },
  checkboxOn: { backgroundColor: color.ink900, borderColor: color.ink900 },
  checkLabel: { ...type.tiny, color: color.slate700, flex: 1 },
  actions: { flexDirection: "row", gap: space.sm, marginTop: space.lg, alignItems: "center" },
  grow: { flex: 1 },
  foot: { ...type.tiny, color: color.slate500, marginTop: space.lg },
});
