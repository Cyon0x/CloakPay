import React, { useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Link, useLocalSearchParams } from "expo-router";
import { useAuth } from "../../src/auth";
import { Button, Card, Field, Loading, Notice } from "../../src/components/ui";
import { RecipientPicker, type Recipient } from "../../src/components/RecipientPicker";
import { Receipt } from "../../src/components/Receipt";
import { useSettlement } from "../../src/settlement";
import { isUnlocked } from "../../src/wallet";
import { estimateFee, readBalance } from "../../src/transfer";
import { loadPool, type PoolInfo } from "../../src/pool";
import { api } from "../../src/api";
import { formatWei } from "../../src/format";
import { activeChain } from "../../src/chain";
import { color, radius, space, type } from "../../src/theme";

type Privacy = "private" | "public";

interface WalletResponse {
  wallet: { address: string | null } | null;
}

/**
 * Send.
 *
 * A payment to another CloakPay user is made by username. The person being paid
 * is never shown a wallet address, and no address or transaction hash is shown
 * here either.
 */
export default function Send() {
  const { user } = useAuth();
  const params = useLocalSearchParams<{ to?: string }>();
  const [pool, setPool] = useState<PoolInfo | null>(null);
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [recipient, setRecipient] = useState<Recipient | null>(null);
  const [denominationId, setDenominationId] = useState("");
  // A payment between CloakPay users travels by username and settles as a direct
  // transfer, and the record is written to say exactly that.
  const privacy: Privacy = "public";
  const [note, setNote] = useState("");
  const [passphrase, setPassphrase] = useState("");
  const [balance, setBalance] = useState<bigint | null>(null);
  const [fee, setFee] = useState<bigint | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const settlement = useSettlement();

  useEffect(() => {
    (async () => {
      try {
        const [poolData, walletData] = await Promise.all([loadPool(), api<WalletResponse>("/api/wallet")]);
        setPool(poolData);
        setWalletAddress(walletData.wallet?.address ?? null);
        setDenominationId(poolData.pool.denominations[1]?.id ?? poolData.pool.denominations[0]?.id ?? "");
      } catch (error) {
        setLoadError((error as Error).message);
      }
    })();
  }, []);

  useEffect(() => {
    if (!walletAddress) return;
    readBalance(walletAddress as `0x${string}`).then(setBalance);
    estimateFee(walletAddress as `0x${string}`).then(setFee);
  }, [walletAddress]);

  const denomination = useMemo(
    () => pool?.pool.denominations.find((item) => item.id === denominationId) ?? null,
    [denominationId, pool],
  );

  const amountWei = denomination ? BigInt(denomination.wei) : 0n;
  const total = fee === null ? null : amountWei + fee;
  const shortfall = balance !== null && total !== null ? total - balance : null;
  const busy =
    settlement.state.phase === "preparing" ||
    settlement.state.phase === "signing" ||
    settlement.state.phase === "submitted";

  if (!pool && !loadError) return <Loading label="Loading your wallet" />;

  if (settlement.state.phase === "confirmed" || settlement.state.phase === "submitted") {
    const { intent } = settlement.state;
    return (
      <SafeAreaView style={styles.safe} edges={["top"]}>
        <ScrollView contentContainerStyle={styles.body}>
          <Text style={styles.eyebrow}>Receipt</Text>
          <Card style={styles.card}>
            <Receipt
              receiptId={intent.paymentId}
              amountLabel={formatWei(BigInt(intent.amountWei))}
              status={settlement.state.phase === "confirmed" ? "confirmed" : "submitted"}
              fromUsername={user?.username ?? "you"}
              toUsername={recipient?.username ?? "recipient"}
              createdAt={settlement.state.at}
            />
          </Card>
          <Button
            title="Send another"
            variant="secondary"
            style={styles.action}
            onPress={() => {
              settlement.reset();
              setRecipient(null);
              setNote("");
              setPassphrase("");
            }}
          />
          <Link href="/(tabs)" asChild>
            <Button title="Back to home" variant="ghost" style={styles.action} />
          </Link>
        </ScrollView>
      </SafeAreaView>
    );
  }

  if (!walletAddress) {
    return (
      <SafeAreaView style={styles.safe} edges={["top"]}>
        <ScrollView contentContainerStyle={styles.body}>
          <Text style={styles.title}>Send</Text>
          <Card style={styles.card}>
            <Text style={styles.cardTitle}>No wallet yet</Text>
            <Text style={styles.muted}>
              A wallet is created during setup and it lives on your device. Finish setup and you can send from
              here.
            </Text>
            <Link href="/onboarding" asChild>
              <Button title="Finish setup" style={styles.action} />
            </Link>
          </Card>
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <View style={styles.titleRow}>
          <View style={styles.grow}>
            <Text style={styles.eyebrow}>Send</Text>
            <Text style={styles.title}>Pay a username</Text>
            <Text style={styles.muted}>
              {balance === null
                ? "Reading your balance from the network"
                : `${formatWei(balance, 18, 4)} HYPE available`}
            </Text>
          </View>
          <Link href="/scan" asChild>
            <Button title="Scan" variant="secondary" />
          </Link>
        </View>

        {loadError ? (
          <View style={styles.card}>
            <Notice tone="error" title="Could not load payment options">
              {loadError}
            </Notice>
          </View>
        ) : null}

        {settlement.state.phase === "failed" ? (
          <View style={styles.card}>
            <Notice tone="error" title="Payment did not go through">
              {settlement.state.message}
            </Notice>
          </View>
        ) : null}

        <Card style={styles.card}>
          <RecipientPicker value={recipient} onSelect={setRecipient} initialQuery={params.to ?? ""} />
        </Card>

        <Card style={styles.card}>
          <Text style={styles.label}>Amount</Text>
          <View style={styles.amountRow}>
            {(pool?.pool.denominations ?? []).map((item) => {
              const selected = item.id === denominationId;
              return (
                <Pressable
                  key={item.id}
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}
                  onPress={() => setDenominationId(item.id)}
                  style={[styles.amount, selected && styles.amountSelected]}
                >
                  <Text style={[styles.amountValue, selected && styles.amountValueSelected]}>
                    {item.label.split(" ")[0]}
                  </Text>
                  <Text style={[styles.amountUnit, selected && styles.amountValueSelected]}>HYPE</Text>
                </Pressable>
              );
            })}
          </View>
          <Text style={styles.hint}>
            Choose one of the fixed amounts. Both sides see the same number.
          </Text>
        </Card>

        <Card style={styles.card}>
          <Text style={styles.label}>How it settles</Text>
          <Text style={styles.muted}>
            A payment between CloakPay users is private: it travels by username, and neither side is shown
            the other&apos;s wallet address. No address or transaction hash appears on this screen or on the
            receipt.
          </Text>
        </Card>

        <Card style={styles.card}>
          <Field
            label="Note (optional)"
            value={note}
            onChangeText={setNote}
            placeholder="What is this for?"
            maxLength={140}
            multiline
            hint="Stored with the payment record. It is not written to the chain."
          />
        </Card>

        <Card style={styles.card}>
          <View style={styles.kv}>
            <Text style={styles.label}>Amount</Text>
            <Text style={styles.kvValue}>{denomination ? denomination.label : "—"}</Text>
          </View>
          <View style={styles.kv}>
            <Text style={styles.label}>Network fee</Text>
            <Text style={styles.kvValue}>{fee === null ? "—" : `${formatWei(fee, 18, 6)} HYPE`}</Text>
          </View>
          <View style={styles.kv}>
            <Text style={styles.label}>Total</Text>
            <Text style={styles.kvValue}>{total === null ? "—" : `${formatWei(total, 18, 6)} HYPE`}</Text>
          </View>
          {shortfall !== null && shortfall > 0n ? (
            <Text style={styles.shortfall}>
              Short by {formatWei(shortfall, 18, 4)} HYPE. Top up from the Elysium faucet and try again.
            </Text>
          ) : null}
        </Card>

        {settlement.state.phase === "ready" || settlement.state.phase === "signing" ? (
          <Card style={styles.card}>
            <Field
              label="Wallet passphrase"
              value={passphrase}
              onChangeText={setPassphrase}
              secureTextEntry
              placeholder={isUnlocked() ? "Already unlocked this session" : "Unlock to sign"}
              editable={!isUnlocked()}
              hint="Your passphrase unlocks signing on this device. It is never sent anywhere."
            />
            <View style={styles.actions}>
              <Button
                title={settlement.state.phase === "signing" ? "Signing…" : "Pay now"}
                loading={settlement.state.phase === "signing"}
                disabled={!isUnlocked() && passphrase.length === 0}
                onPress={() => settlement.confirm(passphrase)}
                style={styles.grow}
              />
              <Button title="Cancel" variant="ghost" onPress={settlement.reset} />
            </View>
          </Card>
        ) : (
          <Button
            title={settlement.state.phase === "preparing" ? "Preparing…" : "Review payment"}
            loading={settlement.state.phase === "preparing"}
            disabled={!recipient || !denomination || (shortfall !== null && shortfall > 0n)}
            onPress={() =>
              settlement.prepare({
                toUsername: recipient?.username,
                denominationId,
                privacy,
                note: note.trim() || undefined,
              })
            }
            style={styles.action}
          />
        )}

        <Text style={styles.foot}>
          Paying @{recipient?.username ?? "a username"} by username. The transfer itself still settles on
          the {activeChain.name}.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: color.paper50 },
  body: { padding: space.xl, paddingBottom: 120, gap: space.sm },
  titleRow: { flexDirection: "row", alignItems: "flex-end", gap: space.md },
  eyebrow: { ...type.label, color: color.slate500 },
  title: { ...type.title, color: color.ink950 },
  muted: { ...type.small, color: color.slate600 },
  card: { marginTop: space.md },
  cardTitle: { ...type.heading, color: color.ink950, marginBottom: 6 },
  label: { ...type.label, color: color.slate500 },
  hint: { ...type.tiny, color: color.slate500, marginTop: space.md },
  amountRow: { flexDirection: "row", gap: space.sm, marginTop: space.sm },
  amount: {
    flex: 1,
    borderWidth: 1,
    borderColor: color.line,
    borderRadius: radius.md,
    padding: space.md,
    backgroundColor: color.paper0,
    alignItems: "center",
  },
  amountSelected: { backgroundColor: color.ink900, borderColor: color.ink900 },
  amountValue: { fontSize: 17, fontWeight: "500", color: color.ink900 },
  amountUnit: { fontSize: 11, letterSpacing: 0.7, color: color.slate500 },
  amountValueSelected: { color: color.paper0 },
  kv: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", paddingVertical: 5 },
  kvValue: { fontSize: 14, fontWeight: "500", color: color.ink900 },
  shortfall: { ...type.tiny, color: color.err600, marginTop: space.sm },
  actions: { flexDirection: "row", gap: space.sm, marginTop: space.lg, alignItems: "center" },
  grow: { flex: 1 },
  action: { marginTop: space.md },
  foot: { ...type.tiny, color: color.slate500, marginTop: space.lg, textAlign: "center" },
});
