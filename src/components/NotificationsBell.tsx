"use client";

import Link from "next/link";
import { createPortal } from "react-dom";
import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { Icon } from "./Icon";
import { NotificationList } from "./NotificationList";
import {
  notificationHref,
  notificationIconName,
  useNotifications,
  type NotificationItem,
} from "@/lib/client/useNotifications";

/**
 * The header bell.
 *
 * This is the inbox for the notifications the payment API already records. It
 * reads the same rows as the full inbox page, never adds an amount to preview
 * text, marks only the row that was opened as read, and raises a quiet in-app
 * notice when a new one arrives while the app is open.
 */
export function NotificationsBell() {
  const pathname = usePathname();
  const panelId = useId();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const knownTop = useRef<string | null>(null);
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);
  const [toast, setToast] = useState<NotificationItem | null>(null);
  const { notifications, unread, state, markingAll, markRead, markAllRead, refresh } = useNotifications();

  useEffect(() => setMounted(true), []);

  // A route change closes the panel and dismisses any stale arrival notice.
  useEffect(() => {
    setOpen(false);
    setToast(null);
  }, [pathname]);

  useEffect(() => {
    if (state !== "ready" || notifications.length === 0) return;
    const top = notifications[0];
    if (knownTop.current === null) {
      knownTop.current = top.id;
      return;
    }
    if (top.id === knownTop.current) return;
    knownTop.current = top.id;
    if (!open && !top.read_at) setToast(top);
  }, [notifications, open, state]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 7000);
    return () => window.clearTimeout(timer);
  }, [toast]);

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

  function openNotifications() {
    const next = !open;
    setOpen(next);
    if (next) void refresh();
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
                    <button type="button" className="btn btn-secondary btn-sm" onClick={() => void refresh()}>
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
                        disabled={markingAll || unread === 0}
                      >
                        {markingAll ? "Marking…" : unread === 0 ? "All read" : "Mark all read"}
                      </button>
                    </div>
                    <NotificationList
                      items={notifications}
                      onOpen={(item) => {
                        void markRead(item.id);
                        setOpen(false);
                      }}
                    />
                  </>
                )}
              </div>

              <div className="notifications-foot">
                <Link href="/notifications" onClick={() => setOpen(false)}>
                  View all notifications
                  <Icon name="arrowRight" size={14} strokeWidth={1.8} />
                </Link>
                <span>Previews never include an amount.</span>
              </div>
            </div>,
            document.body,
          )
        : null}

      {mounted && toast
        ? createPortal(
            <div className="notification-toast" role="status" aria-live="polite">
              <span className="notification-icon" aria-hidden="true">
                <Icon name={notificationIconName(toast.kind)} size={17} strokeWidth={1.7} />
              </span>
              <Link href={notificationHref(toast.payload)} onClick={() => setToast(null)}>
                <span className="notification-toast-title">{toast.title}</span>
                {toast.body ? <span className="notification-toast-body">{toast.body}</span> : null}
              </Link>
              <button
                type="button"
                className="icon-btn notification-toast-close"
                onClick={() => setToast(null)}
                aria-label="Dismiss notification"
              >
                <Icon name="close" size={14} strokeWidth={2} />
              </button>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
