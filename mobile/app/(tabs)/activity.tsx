import React, { useCallback, useState } from "react";
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "@react-navigation/native";
import { api } from "../../src/api";
import { explorerTx } from "../../src/chain";
import { Badge, Card, EmptyState, Loading } from "../../src/components/ui";
import { formatWei } from "../../src/format";
import { color, space, type } from "../../src/theme";

interface Payment {
  id: string;
  privacy: string;
  status: string;
  amount_wei: string | null;
  note: string | null;
  tx_hash: string | null;
  created_at: string;
  direction: string;
  counterparty: string | null;
}

export default function Activity() {
  const [loading, setLoading] = useState(true);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [error, setError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      api<{ payments: Payment[] }>("/api/payments")
        .then((data) => setPayments(data.payments))
        .catch((caught) => setError((caught as Error).message))
        .finally(() => setLoading(false));
    }, []),
  );

  if (loading) return <Loading />;

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <ScrollView contentContainerStyle={styles.body}>
        <Text style={styles.title}>Activity</Text>
        <Text style={styles.sub}>
          Every payment you sent or received. Private payments carry a Private badge; ordinary transfers are
          labelled Public.
        </Text>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        {payments.length === 0 ? (
          <View style={{ marginTop: space.xl }}>
            <EmptyState title="Nothing here yet" body="Payments you send or receive appear here with their real status." />
          </View>
        ) : (
          <Card style={{ marginTop: space.xl }}>
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
                  <Text style={styles.rowMeta}>
                    {payment.created_at.slice(0, 16).replace("T", " ")}
                    {payment.note ? ` · ${payment.note}` : ""}
                  </Text>
                  {payment.tx_hash ? (
                    <Pressable onPress={() => Linking.openURL(explorerTx(payment.tx_hash as string))}>
                      <Text style={styles.link}>Open on the explorer</Text>
                    </Pressable>
                  ) : (
                    <Text style={styles.rowMeta}>No on-chain record yet</Text>
                  )}
                </View>
                <Text style={styles.amount}>
                  {payment.direction === "sent" ? "−" : "+"}
                  {payment.amount_wei ? formatWei(BigInt(payment.amount_wei)) : "—"}
                </Text>
              </View>
            ))}
          </Card>
        )}

        <Text style={styles.footnote}>
          A private payment has no single public transfer that corresponds to it. Where a hash exists it is
          the deposit into the pool; the withdrawal that pays the recipient is a separate transaction the
          chain cannot connect to it.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: color.paper50 },
  body: { padding: space.xl, paddingBottom: space.xxl },
  title: { ...type.title, color: color.ink950 },
  sub: { ...type.small, color: color.slate600, marginTop: 6 },
  error: { ...type.small, color: color.err600, marginTop: space.lg },
  row: { flexDirection: "row", justifyContent: "space-between", paddingVertical: space.md, gap: space.md },
  rowMain: { flex: 1, gap: 5 },
  rowTitle: { fontSize: 14, fontWeight: "500", color: color.ink900 },
  rowMeta: { ...type.tiny, color: color.slate500 },
  badges: { flexDirection: "row", gap: 6, flexWrap: "wrap" },
  amount: { ...type.body, color: color.ink900, fontVariant: ["tabular-nums"] },
  divider: { borderTopWidth: 1, borderTopColor: color.lineSoft },
  link: { ...type.tiny, color: color.accent700, textDecorationLine: "underline" },
  footnote: { ...type.tiny, color: color.slate500, marginTop: space.xl, lineHeight: 18 },
});
