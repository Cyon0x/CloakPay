import React from "react";
import { Tabs, Redirect } from "expo-router";
import { View, Text, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "../../src/auth";
import { Loading } from "../../src/components/ui";
import { Icon } from "../../src/components/Icon";
import { color, shadow } from "../../src/theme";

/**
 * Five tabs with Send raised in the middle.
 *
 * Send is the action people open this app for, so it is the only tab that is
 * visually lifted. The other four stay quiet.
 */
function TabIcon({ label, focused, icon }: { label: string; focused: boolean; icon: string }) {
  return (
    <View style={styles.tabIcon}>
      <Icon name={icon} size={20} color={focused ? color.ink950 : color.slate500} strokeWidth={focused ? 2 : 1.7} />
      <Text style={[styles.tabLabel, focused ? styles.tabLabelActive : null]}>{label}</Text>
    </View>
  );
}

function SendTab() {
  return (
    <View style={styles.sendWrap}>
      <View style={styles.sendDisc}>
        <Icon name="send" size={22} color={color.paper0} strokeWidth={2} />
      </View>
      <Text style={styles.sendLabel}>Send</Text>
    </View>
  );
}

export default function TabsLayout() {
  const { ready, user } = useAuth();
  const insets = useSafeAreaInsets();
  if (!ready) return <Loading />;
  if (!user) return <Redirect href="/signin" />;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: color.ink950,
        tabBarInactiveTintColor: color.slate500,
        tabBarStyle: [
          styles.tabBar,
          { height: 67 + insets.bottom, paddingBottom: 7 + insets.bottom },
        ],
        tabBarShowLabel: false,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{ tabBarIcon: ({ focused }) => <TabIcon label="Home" focused={focused} icon="home" /> }}
      />
      <Tabs.Screen
        name="activity"
        options={{ tabBarIcon: ({ focused }) => <TabIcon label="Activity" focused={focused} icon="activity" /> }}
      />
      <Tabs.Screen name="send" options={{ tabBarIcon: () => <SendTab /> }} />
      <Tabs.Screen
        name="links"
        options={{ tabBarIcon: ({ focused }) => <TabIcon label="Links" focused={focused} icon="link" /> }}
      />
      <Tabs.Screen
        name="settings"
        options={{ tabBarIcon: ({ focused }) => <TabIcon label="You" focused={focused} icon="user" /> }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    paddingTop: 7,
    borderTopWidth: 1,
    borderTopColor: color.glassBorder,
    backgroundColor: color.glassChrome,
    shadowColor: "#14171b",
    shadowOpacity: 0.08,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: -6 },
    elevation: 12,
  },
  tabIcon: { alignItems: "center", justifyContent: "center", gap: 2, width: 64 },
  tabLabel: { fontSize: 10.5, color: color.slate500 },
  tabLabelActive: { color: color.ink950, fontWeight: "600" },

  sendWrap: { alignItems: "center", justifyContent: "flex-start", width: 72 },
  sendDisc: {
    width: 52,
    height: 52,
    marginTop: -24,
    borderRadius: 26,
    backgroundColor: color.ink900,
    borderWidth: 5,
    borderColor: color.paper0,
    alignItems: "center",
    justifyContent: "center",
    ...shadow.raised,
  },
  sendLabel: { fontSize: 10.5, fontWeight: "600", color: color.ink950, marginTop: 1 },
});
