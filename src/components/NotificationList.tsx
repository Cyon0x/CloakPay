import Link from "next/link";
import { Icon } from "./Icon";
import {
  notificationHref,
  notificationIconName,
  relativeTime,
  type NotificationItem,
} from "@/lib/client/useNotifications";

/**
 * One row per recorded notification.
 *
 * The row is the only place the title and body are rendered, so the bell and
 * the full inbox cannot drift apart, and a click marks exactly this row read.
 */
export function NotificationList({
  items,
  onOpen,
  className,
}: {
  items: NotificationItem[];
  onOpen?: (item: NotificationItem) => void;
  className?: string;
}) {
  return (
    <ul className={`notifications-list${className ? ` ${className}` : ""}`}>
      {items.map((item) => (
        <li key={item.id}>
          <Link
            href={notificationHref(item.payload)}
            className={`notification-row${item.read_at ? "" : " is-unread"}`}
            onClick={() => onOpen?.(item)}
          >
            <span className="notification-icon" aria-hidden="true">
              <Icon name={notificationIconName(item.kind)} size={17} strokeWidth={1.7} />
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
  );
}
