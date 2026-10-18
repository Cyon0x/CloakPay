"use client";

import { useState } from "react";
import { NotificationList } from "./NotificationList";
import { Icon } from "./Icon";
import { Card, EmptyState } from "./ui";
import { useNotifications } from "@/lib/client/useNotifications";

/**
 * The full notification inbox.
 *
 * The header bell is a glance; this page is where a person can work through
 * everything, filter to what is still unread, and clear the badge deliberately.
 */
export function NotificationsCenter() {
  const { notifications, unread, state, markingAll, markRead, markAllRead, refresh } = useNotifications();
  const [filter, setFilter] = useState<"all" | "unread">("all");
  const visible = filter === "unread" ? notifications.filter((item) => !item.read_at) : notifications;

  return (
    <div className="notifications-center">
      <header className="page-header">
        <div>
          <h1 className="page-title">Notifications</h1>
          <p className="page-subtitle">
            Stay updated on your transactions, payments and account activity.
          </p>
        </div>
        <div className="page-actions">
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => void markAllRead()}
            disabled={markingAll || unread === 0}
          >
            {markingAll ? "Marking…" : unread === 0 ? "All read" : "Mark all read"}
          </button>
        </div>
      </header>

      <div className="inbox-toolbar">
        <div className="segmented" role="group" aria-label="Filter notifications">
          <button
            type="button"
            className={filter === "all" ? "is-active" : undefined}
            aria-pressed={filter === "all"}
            onClick={() => setFilter("all")}
          >
            All
            <span className="segmented-count">{notifications.length}</span>
          </button>
          <button
            type="button"
            className={filter === "unread" ? "is-active" : undefined}
            aria-pressed={filter === "unread"}
            onClick={() => setFilter("unread")}
          >
            Unread
            <span className="segmented-count">{unread}</span>
          </button>
        </div>
        <button type="button" className="btn btn-ghost btn-sm inbox-refresh" onClick={() => void refresh()}>
          <Icon name="refresh" size={15} strokeWidth={1.8} />
          Refresh
        </button>
      </div>

      {state === "loading" ? (
        <Card>
          <div className="inbox-loading" role="status">
            <span className="skeleton notifications-skeleton" />
            <span className="skeleton notifications-skeleton short" />
            <span className="skeleton notifications-skeleton" />
            <span className="tiny muted">Loading your notifications…</span>
          </div>
        </Card>
      ) : state === "error" ? (
        <EmptyState
          title="Couldn't load notifications"
          body="Check your connection and try again. Your payment history is unaffected."
          action={
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => void refresh()}>
              Try again
            </button>
          }
        />
      ) : visible.length === 0 ? (
        <EmptyState
          title={filter === "unread" ? "Nothing unread" : "You're all caught up"}
          body={
            filter === "unread"
              ? "Every notification has been read. Switch back to All to look through earlier ones."
              : "Payments and confirmations for your username will appear here."
          }
        />
      ) : (
        <Card className="inbox-card">
          <NotificationList
            items={visible}
            className="inbox-list"
            onOpen={(item) => void markRead(item.id)}
          />
        </Card>
      )}
    </div>
  );
}
