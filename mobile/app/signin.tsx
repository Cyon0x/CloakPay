import React, { useState } from "react";
import { View, Text, StyleSheet, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Redirect } from "expo-router";
import { useAuth } from "../src/auth";
import { Button, Notice } from "../src/components/ui";
import { Lockup } from "../src/components/Logo";
import { activeChain } from "../src/chain";
import { color, space, type } from "../src/theme";

export default function SignIn() {
  const { user, signIn } = useAuth();
  const [busy, setBusy] = useState<"google" | "x" | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (user) return <Redirect href="/(tabs)" />;

  async function run(provider: "google" | "x") {
    setBusy(provider);
    setError(null);
    const result = await signIn(provider);
    if (!result.ok && result.message) setError(result.message);
    setBusy(null);
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.body}>
        <View style={styles.brand}>
          <Lockup markSize={40} />
        </View>
        <Text style={styles.title}>Sign in to CloakPay</Text>
        <Text style={styles.subtitle}>
          Google and X are the only options. There is no password to forget.
        </Text>

        {error ? (
          <View style={{ marginTop: space.xl }}>
            <Notice tone="error" title="Sign-in did not finish">
              {error}
            </Notice>
          </View>
        ) : null}

        <View style={styles.actions}>
          <Button title="Continue with Google" variant="secondary" loading={busy === "google"} onPress={() => run("google")} />
          <Button title="Continue with X" loading={busy === "x"} onPress={() => run("x")} />
        </View>

        <Text style={styles.footnote}>
          {activeChain.name}, chain {activeChain.chainId}. Testnet only. There is no audit of CloakPay and
          nothing here holds real value.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: color.paper50 },
  body: { padding: space.xxl, gap: space.sm },
  brand: { marginBottom: space.xxl },
  title: { ...type.title, color: color.ink950 },
  subtitle: { ...type.small, color: color.slate600, marginTop: 6 },
  actions: { marginTop: space.xxl, gap: space.md },
  footnote: { ...type.tiny, color: color.slate500, marginTop: space.xxl, lineHeight: 18 },
});
