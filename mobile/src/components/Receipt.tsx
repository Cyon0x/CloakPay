import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { Lockup } from "./Logo";
import { activeChain } from "../chain";
import { color, space, type } from "../theme";

/**
 * The CloakPay receipt for one payment.
 *
 * It carries the two usernames and nothing else: no wallet address, no
 * transaction hash and no link to a block explorer. A receipt is the record of
 * a payment, and it has to be understood on its own, on screen or on paper.
 *
 * Only a payment the network confirmed reaches the wording below, and the
 * values are the ones the settlement actually reached — nothing is filled in
 * optimistically.
 */
export function Receipt({
  receiptId,
  amountLabel,
  symbol = "HYPE",
  status,
  fromUsername,
  toUsername,
  createdAt,
}: {
  receiptId: string;
  amountLabel: string;
  symbol?: string;
  status: "submitted" | "confirmed";
  fromUsername: string;
  toUsername: string;
  createdAt: string;
}) {
  const rows: [string, string][] = [
    ["From", `@${fromUsername}`],
    ["To", `@${toUsername}`],
    ["Amount", `${amountLabel} ${symbol}`],
    ["Asset", symbol],
    ["Date", stamp(createdAt)],
    ["Status", status === "confirmed" ? "Payment confirmed" : "Submitted to the network"],
    ["Network", activeChain.name],
    ["Receipt reference", receiptId],
  ];

  return (
    <View>
      <View style={styles.head}>
        <Lockup markSize={24} />
        <Text style={styles.status}>{status === "confirmed" ? "Confirmed" : "Submitted"}</Text>
      </View>

      <Text style={styles.amount}>
        {amountLabel} {symbol}
      </Text>
      <Text style={styles.to}>to @{toUsername}</Text>

      <View style={styles.rows}>
        {rows.map(([label, value]) => (
          <Row key={label} label={label} value={value} />
        ))}
      </View>

      <Text style={styles.disclosure}>
        {status === "confirmed"
          ? "This receipt is issued because the network confirmed the payment. CloakPay recorded no wallet address for either party."
          : "The payment has been broadcast and is waiting to be mined. A completed receipt is issued once the network confirms it."}
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

/** `2026-10-16T09:41:00.000Z` reads as `16 Oct 2026, 09:41`. */
export function stamp(iso: string): string {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return "—";
  const date = at.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
  const time = at.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  return `${date}, ${time}`;
}

const styles = StyleSheet.create({
  head: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  status: { ...type.tiny, color: color.slate600 },
  amount: { fontSize: 30, fontWeight: "600", letterSpacing: -0.8, color: color.ink950, marginTop: space.lg },
  to: { ...type.small, color: color.slate600, marginTop: 2 },
  rows: { marginTop: space.xl, gap: space.sm },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", gap: space.md },
  rowValue: { fontSize: 14, fontWeight: "500", color: color.ink900, flexShrink: 1, textAlign: "right" },
  label: { ...type.label, color: color.slate500 },
  disclosure: { ...type.tiny, color: color.slate600, marginTop: space.lg },
});
