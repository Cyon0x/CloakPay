import React from "react";
import { Linking, Pressable, StyleSheet, Text, View } from "react-native";
import { Mono } from "./ui";
import { explorerTx } from "../chain";
import { color, radius, space, type } from "../theme";

/**
 * The receipt shown after a settlement.
 *
 * Every value here came from the chain: the hash is the one the device
 * broadcast and the block number is the one the receipt reported. Nothing is
 * filled in optimistically, and a transfer that has not confirmed says
 * Submitted rather than Confirmed.
 */
export function Receipt({
  amountLabel,
  txHash,
  status,
  blockNumber,
  recipient,
}: {
  amountLabel: string;
  txHash: string;
  status: "submitted" | "confirmed";
  blockNumber: bigint | null;
  recipient: string;
}) {
  const url = explorerTx(txHash);
  return (
    <View>
      <Text style={styles.amount}>{amountLabel} HYPE</Text>
      <Text style={styles.to}>to @{recipient}</Text>

      <View style={styles.rows}>
        <Row label="Status" value={status === "confirmed" ? "Confirmed" : "Submitted"} />
        <Row label="Block" value={blockNumber === null ? "Waiting" : blockNumber.toString()} />
      </View>

      <Text style={styles.label}>Transaction</Text>
      <Mono style={styles.hash}>{txHash}</Mono>

      <Pressable
        accessibilityRole="link"
        onPress={() => Linking.openURL(url)}
        style={({ pressed }) => [styles.linkButton, pressed && { opacity: 0.7 }]}
      >
        <Text style={styles.linkText}>View on the explorer</Text>
      </Pressable>

      <Text style={styles.disclosure}>
        This settlement is public. The amount, your wallet and theirs are all visible on chain.
      </Text>
    </View>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  amount: { fontSize: 30, fontWeight: "600", letterSpacing: -0.8, color: color.ink950 },
  to: { ...type.small, color: color.slate600, marginTop: 2 },
  rows: { marginTop: space.xl, gap: space.sm },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" },
  rowValue: { fontSize: 14, fontWeight: "500", color: color.ink900 },
  label: { ...type.label, color: color.slate500, marginTop: space.md },
  hash: {
    marginTop: 6,
    fontSize: 12,
    color: color.ink900,
    backgroundColor: color.paper100,
    borderRadius: radius.sm,
    padding: space.sm,
  },
  linkButton: { marginTop: space.md, paddingVertical: space.sm },
  linkText: { color: color.accent700, fontWeight: "600", fontSize: 14 },
  disclosure: { ...type.tiny, color: color.slate600, marginTop: space.md },
});
