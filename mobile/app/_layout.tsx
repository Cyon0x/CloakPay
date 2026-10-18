import React, { useEffect } from "react";
import { Stack, useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import * as Linking from "expo-linking";
import { AuthProvider } from "../src/auth";
import { NotificationsProvider } from "../src/notifications";
import { color } from "../src/theme";

/**
 * Incoming links.
 *
 * `cloakpay://pay/<code>` and `https://<domain>/pay/<code>` both mean the same
 * thing, and expo-router already maps the path of a universal link onto the
 * `/pay/[code]` screen. The custom scheme does not map on its own, so this hook
 * translates it. `cloakpay://auth` is deliberately ignored here: it is consumed
 * by the auth session in `src/auth.tsx` and never becomes a route.
 */
function usePaymentLinkRouting() {
  const router = useRouter();

  useEffect(() => {
    const route = (url: string | null) => {
      if (!url) return;
      const { hostname, path } = Linking.parse(url);
      const segments = (path ?? "").split("/").filter(Boolean);
      const code = hostname === "pay" ? segments[0] : segments[0] === "pay" ? segments[1] : null;
      if (code && /^[a-z0-9]{4,}$/i.test(code)) router.push(`/pay/${code}`);
    };

    const subscription = Linking.addEventListener("url", ({ url }) => route(url));
    Linking.getInitialURL().then(route).catch(() => undefined);
    return () => subscription.remove();
  }, [router]);
}

export default function RootLayout() {
  usePaymentLinkRouting();
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <NotificationsProvider>
          <StatusBar style="dark" />
          <Stack
            screenOptions={{
              headerShown: false,
              contentStyle: { backgroundColor: color.paper50 },
              headerShadowVisible: false,
            }}
          />
        </NotificationsProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}
