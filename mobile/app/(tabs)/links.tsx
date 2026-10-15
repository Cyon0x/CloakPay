import React, { useCallback, useState } from "react";
import { Pressable, ScrollView, Share, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Link } from "expo-router";
import { useFocusEffect } from "@react-navigation/native";
import * as Clipboard from "expo-clipboard";
import { APP_URL, api } from "../../src/api";
import { Badge, Button, Card, EmptyState, Field, Loading, Notice } from "../../src/components/ui";
import { loadPool, type PoolDenomination } from "../../src/pool";
import { formatWei } from "../../src/format";
import { color, radius, space, type } from "../../src/theme";

interface PaymentLink {
  code: string;
  title: string | null;
  amount_wei: string | null;
  mode: string;
  reusable: boolean;
  max_uses: number | null;
  uses: number;
  expires_at: string | null;
  status: string;
}

export default function Links() {
  const [loading, setLoading] = useState(true);
  const [links, setLinks] = useState<PaymentLink[]>([]);
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState("");
  const [amounts, setAmounts] = useState<PoolDenomination[]>([]);
  const [amountId, setAmountId] = useState("");
  const [oneTime, setOneTime] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<string | null>(null);

  const load = useCallback(() => {
    // Denominations come from the pool endpoint so this list is never a second
    // copy of what the contract actually accepts.
    loadPool()
      .then((pool) => {
        setAmounts(pool.pool.denominations);
        setAmountId((current) => current || pool.pool.denominations[1]?.id || pool.pool.denominations[0]?.id || "");
      })
      .catch(() => undefined);
    api<{ links: PaymentLink[] }>("/api/links")
      .then((data) => setLinks(data.links))
      .catch((caught) => setError((caught as Error).message))
      .finally(() => setLoading(false));
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  async function create() {
    setCreating(true);
    setError(null);
    try {
      const data = await api<{ code: string }>("/api/links", {
        method: "POST",
        // The composer on mobile offers direct transfer, because a private link
        // would need a pool deployment the server has not recorded.
        body: JSON.stringify({
          title: title.trim() || undefined,
          denominationId: amountId,
          mode: "public",
          reusable: !oneTime,
          maxUses: oneTime ? 1 : undefined,
        }),
      });
      setCreated(`${APP_URL}/pay/${data.code}`);
      setTitle("");
      load();
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setCreating(false);
    }
  }

  if (loading) return <Loading />;

  const url = created ?? "";

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <ScrollView contentContainerStyle={styles.body}>
        <Text style={styles.title}>Payment links</Text>
        <Text style={styles.sub}>
          A link is a request with a rule set. Share it anywhere; the payer signs in only when they pay.
        </Text>

        {error ? (
          <View style={{ marginTop: space.lg }}>
            <Notice tone="error">{error}</Notice>
          </View>
        ) : null}

        {created ? (
          <Card style={{ marginTop: space.lg }}>
            <Text style={styles.cardTitle}>Link ready</Text>
            <Text style={styles.codeText}>{url}</Text>
            <View style={styles.rowGap}>
              <Button title="Copy" variant="secondary" onPress={() => Clipboard.setStringAsync(url)} />
              <Button title="Share" onPress={() => Share.share({ message: url })} />
            </View>
          </Card>
        ) : null}

        <Card style={{ marginTop: space.lg }}>
          <Text style={styles.cardTitle}>New link</Text>
          <Field label="What is it for?" value={title} onChangeText={setTitle} placeholder="Optional" maxLength={80} />
          <Text style={[styles.label, { marginTop: space.lg }]}>Amount</Text>
          <View style={styles.amountRow}>
            {amounts.map((amount) => {
              const selected = amount.id === amountId;
              return (
                <Pressable
                  key={amount.id}
                  onPress={() => setAmountId(amount.id)}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  style={[styles.amount, selected && styles.amountSelected]}
                >
                  <Text style={[styles.amountValue, selected && styles.amountValueSelected]}>
                    {amount.label.split(" ")[0]}
                  </Text>
                  <Text style={[styles.amountUnit, selected && styles.amountValueSelected]}>HYPE</Text>
                </Pressable>
              );
            })}
          </View>
          <Pressable onPress={() => setOneTime(!oneTime)} style={styles.checkRow} accessibilityRole="checkbox" accessibilityState={{ checked: oneTime }}>
            <View style={[styles.checkbox, oneTime && styles.checkboxOn]} />
            <Text style={styles.checkLabel}>One-time. It stops working after the first payment.</Text>
          </Pressable>
          <Button title="Create link" loading={creating} onPress={create} style={{ marginTop: space.lg }} />
          <Text style={styles.hint}>
            Links can only request a direct transfer until the shielded pool has a deposit and withdrawal
            flow, and the payer is told exactly that.
          </Text>
        </Card>

        <Text style={styles.sectionTitle}>Your links</Text>
        {links.length === 0 ? (
          <EmptyState title="No links yet" body="A link is the fastest way to get paid by someone who has never used CloakPay." />
        ) : (
          <Card>
            {links.map((link, index) => {
              const expired = link.expires_at ? new Date(link.expires_at).getTime() < Date.now() : false;
              const exhausted = link.max_uses !== null && link.uses >= link.max_uses;
              const state = link.status !== "active" ? "disabled" : expired ? "expired" : exhausted ? "exhausted" : "active";
              return (
                <View key={link.code} style={[styles.linkRow, index > 0 && styles.divider]}>
                  <View style={styles.rowMain}>
                    <Text style={styles.rowTitle}>{link.title ?? `Link ${link.code}`}</Text>
                    <Text style={styles.rowMeta}>
                      /pay/{link.code}
                      {link.amount_wei ? ` · ${formatWei(BigInt(link.amount_wei))} HYPE` : ""}
                      {` · ${link.uses}${link.max_uses === null ? "" : `/${link.max_uses}`} uses`}
                    </Text>
                    <View style={styles.badges}>
                      <Badge kind={state === "active" ? "confirmed" : state === "disabled" ? "setup" : "failed"} />
                      <Badge kind="public" />
                    </View>
                  </View>
                  <Link href={`/pay/${link.code}`} asChild>
                    <Button title="Open" variant="secondary" />
                  </Link>
                </View>
              );
            })}
          </Card>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: color.paper50 },
  body: { padding: space.xl, paddingBottom: space.xxl },
  title: { ...type.title, color: color.ink950 },
  sub: { ...type.small, color: color.slate600, marginTop: 6 },
  sectionTitle: { ...type.heading, color: color.ink950, marginTop: space.xxl, marginBottom: space.md },
  cardTitle: { ...type.heading, color: color.ink950, marginBottom: space.md },
  codeText: {
    ...type.small,
    color: color.ink900,
    backgroundColor: color.paper100,
    borderWidth: 1,
    borderColor: color.lineSoft,
    borderRadius: radius.sm,
    padding: space.md,
  },
  rowGap: { flexDirection: "row", gap: space.md, marginTop: space.md },
  label: { ...type.label, color: color.slate500 },
  amountRow: { flexDirection: "row", gap: space.sm, marginTop: space.sm },
  amount: {
    flex: 1,
    borderWidth: 1,
    borderColor: color.line,
    borderRadius: radius.md,
    padding: space.md,
    backgroundColor: color.paper0,
  },
  amountSelected: { backgroundColor: color.ink900, borderColor: color.ink900 },
  amountValue: { fontSize: 17, fontWeight: "500", color: color.ink900 },
  amountUnit: { fontSize: 11, letterSpacing: 0.7, color: color.slate500 },
  amountValueSelected: { color: color.paper0 },
  checkRow: { flexDirection: "row", alignItems: "center", gap: space.md, marginTop: space.lg },
  checkbox: { width: 18, height: 18, borderRadius: 4, borderWidth: 1, borderColor: color.lineStrong },
  checkboxOn: { backgroundColor: color.ink900, borderColor: color.ink900 },
  checkLabel: { ...type.tiny, color: color.slate700, flex: 1 },
  hint: { ...type.tiny, color: color.slate500, marginTop: space.md },
  linkRow: { flexDirection: "row", alignItems: "center", gap: space.md, paddingVertical: space.md },
  rowMain: { flex: 1, gap: 4 },
  rowTitle: { fontSize: 14, fontWeight: "500", color: color.ink900 },
  rowMeta: { ...type.tiny, color: color.slate500 },
  badges: { flexDirection: "row", gap: 6, marginTop: 2 },
  divider: { borderTopWidth: 1, borderTopColor: color.lineSoft },
});
