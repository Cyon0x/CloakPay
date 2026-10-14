import React, { useState } from "react";
import { Linking, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { CameraView, useCameraPermissions } from "expo-camera";
import { Button, Notice } from "../src/components/ui";
import { color, radius, space, type } from "../src/theme";

/**
 * QR scanning.
 *
 * A CloakPay code is either a payment link or a public profile URL, and both
 * resolve to something this app can open. Anything else is reported as
 * unrecognised rather than being silently treated as an address, because a code
 * that is not ours is not a payment this app should try to make.
 */
function interpret(value: string): { kind: "checkout"; code: string } | { kind: "username"; username: string } | null {
  const text = value.trim();

  const payMatch = text.match(/^(?:cloakpay:\/\/pay\/|[a-z]+:\/\/[^/]*\/pay\/)([a-z0-9]+)/i) ?? text.match(/^[a-z0-9]{8,24}$/i);
  if (payMatch) return { kind: "checkout", code: payMatch[1] ?? payMatch[0] };

  const profileMatch = text.match(/^(?:[a-z]+:\/\/[^/]*\/u\/|@?)([a-z0-9_]{3,20})\/?$/i);
  if (profileMatch) return { kind: "username", username: profileMatch[1] };

  return null;
}

export default function Scan() {
  const router = useRouter();
  const [permission, requestPermission] = useCameraPermissions();
  const [handled, setHandled] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  function onScanned({ data }: { data: string }) {
    if (handled) return;
    const target = interpret(data);
    if (!target) {
      setMessage("That code is not a CloakPay link or username.");
      return;
    }
    setHandled(true);
    if (target.kind === "checkout") router.replace(`/pay/${target.code}`);
    else router.replace({ pathname: "/(tabs)/send", params: { to: target.username } });
  }

  if (!permission) {
    return (
      <SafeAreaView style={styles.safe} edges={["top"]}>
        <Text style={styles.body}>Checking camera access…</Text>
      </SafeAreaView>
    );
  }

  if (!permission.granted) {
    return (
      <SafeAreaView style={styles.safe} edges={["top"]}>
        <View style={styles.body}>
          <Text style={styles.title}>Scan a code</Text>
          <Text style={styles.muted}>
            The camera is only used while this screen is open, and the frame is read on the device. Nothing is
            uploaded.
          </Text>
          <Button
            title={permission.canAskAgain ? "Allow camera" : "Open settings"}
            style={styles.action}
            onPress={() => (permission.canAskAgain ? requestPermission() : Linking.openSettings())}
          />
          <Button title="Cancel" variant="ghost" style={styles.action} onPress={() => router.back()} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <View style={styles.container}>
      <CameraView
        style={StyleSheet.absoluteFill}
        facing="back"
        barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
        onBarcodeScanned={handled ? undefined : onScanned}
      />
      <SafeAreaView style={styles.overlay} edges={["top", "bottom"]}>
        <View style={styles.frame} pointerEvents="none" />
        <View style={styles.panel}>
          {message ? (
            <Notice tone="warn">{message}</Notice>
          ) : (
            <Text style={styles.panelText}>Point at a CloakPay code.</Text>
          )}
          <Pressable accessibilityRole="button" onPress={() => router.back()} style={styles.cancel}>
            <Text style={styles.cancelText}>Cancel</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: color.paper50 },
  container: { flex: 1, backgroundColor: color.ink950 },
  body: { padding: space.xl, gap: space.sm },
  title: { ...type.title, color: color.ink950 },
  muted: { ...type.small, color: color.slate600 },
  action: { marginTop: space.md },
  overlay: { flex: 1, justifyContent: "space-between", padding: space.xl },
  frame: {
    width: 236,
    height: 236,
    alignSelf: "center",
    marginTop: 110,
    borderWidth: 2,
    borderColor: color.paper0,
    borderRadius: radius.xl,
  },
  panel: { gap: space.md },
  panelText: { color: color.paper0, textAlign: "center", fontSize: 14 },
  cancel: { alignSelf: "center", paddingVertical: space.md, paddingHorizontal: space.xl },
  cancelText: { color: color.paper0, fontWeight: "600", fontSize: 15 },
});
