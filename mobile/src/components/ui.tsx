import React from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import { BADGE_LABEL, badgeTone, color, radius, shadow, space, type } from "../theme";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

export function Button({
  title,
  onPress,
  variant = "primary",
  disabled,
  loading,
  style,
}: {
  title: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  disabled?: boolean;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const inactive = disabled || loading;
  return (
    <Pressable
      onPress={onPress}
      disabled={inactive}
      accessibilityRole="button"
      accessibilityState={{ disabled: Boolean(inactive), busy: Boolean(loading) }}
      style={({ pressed }) => [
        styles.btn,
        buttonVariants[variant],
        pressed && !inactive ? styles.btnPressed : null,
        inactive ? styles.btnInactive : null,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator size="small" color={variant === "primary" ? color.paper0 : color.ink800} />
      ) : (
        <Text style={[styles.btnLabel, buttonLabel[variant]]}>{title}</Text>
      )}
    </Pressable>
  );
}

export function Card({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function Badge({ kind }: { kind: string }) {
  const tone = badgeTone[kind as keyof typeof badgeTone] ?? badgeTone.public;
  return (
    <View style={[styles.badge, { backgroundColor: tone.bg, borderColor: tone.border }]}>
      <View style={[styles.badgeDot, { backgroundColor: tone.fg }]} />
      <Text style={[styles.badgeLabel, { color: tone.fg }]}>{BADGE_LABEL[kind] ?? kind}</Text>
    </View>
  );
}

export function Label({ children }: { children: React.ReactNode }) {
  return <Text style={styles.label}>{children}</Text>;
}

export function Field({
  label,
  value,
  onChangeText,
  placeholder,
  secureTextEntry,
  keyboardType,
  autoCapitalize,
  editable = true,
  hint,
  multiline,
  maxLength,
  prefix,
}: {
  label?: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
  secureTextEntry?: boolean;
  keyboardType?: "default" | "numeric" | "email-address";
  autoCapitalize?: "none" | "sentences";
  editable?: boolean;
  hint?: string;
  multiline?: boolean;
  maxLength?: number;
  prefix?: string;
}) {
  return (
    <View style={styles.field}>
      {label ? <Label>{label}</Label> : null}
      <View style={[styles.inputWrap, !editable && styles.inputDisabled]}>
        {prefix ? <Text style={styles.inputPrefix}>{prefix}</Text> : null}
        <TextInput
          style={[styles.input, multiline && styles.inputMultiline]}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={color.slate400}
          secureTextEntry={secureTextEntry}
          keyboardType={keyboardType}
          autoCapitalize={autoCapitalize}
          editable={editable}
          multiline={multiline}
          maxLength={maxLength}
          accessibilityLabel={label ?? placeholder}
        />
      </View>
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </View>
  );
}

export function Notice({
  tone = "info",
  title,
  children,
}: {
  tone?: "info" | "warn" | "error" | "ok";
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <View style={[styles.notice, noticeTone[tone]]} accessibilityRole={tone === "error" ? "alert" : undefined}>
      {title ? <Text style={styles.noticeTitle}>{title}</Text> : null}
      <Text style={styles.noticeBody}>{children}</Text>
    </View>
  );
}

export function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <View style={styles.empty}>
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptyBody}>{body}</Text>
    </View>
  );
}

export function StatRow({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <View style={styles.statRow}>
      <View style={styles.statRowTop}>
        <Text style={styles.label}>{label}</Text>
        <Text style={styles.statValue}>{value}</Text>
      </View>
      {hint ? <Text style={styles.statHint}>{hint}</Text> : null}
    </View>
  );
}

export function Loading({ label = "Loading" }: { label?: string }) {
  return (
    <View style={styles.loading}>
      <ActivityIndicator color={color.ink800} />
      <Text style={styles.hint}>{label}</Text>
    </View>
  );
}

/** Renders a value with the monospace, tabular treatment used for money. */
export function Mono({ children, style }: { children: React.ReactNode; style?: StyleProp<TextStyle> }) {
  return <Text style={[styles.mono, style]}>{children}</Text>;
}

const buttonVariants: Record<ButtonVariant, ViewStyle> = {
  primary: { backgroundColor: color.ink900, borderColor: color.ink900 },
  secondary: { backgroundColor: color.glassStrong, borderColor: color.glassBorder },
  ghost: { backgroundColor: "transparent", borderColor: "transparent" },
  danger: { backgroundColor: color.err100, borderColor: "#efd2ce" },
};

const buttonLabel: Record<ButtonVariant, TextStyle> = {
  primary: { color: color.paper0 },
  secondary: { color: color.ink900 },
  ghost: { color: color.ink800 },
  danger: { color: color.err600 },
};

const noticeTone = {
  info: { backgroundColor: color.info100, borderColor: "#d3e1ee" },
  warn: { backgroundColor: color.warn100, borderColor: "#efe0c6" },
  error: { backgroundColor: color.err100, borderColor: "#efd2ce" },
  ok: { backgroundColor: color.ok100, borderColor: "#cde4d8" },
} as const;

const styles = StyleSheet.create({
  btn: {
    minHeight: 48,
    paddingHorizontal: space.lg,
    borderRadius: radius.md,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
  },
  btnPressed: { opacity: 0.86 },
  btnInactive: { opacity: 0.5 },
  btnLabel: { fontSize: 15, fontWeight: "600" },

  card: {
    backgroundColor: color.glassSurface,
    borderColor: color.glassBorder,
    borderWidth: 1,
    borderRadius: radius.xl,
    padding: space.xl,
    ...shadow.card,
  },

  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    borderWidth: 1,
    borderRadius: radius.pill,
    paddingHorizontal: 9,
    paddingVertical: 3,
    alignSelf: "flex-start",
  },
  badgeDot: { width: 6, height: 6, borderRadius: 3 },
  badgeLabel: { fontSize: 11.5, fontWeight: "500" },

  label: { ...type.label, color: color.slate500 },

  field: { gap: space.sm },
  inputWrap: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: color.glassBorder,
    borderRadius: radius.md,
    backgroundColor: color.glassStrong,
    paddingHorizontal: space.md,
    minHeight: 48,
  },
  inputDisabled: { backgroundColor: color.paper100 },
  inputPrefix: { color: color.slate500, fontSize: 15, marginRight: 2 },
  input: { flex: 1, fontSize: 15, color: color.ink900, paddingVertical: 11 },
  inputMultiline: { minHeight: 72, textAlignVertical: "top" },
  hint: { ...type.tiny, color: color.slate500 },

  notice: { borderWidth: 1, borderRadius: radius.md, padding: space.lg, gap: 3 },
  noticeTitle: { fontWeight: "600", color: color.ink900, fontSize: 14 },
  noticeBody: { ...type.small, color: color.slate700 },

  empty: {
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: color.glassBorder,
    borderRadius: radius.xl,
    padding: space.xxl,
    alignItems: "center",
    gap: space.sm,
    backgroundColor: color.glassSoft,
  },
  emptyTitle: { fontWeight: "600", fontSize: 15, color: color.ink900 },
  emptyBody: { ...type.small, color: color.slate600, textAlign: "center" },

  statRow: { paddingVertical: space.md, gap: 2 },
  statRowTop: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: space.md },
  statValue: { fontSize: 20, fontWeight: "500", color: color.ink900, letterSpacing: -0.4 },
  statHint: { ...type.tiny, color: color.slate500 },

  loading: { padding: space.xxl, alignItems: "center", gap: space.md },
  mono: { fontVariant: ["tabular-nums"], fontSize: 15, color: color.ink900 },
});
