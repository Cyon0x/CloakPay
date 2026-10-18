import React, { useCallback, useState } from "react";
import { ScrollView, StyleSheet, Text, View, RefreshControl } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Link } from "expo-router";
import { useFocusEffect } from "@react-navigation/native";
import { api } from "../../src/api";
import { useAuth } from "../../src/auth";
import { Badge, Button, Card, EmptyState, Loading } from "../../src/components/ui";
import { Lockup } from "../../src/components/Logo";
import { Icon } from "../../src/components/Icon";
import { activeChain } from "../../src/chain";
import { readBalance } from "../../src/transfer";
import { formatWei } from "../../src/format";
import { color, radius, space, type } from "../../src/theme";

interface Payment {
  id: string;
  privacy: string;
  status: string;
  amount_wei: string | null;
  direction: string;
  counterparty: string | null;
  created_at: string;
}

interface WalletInfo {
  address: string | null;
  viewingKeyId: string | null;
}

export default function Dashboard() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [wallet, setWallet] = useState<WalletInfo | null>(null);
  const [balance, setBalance] = useState<bigint | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [paymentData, walletData] = await Promise.all([
        api<{ payments: Payment[] }>("/api/payments"),
        api<{ wallet: WalletInfo | null }>("/api/wallet"),
      ]);
      setPayments(paymentData.payments.slice(0, 5));
      setWallet(walletData.wallet);
      if (walletData.wallet?.address) {
        setBalance(await readBalance(walletData.wallet.address as `0x${string}`));
      }
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  if (loading) return <Loading label="Loading your account" />;

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <ScrollView
        contentContainerStyle={styles.body}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              load();
            }}
            tintColor={color.slate500}
          />
        }
      >
        <View style={styles.header}>
          <Lockup markSize={26} />
          <View style={styles.networkPill}>
            <View style={styles.networkDot} />
            <Text style={styles.networkText}>Elysium Testnet</Text>
          </View>
        </View>

        <Text style={styles.handle}>@{user?.username}</Text>
        <Text style={styles.heading}>{user?.displayName ? `Hello, ${user.displayName}` : "Your account"}</Text>
        <Text style={styles.sub}>
          {wallet ? `Payments on ${activeChain.name}, addressed to your username.` : "No wallet on this account yet."}
        </Text>

        {error ? (
          <Card style={styles.cardSpacing}>
            <Text style={styles.errorText}>{error}</Text>
          </Card>
        ) : null}

        <View style={styles.walletCard}>
          <View style={styles.walletOrb} pointerEvents="none" />
          <View style={styles.walletTop}>
            <Text style={styles.walletLabel}>Wallet balance</Text>
            <View style={styles.walletShield}>
              <Icon name="shield" size={15} color="rgba(255,255,255,0.72)" strokeWidth={1.6} />
            </View>
          </View>
          <Text style={styles.walletAmount} accessibilityLabel={balance === null ? "Balance unavailable" : `${formatWei(balance, 18, 6)} HYPE`}>
            {balance === null ? "—" : formatWei(balance, 18, 6)}
            <Text style={styles.walletUnit}>  {activeChain.nativeToken.symbol}</Text>
          </Text>
          <Text style={styles.walletMeta}>
            {wallet?.address ? `${activeChain.name} · read from the network` : "No wallet on this account yet"}
          </Text>
          <View style={styles.walletFoot}>
            <View style={styles.walletUser}>
              <Icon name="user" size={13} color="rgba(255,255,255,0.72)" strokeWidth={1.7} />
              <Text style={styles.walletUsername}>@{user?.username}</Text>
            </View>
            <Text style={styles.walletLive}>Live balance</Text>
          </View>
        </View>

        <View style={styles.actions}>
          <Link href="/(tabs)/send" asChild>
            <Button title="Send" style={styles.actionButton} />
          </Link>
          <Link href="/receive" asChild>
            <Button title="Receive" variant="secondary" style={styles.actionButton} />
          </Link>
          <Link href="/scan" asChild>
            <Button title="Scan" variant="secondary" style={styles.actionButton} />
          </Link>
        </View>

        <View style={styles.sectionHead}>
          <Text style={styles.sectionTitle}>Recent activity</Text>
          <Link href="/(tabs)/activity">
            <Text style={styles.viewAll}>View all</Text>
          </Link>
        </View>
        {payments.length === 0 ? (
          <EmptyState
            title="No payments yet"
            body="Create a payment link or share your username to receive your first payment."
          />
        ) : (
          <Card>
            {payments.map((payment, index) => (
              <View key={payment.id} style={[styles.row, index > 0 && styles.divider]}>
                <View style={styles.rowMain}>
                  <Text style={styles.rowTitle}>
                    {payment.direction === "sent" ? "To" : "From"} @{payment.counterparty ?? "unknown"}
                  </Text>
                  <View style={styles.badges}>
                    <Badge kind={payment.privacy} />
                    <Badge kind={payment.status} />
                  </View>
                </View>
                <Text style={styles.rowAmount}>
                  {payment.direction === "sent" ? "−" : "+"}
                  {payment.amount_wei ? formatWei(BigInt(payment.amount_wei)) : "—"}
                </Text>
              </View>
            ))}
          </Card>
        )}

        <View style={styles.comingSoon}>
          <View style={styles.comingSoonIcon}>
            <Icon name="activity" size={16} color={color.slate500} />
          </View>
          <View style={styles.comingSoonCopy}>
            <Text style={styles.comingSoonTitle}>Swap</Text>
            <Text style={styles.comingSoonText}>Exchange between assets inside CloakPay. Coming soon.</Text>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: color.paper50 },
  body: { padding: space.xl, paddingBottom: space.xxl + 24 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space.md, marginBottom: space.xl },
  networkPill: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 10, paddingVertical: 6, borderWidth: 1, borderColor: color.glassBorder, borderRadius: radius.pill, backgroundColor: color.glassSoft },
  networkDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: color.ok600 },
  networkText: { ...type.tiny, color: color.slate600, fontWeight: "500" },
  handle: { ...type.tiny, color: color.slate500 },
  heading: { ...type.title, color: color.ink950, marginTop: 2 },
  sub: { ...type.tiny, color: color.slate600, marginTop: 6 },
  walletCard: { position: "relative", overflow: "hidden", marginTop: space.xl, padding: space.xl, borderRadius: radius.xl + 2, borderWidth: 1, borderColor: "rgba(255,255,255,0.12)", backgroundColor: color.ink900, shadowColor: "#14171b", shadowOpacity: 0.24, shadowRadius: 22, shadowOffset: { width: 0, height: 14 }, elevation: 8 },
  walletOrb: { position: "absolute", right: -70, top: -92, width: 220, height: 220, borderRadius: 110, borderWidth: 1, borderColor: "rgba(255,255,255,0.08)" },
  walletTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space.md },
  walletLabel: { ...type.label, color: "rgba(255,255,255,0.56)" },
  walletShield: { width: 30, height: 30, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "rgba(255,255,255,0.1)", borderRadius: 10, backgroundColor: "rgba(255,255,255,0.05)" },
  walletAmount: { marginTop: space.lg, color: color.paper0, fontSize: 35, lineHeight: 41, letterSpacing: -1.1, fontWeight: "500", fontVariant: ["tabular-nums"] },
  walletUnit: { fontSize: 11, letterSpacing: 1.4, color: "rgba(255,255,255,0.5)", fontWeight: "600" },
  walletMeta: { ...type.tiny, color: "rgba(255,255,255,0.54)", marginTop: 6 },
  walletFoot: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space.md, marginTop: space.xl, paddingTop: space.md, borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.09)" },
  walletUser: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 10, paddingVertical: 6, borderWidth: 1, borderColor: "rgba(255,255,255,0.1)", borderRadius: radius.pill, backgroundColor: "rgba(255,255,255,0.05)" },
  walletUsername: { ...type.tiny, color: "rgba(255,255,255,0.88)", fontWeight: "500" },
  walletLive: { ...type.tiny, color: "rgba(255,255,255,0.46)" },
  actions: { flexDirection: "row", gap: space.sm, marginTop: space.md },
  actionButton: { flex: 1 },
  cardSpacing: { marginTop: space.lg },
  sectionHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space.md, marginTop: space.xxl, marginBottom: space.md },
  sectionTitle: { ...type.heading, color: color.ink950 },
  viewAll: { ...type.tiny, color: color.slate600, fontWeight: "500" },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: space.md, gap: space.md },
  divider: { borderTopWidth: 1, borderTopColor: color.glassBorder },
  rowMain: { flex: 1, gap: 5 },
  rowTitle: { fontSize: 14, color: color.ink900, fontWeight: "500" },
  badges: { flexDirection: "row", gap: 6, flexWrap: "wrap" },
  rowAmount: { ...type.body, color: color.ink900, fontVariant: ["tabular-nums"] },
  errorText: { ...type.small, color: color.err600 },
  comingSoon: { flexDirection: "row", alignItems: "center", gap: space.md, marginTop: space.xl, padding: space.lg, borderWidth: 1, borderColor: color.glassBorder, borderRadius: radius.lg, backgroundColor: color.glassSoft },
  comingSoonIcon: { width: 34, height: 34, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: color.glassBorder, borderRadius: 11, backgroundColor: color.glassStrong },
  comingSoonCopy: { flex: 1, gap: 2 },
  comingSoonTitle: { fontSize: 14, fontWeight: "600", color: color.ink900 },
  comingSoonText: { ...type.tiny, color: color.slate500 },
});
