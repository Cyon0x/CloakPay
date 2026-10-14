"use client";

/**
 * Session state for the native app.
 *
 * Sign-in opens the provider in the platform's own auth session, which is what
 * gives the user a real "this is cloakpay.xyz asking" prompt rather than a
 * webview they cannot inspect. The server hands back a one-time code on a deep
 * link; this exchanges it for a bearer token and keeps it in the keychain.
 */
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";
import { API_URL, api, getToken, setToken } from "./api";

export interface SessionUser {
  userId: string;
  username: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  onboardingStep: "username" | "security" | "wallet" | "complete";
}

interface AuthValue {
  ready: boolean;
  user: SessionUser | null;
  signIn: (provider: "google" | "x") => Promise<{ ok: boolean; message?: string }>;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState<SessionUser | null>(null);

  const refresh = useCallback(async () => {
    const token = await getToken();
    if (!token) {
      setUser(null);
      return;
    }
    try {
      const data = await api<{ user: SessionUser | null }>("/api/session");
      setUser(data.user);
      if (!data.user) await setToken(null);
    } catch {
      // A network blip must not sign the user out; only an explicit 401 does.
      setUser(null);
    }
  }, []);

  useEffect(() => {
    refresh().finally(() => setReady(true));
  }, [refresh]);

  const signIn = useCallback(async (provider: "google" | "x") => {
    const startUrl = `${API_URL}/api/auth/${provider}/start?client=app`;
    try {
      const result = await WebBrowser.openAuthSessionAsync(startUrl, "cloakpay://auth");
      if (result.type !== "success") {
        // "cancel" and "dismiss" are both a user choice, not a failure, and the
        // message should not read like something broke.
        return { ok: false, message: "Sign-in was cancelled." };
      }
      const returned = Linking.parse(result.url);
      const code = typeof returned.queryParams?.code === "string" ? returned.queryParams.code : null;
      if (!code) return { ok: false, message: "That sign-in did not complete. Try again." };

      const exchanged = await api<{ token: string }>("/api/auth/mobile/exchange", {
        method: "POST",
        body: JSON.stringify({ code }),
        anonymous: true,
      });
      await setToken(exchanged.token);
      await refresh();
      return { ok: true };
    } catch (error) {
      return { ok: false, message: (error as Error).message };
    }
  }, [refresh]);

  const signOut = useCallback(async () => {
    try {
      await api("/api/auth/signout", { method: "POST" });
    } catch {
      // The local token is cleared regardless; a failed call must not trap the user.
    }
    await setToken(null);
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({ ready, user, signIn, signOut, refresh }),
    [ready, user, signIn, signOut, refresh],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used inside AuthProvider");
  return value;
}
