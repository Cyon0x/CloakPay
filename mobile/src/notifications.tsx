"use client";

/**
 * Notifications for the native app.
 *
 * One provider owns the inbox so the Alerts tab, its unread badge, Settings and
 * the in-app arrival banner share the same rows and the same read state. It
 * polls quietly, refreshes when the app returns to the foreground, and never
 * auto-marks anything read: a notification becomes read when it is opened or
 * when "Mark all read" is chosen.
 */
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { AppState, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { api } from "./api";
import { useAuth } from "./auth";
import { Icon } from "./components/Icon";
import { color, radius, space, type } from "./theme";

export interface AppNotification {
  id: string;
  kind: string;
  title: string;
  body: string | null;
  payload: unknown;
  read_at: string | null;
  created_at: string;
}

type InboxState = "loading" | "ready" | "error";

interface NotificationsValue {
  notifications: AppNotification[];
  unread: number;
  state: InboxState;
  markingAll: boolean;
  fresh: AppNotification | null;
  clearFresh: () => void;
  refresh: () => Promise<void>;
  markRead: (id: string) => Promise<void>;
  markAllRead: () => Promise<void>;
}

const NotificationsContext = createContext<NotificationsValue | null>(null);

export function NotificationsProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [unread, setUnread] = useState(0);
  const [state, setState] = useState<InboxState>("loading");
  const [markingAll, setMarkingAll] = useState(false);
  const [fresh, setFresh] = useState<AppNotification | null>(null);
  const loaded = useRef(false);
  const knownTop = useRef<string | null>(null);
  const inFlight = useRef<Promise<void> | null>(null);

  const refresh = useCallback(async () => {
    if (!user) {
      setNotifications([]);
      setUnread(0);
      setState("ready");
      knownTop.current = null;
      loaded.current = false;
      return;
    }
    if (inFlight.current) return inFlight.current;
    const run = (async () => {
      try {
        const data = await api<{ notifications: AppNotification[]; unread: number }>("/api/notifications");
        const rows = data.notifications ?? [];
        setNotifications(rows);
        setUnread(data.unread ?? rows.filter((item) => !item.read_at).length);
        setState("ready");
        const top = rows[0];
        if (!loaded.current) {
          loaded.current = true;
          knownTop.current = top?.id ?? null;
        } else if (top && top.id !== knownTop.current) {
          knownTop.current = top.id;
          if (!top.read_at) setFresh(top);
        }
      } catch {
        if (!loaded.current) setState("error");
      } finally {
        inFlight.current = null;
      }
    })();
    inFlight.current = run;
    return run;
  }, [user]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!user) return;
    const interval = setInterval(() => void refresh(), 30_000);
    const subscription = AppState.addEventListener("change", (next) => {
      if (next === "active") void refresh();
    });
    return () => {
      clearInterval(interval);
      subscription.remove();
    };
  }, [refresh, user]);

  const markRead = useCallback(async (id: string) => {
    let changed = false;
    const now = new Date().toISOString();
    setNotifications((current) =>
      current.map((item) => {
        if (item.id !== id || item.read_at) return item;
        changed = true;
        return { ...item, read_at: now };
      }),
    );
    if (!changed) return;
    setUnread((current) => Math.max(0, current - 1));
    setFresh((current) => (current?.id === id ? null : current));
    try {
      await api(`/api/notifications/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify({}) });
    } catch {
      void refresh();
    }
  }, [refresh]);

  const markAllRead = useCallback(async () => {
    if (markingAll || unread === 0) return;
    setMarkingAll(true);
    const now = new Date().toISOString();
    setNotifications((current) => current.map((item) => ({ ...item, read_at: item.read_at ?? now })));
    setUnread(0);
    setFresh(null);
    try {
      await api("/api/notifications", { method: "PATCH", body: JSON.stringify({}) });
    } catch {
      void refresh();
    } finally {
      setMarkingAll(false);
    }
  }, [markingAll, refresh, unread]);

  const clearFresh = useCallback(() => setFresh(null), []);

  const value = useMemo(
    () => ({ notifications, unread, state, markingAll, fresh, clearFresh, refresh, markRead, markAllRead }),
    [notifications, unread, state, markingAll, fresh, clearFresh, refresh, markRead, markAllRead],
  );

  return (
    <NotificationsContext.Provider value={value}>
      <View style={styles.shell}>
        {children}
        <NotificationBanner />
      </View>
    </NotificationsContext.Provider>
  );
}

export function useNotifications(): NotificationsValue {
  const value = useContext(NotificationsContext);
  if (!value) throw new Error("useNotifications must be used inside NotificationsProvider");
  return value;
}

export function notificationKindIcon(kind: string): string {
  if (kind === "payment.confirmed" || kind === "payment.received.confirmed") return "check";
  if (kind.endsWith("private")) return "shield";
  if (kind === "payment.failed") return "alert";
  return "receive";
}

export function notificationAge(value: string): string {
  const then = new Date(value).getTime();
  if (!Number.isFinite(then)) return "";
  const seconds = Math.max(0, Math.round((Date.now() - then) / 1000));
  if (seconds < 60) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 14) return `${days}d ago`;
  return new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/**
 * A quiet arrival notice for a notification that lands while the app is open.
 * It is dismissible, never covers the tab bar, and opening it marks the row read.
 */
function NotificationBanner() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { fresh, clearFresh, markRead } = useNotifications();

  useEffect(() => {
    if (!fresh) return;
    const timer = setTimeout(clearFresh, 7000);
    return () => clearTimeout(timer);
  }, [fresh, clearFresh]);

  if (!fresh) return null;

  async function open() {
    if (fresh) await markRead(fresh.id);
    clearFresh();
    router.push("/notifications");
  }

  return (
    <View style={[styles.bannerWrap, { bottom: 84 + insets.bottom }]} pointerEvents="box-none">
      <View style={styles.banner}>
        <Pressable style={styles.bannerMain} onPress={() => void open()} accessibilityRole="button">
          <View style={styles.bannerIcon}>
            <Icon name={notificationKindIcon(fresh.kind)} size={18} color={color.ink900} strokeWidth={1.7} />
          </View>
          <View style={styles.bannerCopy}>
            <Text style={styles.bannerTitle} numberOfLines={1}>{fresh.title}</Text>
            {fresh.body ? <Text style={styles.bannerBody} numberOfLines={2}>{fresh.body}</Text> : null}
          </View>
        </Pressable>
        <Pressable
          onPress={clearFresh}
          hitSlop={10}
          style={styles.bannerClose}
          accessibilityRole="button"
          accessibilityLabel="Dismiss notification"
        >
          <Icon name="close" size={16} color={color.slate500} strokeWidth={2} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  shell: { flex: 1 },
  bannerWrap: { position: "absolute", left: 12, right: 12, zIndex: 100 },
  banner: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    padding: space.md,
    borderWidth: 1,
    borderColor: color.glassBorder,
    borderRadius: radius.lg,
    backgroundColor: color.glassChrome,
    shadowColor: "#14171b",
    shadowOpacity: 0.18,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
    elevation: 10,
  },
  bannerMain: { flexDirection: "row", alignItems: "center", gap: space.md, flex: 1, minWidth: 0 },
  bannerIcon: {
    width: 34,
    height: 34,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: color.glassBorder,
    borderRadius: 11,
    backgroundColor: color.glassSoft,
  },
  bannerCopy: { flex: 1, minWidth: 0, gap: 1 },
  bannerClose: { width: 32, height: 32, alignItems: "center", justifyContent: "center", borderRadius: 10 },
  bannerTitle: { fontSize: 13.5, fontWeight: "600", color: color.ink950 },
  bannerBody: { ...type.tiny, color: color.slate600 },
});
