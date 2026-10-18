"use client";

import Link from "next/link";
import { createPortal } from "react-dom";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Icon } from "./Icon";

interface NotificationRow {
  id: string;
  kind: string;
  title: string;
  body: string | null;
  payload: unknown;
  read_at: string | null;
  created_at: string;
}

type PanelState = "idle" | "loading" | "ready" | "error";

function paymentHref(payload: unknown): string {
  if (!payload || typeof payload !== "object") return "/activity";
  const paymentId = (payload as { paymentId?: unknown }).paymentId;
  return typeof paymentId === "string" && paymentId.length > 0
    ? `/transactions/${encodeURIComponent(paymentId)}`
    : "/activity";
}

function notificationIcon(kind: string): string {
  if (kind === "payment.confirmed") return "check";
  if (kind === "payment.received.private") return "shield";
  return "receive";
}

function relativeTime(value: string): string {
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

/**
 * The header bell used to open the settings page. This is the real inbox for
 * the notifications the payment API already records. It reads the same rows,
 * never adds an amount to preview text, and links each row to the payment it
 * describes. "Mark all read" uses the existing PATCH endpoint.
 */
export function NotificationsBell() {
  const pathname = usePathname();
  const panelId = useId();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<PanelState>("idle");
  const [notifications, setNotifications] = useState<NotificationRow[]>([]);
  const [marking, setMarking] = useState(false);

  const unread = notifications.filter((item) => !item.read_at).length;

  const load = useCallback(async () => {
    setState((current) => (current === "ready" ? current : "loading"));
    try {
      const response = await fetch("/api/notifications", { cache: "no-store" });
      const body = (await response.json()) as {
        ok: boolean;
        data?: { notifications: NotificationRow[] };
        error?: { message?: string };
      };
      if (!response.ok || !body.ok || !body.data) {
        throw new Error(body.error?.message ?? "Notifications could not be loaded.");
      }
      setNotifications(body.data.notifications);
      setState("ready");
    } catch {
      setState("error");
    }
  }, []);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    void load();
    const interval = window.setInterval(() => void load(), 60_000);
    const onVisibility = () => {
      if (document.visibilityState === "visible") void load();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [load]);

  useEffect(() => setOpen(false), [pathname]);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (panelRef.current?.contains(target) || buttonRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setOpen(false);
      buttonRef.current?.focus();
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    const timer = window.setTimeout(() => {
      panelRef.current?.querySelector<HTMLElement>("a, button")?.focus();
    }, 0);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
      window.clearTimeout(timer);
    };
  }, [open]);

  const markAllRead = useCallback(async () => {
    if (marking || unread === 0) return;
    setMarking(true);
    const now = new Date().toISOString();
    setNotifications((current) => current.map((item) => ({ ...item, read_at: item.read_at ?? now })));
    try {
      const response = await fetch("/api/notifications", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: "{}",
      });
      if (!response.ok) throw new Error("Could not mark notifications read.");
    } catch {
      setState("error");
      void load();
    } finally {
      setMarking(false);
    }
  }, [load, marking, unread]);

  function openNotifications() {
    const next = !open;
    setOpen(next);
    if (next) void load();
  }

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        className="icon-btn topbar-bell"
        aria-label={unread > 0 ? `Notifications, ${unread} unread` : "Notifications"}
        title="Notifications"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        onClick={openNotifications}
      >
        <Icon name="bell" size={17} strokeWidth={1.7} />
        {unread > 0 ? <span className="topbar-bell-dot" aria-hidden="true">{unread > 9 ? "9+" : unread}</span> : null}
      </button>

      {mounted && open
        ? createPortal(
            <div
              ref={panelRef}
              id={panelId}
              className="notifications-panel"
              role="dialog"
              aria-modal="false"
              aria-label="Notifications"
            >
              <div className="notifications-head">
                <div>
                  <p className="notifications-title">Notifications</p>
                  <p className="notifications-sub">
                    {unread > 0 ? `${unread} unread` : "All caught up"}
                  </p>
                </div>
                <button
                  type="button"
                  className="icon-btn notifications-close"
                  onClick={() => {
                    setOpen(false);
                    buttonRef.current?.focus();
                  }}
                  aria-label="Close notifications"
                  title="Close notifications"
                >
                  <Icon name="close" size={17} strokeWidth={2} />
                </button>
              </div>

              <div className="notifications-body">
                {state === "loading" ? (
                  <div className="notifications-state" role="status">
                    <span className="skeleton notifications-skeleton" />
                    <span className="skeleton notifications-skeleton short" />
                    <span className="skeleton notifications-skeleton" />
                    <span className="tiny muted">Loading your notifications…</span>
                  </div>
                ) : state === "error" ? (
                  <div className="notifications-state" role="alert">
                    <span className="notifications-state-icon">
                      <Icon name="alert" size={20} />
                    </span>
                    <p className="notifications-empty-title">Couldn&apos;t load notifications</p>
                    <p className="tiny muted">Check your connection and try again.</p>
                    <button type="button" className="btn btn-secondary btn-sm" onClick={() => void load()}>
                      Try again
                    </button>
                  </div>
                ) : notifications.length === 0 ? (
                  <div className="notifications-state">
                    <span className="notifications-state-icon">
                      <Icon name="bell" size={21} strokeWidth={1.6} />
                    </span>
                    <p className="notifications-empty-title">You&apos;re all caught up</p>
                    <p className="tiny muted">
                      Payments and confirmations for your username will appear here.
                    </p>
                  </div>
                ) : (
                  <>
                    <div className="notifications-list-head">
                      <span>{notifications.length} recent</span>
                      <button
                        type="button"
                        className="link notifications-mark"
                        onClick={() => void markAllRead()}
                        disabled={marking || unread === 0}
                      >
                        {marking ? "Marking…" : unread === 0 ? "All read" : "Mark all read"}
                      </button>
                    </div>
                    <ul className="notifications-list">
                      {notifications.map((item) => (
                        <li key={item.id}>
                          <Link
                            href={paymentHref(item.payload)}
                            className={`notification-row${item.read_at ? "" : " is-unread"}`}
                            onClick={() => void markAllRead()}
                          >
                            <span className="notification-icon" aria-hidden="true">
                              <Icon name={notificationIcon(item.kind)} size={17} strokeWidth={1.7} />
                            </span>
                            <span className="notification-copy">
                              <span className="notification-row-title">
                                {item.title}
                                {!item.read_at ? <span className="notification-unread" aria-label="Unread" /> : null}
                              </span>
                              {item.body ? <span className="notification-body">{item.body}</span> : null}
                              <time dateTime={item.created_at} className="notification-time">
                                {relativeTime(item.created_at)}
                              </time>
                            </span>
                            <Icon name="chevronRight" size={15} strokeWidth={1.8} />
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </div>

              <div className="notifications-foot">
                <Link href="/activity" onClick={() => setOpen(false)}>
                  Open activity
                  <Icon name="arrowRight" size={14} strokeWidth={1.8} />
                </Link>
                <span>Previews never include an amount.</span>
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
