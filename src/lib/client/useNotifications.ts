"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export interface NotificationItem {
  id: string;
  kind: string;
  title: string;
  body: string | null;
  payload: unknown;
  read_at: string | null;
  created_at: string;
}

type InboxState = "loading" | "ready" | "error";

/** Fired after a read-state change so every mounted inbox agrees immediately. */
export const NOTIFICATIONS_CHANGED = "cloakpay:notifications-changed";

interface ApiEnvelope {
  ok: boolean;
  data?: { notifications?: NotificationItem[]; unread?: number };
  error?: { message?: string };
}

export function notificationHref(payload: unknown): string {
  if (!payload || typeof payload !== "object") return "/activity";
  const paymentId = (payload as { paymentId?: unknown }).paymentId;
  return typeof paymentId === "string" && paymentId.length > 0
    ? `/transactions/${encodeURIComponent(paymentId)}`
    : "/activity";
}

export function notificationIconName(kind: string): string {
  if (kind === "payment.confirmed" || kind === "payment.received.confirmed") return "check";
  if (kind.endsWith("private")) return "shield";
  if (kind === "payment.failed") return "alert";
  return "receive";
}

export function relativeTime(value: string): string {
  const then = new Date(value).getTime();
  if (!Number.isFinite(then)) return "";
  const seconds = Math.round((then - Date.now()) / 1000);
  const formatter = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
  if (Math.abs(seconds) < 60) return formatter.format(seconds, "second");
  const minutes = Math.round(seconds / 60);
  if (Math.abs(minutes) < 60) return formatter.format(minutes, "minute");
  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 24) return formatter.format(hours, "hour");
  const days = Math.round(hours / 24);
  if (Math.abs(days) < 14) return formatter.format(days, "day");
  return new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function broadcastNotificationsChanged() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(NOTIFICATIONS_CHANGED));
}

/**
 * The signed-in notification inbox.
 *
 * Polls quietly in the background, refreshes when the tab becomes visible, and
 * applies read-state changes optimistically. Mutations broadcast one event so
 * the header bell, the nav badge and the inbox page never disagree about the
 * unread count.
 */
export function useNotifications({ pollMs = 30_000 }: { pollMs?: number } = {}) {
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unread, setUnread] = useState(0);
  const [state, setState] = useState<InboxState>("loading");
  const [markingAll, setMarkingAll] = useState(false);
  const loaded = useRef(false);
  const inFlight = useRef<Promise<void> | null>(null);

  const load = useCallback(async () => {
    if (inFlight.current) return inFlight.current;
    const run = (async () => {
      try {
        const response = await fetch("/api/notifications", { cache: "no-store" });
        const body = (await response.json()) as ApiEnvelope;
        if (!response.ok || !body.ok || !body.data?.notifications) {
          throw new Error(body.error?.message ?? "Notifications could not be loaded.");
        }
        setNotifications(body.data.notifications);
        setUnread(body.data.unread ?? body.data.notifications.filter((item) => !item.read_at).length);
        setState("ready");
        loaded.current = true;
      } catch {
        // A failed poll must not replace an inbox that is already on screen.
        if (!loaded.current) setState("error");
      } finally {
        inFlight.current = null;
      }
    })();
    inFlight.current = run;
    return run;
  }, []);

  useEffect(() => {
    void load();
    const interval = window.setInterval(() => void load(), pollMs);
    const onVisibility = () => {
      if (document.visibilityState === "visible") void load();
    };
    const onChanged = () => void load();
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener(NOTIFICATIONS_CHANGED, onChanged);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener(NOTIFICATIONS_CHANGED, onChanged);
    };
  }, [load, pollMs]);

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
    try {
      const response = await fetch(`/api/notifications/${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: "{}",
      });
      if (!response.ok) throw new Error("Could not mark that notification read.");
      broadcastNotificationsChanged();
    } catch {
      void load();
    }
  }, [load]);

  const markAllRead = useCallback(async () => {
    if (markingAll || unread === 0) return;
    setMarkingAll(true);
    const now = new Date().toISOString();
    setNotifications((current) => current.map((item) => ({ ...item, read_at: item.read_at ?? now })));
    setUnread(0);
    try {
      const response = await fetch("/api/notifications", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: "{}",
      });
      if (!response.ok) throw new Error("Could not mark notifications read.");
      broadcastNotificationsChanged();
    } catch {
      void load();
    } finally {
      setMarkingAll(false);
    }
  }, [load, markingAll, unread]);

  return { notifications, unread, state, markingAll, markRead, markAllRead, refresh: load };
}
