import React, { useCallback, useState } from "react";
import { ScrollView, StyleSheet, Text, View, RefreshControl } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Link } from "expo-router";
import { useFocusEffect } from "@react-navigation/native";
import { api } from "../../src/api";
import { useAuth } from "../../src/auth";
import { Badge, Button, Card, EmptyState, Loading, StatRow } from "../../src/components/ui";
import { Lockup } from "../../src/components/Logo";
import { activeChain } from "../../src/chain";
import { readBalance } from "../../src/transfer";
import { loadPool, type PoolInfo } from "../../src/pool";
import { formatWei } from "../../src/format";
import { color, space, type } from "../../src/theme";

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
  const [pool, setPool] = useState<PoolInfo | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [paymentData, walletData, poolData] = await Promise.all([
        api<{ payments: Payment[] }>("/api/payments"),
        api<{ wallet: WalletInfo | null }>("/api/wallet"),
        loadPool(),
      ]);
      setPayments(paymentData.payments.slice(0, 5));
      setWallet(walletData.wallet);
      setPool(poolData);
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
        </View>

        <Text style={styles.handle}>@{user?.username}</Text>
        <Text style={styles.heading}>{user?.displayName ? `Hello, ${user.displayName}` : "Your account"}</Text>
        <Text style={styles.sub}>
          {wallet?.address
            ? `Wallet ${wallet.address.slice(0, 10)}…${wallet.address.slice(-6)} on ${activeChain.name}`
            : "No wallet on this account yet."}
        </Text>

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

        {error ? (
          <Card style={styles.cardSpacing}>
            <Text style={styles.errorText}>{error}</Text>
          </Card>
        ) : null}

        <Card style={styles.cardSpacing}>
          <StatRow
            label="Balance"
            value={balance === null ? "—" : `${formatWei(balance, 18, 4)} HYPE`}
            hint="Read from the Elysium RPC just now"
          />
          <View style={styles.divider} />
          <StatRow
            label="Private payments"
            value={pool?.pool.privateReady ? "Available" : "Unavailable"}
            hint={
              pool?.pool.privateReady
                ? "Send to a username through the shielded pool"
                : "The shielded pool is deployed, but the deposit and withdrawal flow is still being built"
            }
          />
        </Card>

        <Text style={styles.sectionTitle}>Recent activity</Text>
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
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: color.paper50 },
  body: { padding: space.xl, paddingBottom: space.xxl + 24 },
  header: { marginBottom: space.xl },
  handle: { ...type.tiny, color: color.slate500 },
  heading: { ...type.title, color: color.ink950, marginTop: 2 },
  sub: { ...type.tiny, color: color.slate600, marginTop: 6 },
  actions: { flexDirection: "row", gap: space.md, marginTop: space.xl },
  actionButton: { flex: 1 },
  cardSpacing: { marginTop: space.lg },
  divider: { height: 1, backgroundColor: color.lineSoft, marginVertical: space.md },
  sectionTitle: { ...type.heading, color: color.ink950, marginTop: space.xxl, marginBottom: space.md },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: space.md, gap: space.md },
  rowMain: { flex: 1, gap: 5 },
  rowTitle: { fontSize: 14, color: color.ink900, fontWeight: "500" },
  badges: { flexDirection: "row", gap: 6, flexWrap: "wrap" },
  rowAmount: { ...type.body, color: color.ink900, fontVariant: ["tabular-nums"] },
  errorText: { ...type.small, color: color.err600 },
});
