import React, { useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { api } from "../api";
import { Badge, Field } from "./ui";
import { color, radius, space, type } from "../theme";

export interface Recipient {
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  canReceivePrivately: boolean;
}

/**
 * Recipient lookup by username.
 *
 * The search hits the same rate-limited endpoint the web app uses and returns
 * only what a payer needs. It never returns a wallet address, an email, or a
 * provider account id, so paying a username does not quietly hand over the
 * identity behind it.
 */
export function RecipientPicker({
  value,
  onSelect,
  initialQuery = "",
}: {
  value: Recipient | null;
  onSelect: (recipient: Recipient | null) => void;
  initialQuery?: string;
}) {
  const [query, setQuery] = useState(initialQuery);
  const [results, setResults] = useState<Recipient[]>([]);
  const [searching, setSearching] = useState(false);
  const [touched, setTouched] = useState(initialQuery.length > 0);
  const requestId = useRef(0);

  useEffect(() => {
    const trimmed = query.trim().toLowerCase();
    if (trimmed.length < 2) {
      setResults([]);
      return;
    }
    setSearching(true);
    const id = ++requestId.current;
    const timer = setTimeout(async () => {
      try {
        const data = await api<{ results: Recipient[] }>(`/api/users/search?q=${encodeURIComponent(trimmed)}`);
        if (id === requestId.current) setResults(data.results);
      } catch {
        if (id === requestId.current) setResults([]);
      } finally {
        if (id === requestId.current) setSearching(false);
      }
    }, 220);
    return () => clearTimeout(timer);
  }, [query]);

  if (value) {
    return (
      <View style={styles.chosen}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{value.username.slice(0, 1).toUpperCase()}</Text>
        </View>
        <View style={styles.grow}>
          <Text style={styles.chosenName}>@{value.username}</Text>
          <Text style={styles.tiny}>{value.displayName ?? "CloakPay account"}</Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Choose a different recipient"
          onPress={() => {
            onSelect(null);
            setQuery("");
            setTouched(false);
          }}
          style={styles.change}
        >
          <Text style={styles.changeText}>Change</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.block}>
      <Field
        label="Recipient"
        value={query}
        onChangeText={(text) => {
          setQuery(text);
          setTouched(true);
        }}
        placeholder="username"
        autoCapitalize="none"
        hint="Two or more characters. You pay a username; the wallet behind it stays hidden."
      />
      {searching ? <Text style={styles.tiny}>Searching…</Text> : null}

      {results.map((result) => (
        <Pressable
          key={result.username}
          accessibilityRole="button"
          onPress={() => onSelect(result)}
          style={({ pressed }) => [styles.result, pressed && { backgroundColor: color.paper100 }]}
        >
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{result.username.slice(0, 1).toUpperCase()}</Text>
          </View>
          <View style={styles.grow}>
            <Text style={styles.chosenName}>@{result.username}</Text>
            <Text style={styles.tiny}>{result.displayName ?? "CloakPay account"}</Text>
          </View>
          <Badge kind={result.canReceivePrivately ? "private" : "setup"} />
        </Pressable>
      ))}

      {touched && !searching && query.trim().length >= 2 && results.length === 0 ? (
        <Text style={styles.tiny}>No account matches that username.</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  block: { gap: space.sm },
  chosen: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    borderWidth: 1,
    borderColor: color.lineSoft,
    borderRadius: radius.md,
    backgroundColor: color.paper100,
    padding: space.md,
  },
  avatar: {
    width: 34,
    height: 34,
    borderRadius: radius.pill,
    backgroundColor: color.ink900,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { color: color.paper0, fontWeight: "600", fontSize: 14 },
  grow: { flex: 1 },
  chosenName: { fontSize: 14, fontWeight: "600", color: color.ink900 },
  tiny: { ...type.tiny, color: color.slate600 },
  change: { paddingVertical: 6, paddingHorizontal: 8 },
  changeText: { color: color.accent700, fontWeight: "600", fontSize: 13 },
  result: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    borderWidth: 1,
    borderColor: color.lineSoft,
    borderRadius: radius.md,
    padding: space.md,
    backgroundColor: color.paper0,
  },
});
