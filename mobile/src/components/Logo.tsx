import React from "react";
import { Image, StyleSheet, View } from "react-native";

/**
 * The CloakPay lockup.
 *
 * Both images are generated from the supplied master artwork by
 * `scripts/brand.py` and copied into `mobile/assets`. Nothing is redrawn.
 */
export function Mark({ size = 32 }: { size?: number }) {
  return (
    <Image
      source={require("../../assets/mark.png")}
      style={{ width: size, height: size }}
      resizeMode="contain"
      accessibilityIgnoresInvertColors
    />
  );
}

export function Wordmark({ height = 14 }: { height?: number }) {
  return (
    <Image
      source={require("../../assets/wordmark.png")}
      style={{ height, width: height * (643 / 63) }}
      resizeMode="contain"
      accessible
      accessibilityLabel="CloakPay"
      accessibilityIgnoresInvertColors
    />
  );
}

export function Lockup({ markSize = 28 }: { markSize?: number }) {
  return (
    <View style={styles.lockup}>
      <Mark size={markSize} />
      <Wordmark height={Math.round(markSize * 0.42)} />
    </View>
  );
}

const styles = StyleSheet.create({
  lockup: { flexDirection: "row", alignItems: "center", gap: 9 },
});
