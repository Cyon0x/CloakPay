import React from "react";
import { Tabs, Redirect } from "expo-router";
import { View, Text, StyleSheet } from "react-native";
import { useAuth } from "../../src/auth";
import { Loading } from "../../src/components/ui";
import { color, shadow } from "../../src/theme";

/**
 * Five tabs with Send raised in the middle.
 *
 * Send is the action people open this app for, so it is the only tab that is
 * visually lifted. The other four stay quiet.
 */
function TabIcon({ label, focused, glyph }: { label: string; focused: boolean; glyph: string }) {
  return (
    <View style={styles.tabIcon}>
      <Text style={[styles.glyph, focused ? styles.glyphActive : null]}>{glyph}</Text>
      <Text style={[styles.tabLabel, focused ? styles.tabLabelActive : null]}>{label}</Text>
    </View>
  );
}

function SendTab() {
  return (
    <View style={styles.sendWrap}>
      <View style={styles.sendDisc}>
        <Text style={styles.sendGlyph}>↗</Text>
      </View>
      <Text style={styles.sendLabel}>Send</Text>
    </View>
  );
}

export default function TabsLayout() {
  const { ready, user } = useAuth();
  if (!ready) return <Loading />;
  if (!user) return <Redirect href="/signin" />;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: color.ink950,
        tabBarInactiveTintColor: color.slate500,
        tabBarStyle: styles.tabBar,
        tabBarShowLabel: false,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{ tabBarIcon: ({ focused }) => <TabIcon label="Home" focused={focused} glyph="⌂" /> }}
      />
      <Tabs.Screen
        name="activity"
        options={{ tabBarIcon: ({ focused }) => <TabIcon label="Activity" focused={focused} glyph="∿" /> }}
      />
      <Tabs.Screen name="send" options={{ tabBarIcon: () => <SendTab /> }} />
      <Tabs.Screen
        name="links"
        options={{ tabBarIcon: ({ focused }) => <TabIcon label="Links" focused={focused} glyph="∞" /> }}
      />
      <Tabs.Screen
        name="settings"
        options={{ tabBarIcon: ({ focused }) => <TabIcon label="You" focused={focused} glyph="☺" /> }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    height: 68,
    paddingTop: 6,
    paddingBottom: 8,
    borderTopWidth: 1,
    borderTopColor: color.lineSoft,
    backgroundColor: color.paper50,
  },
  tabIcon: { alignItems: "center", justifyContent: "center", gap: 2, width: 64 },
  glyph: { fontSize: 19, color: color.slate500, lineHeight: 22 },
  glyphActive: { color: color.ink950 },
  tabLabel: { fontSize: 10.5, color: color.slate500 },
  tabLabelActive: { color: color.ink950, fontWeight: "600" },

  sendWrap: { alignItems: "center", justifyContent: "flex-start", width: 72 },
  sendDisc: {
    width: 52,
    height: 52,
    marginTop: -24,
    borderRadius: 26,
    backgroundColor: color.ink900,
    borderWidth: 4,
    borderColor: color.paper50,
    alignItems: "center",
    justifyContent: "center",
    ...shadow.raised,
  },
  sendGlyph: { color: color.paper0, fontSize: 21, lineHeight: 24 },
  sendLabel: { fontSize: 10.5, fontWeight: "600", color: color.ink950, marginTop: 1 },
});
