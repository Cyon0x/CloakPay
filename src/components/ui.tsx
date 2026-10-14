import type { CSSProperties, ReactNode } from "react";

export type PrivacyKind = "private" | "public" | "pending" | "failed" | "ok" | "info" | "setup";

const PRIVACY_LABELS: Record<string, string> = {
  private: "Private",
  public: "Public",
  pending: "Pending",
  failed: "Failed",
  confirmed: "Confirmed",
  submitted: "Submitted",
  expired: "Expired",
  setup: "Privacy setup required",
};

const PRIVACY_CLASS: Record<string, string> = {
  private: "badge-private",
  public: "badge-public",
  pending: "badge-pending",
  submitted: "badge-pending",
  failed: "badge-failed",
  expired: "badge-failed",
  confirmed: "badge-ok",
  ok: "badge-ok",
  info: "badge-info",
  setup: "badge-info",
};

/**
 * The privacy label reflects what actually happened on chain. A payment is only
 * ever labelled "Private" when the shielded flow completed for it.
 */
export function Badge({ kind, children }: { kind: string; children?: ReactNode }) {
  const cls = PRIVACY_CLASS[kind] ?? "badge-public";
  const label = children ?? PRIVACY_LABELS[kind] ?? kind;
  return (
    <span className={`badge ${cls}`}>
      <span className="dot" aria-hidden="true" />
      {label}
    </span>
  );
}

export function Card({
  children,
  className = "",
  style,
  as: Tag = "div",
}: {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  as?: "div" | "section" | "article" | "li";
}) {
  return (
    <Tag className={`card ${className}`.trim()} style={style}>
      {children}
    </Tag>
  );
}

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="page-header">
      <div>
        <h1 className="page-title">{title}</h1>
        {subtitle ? <p className="page-subtitle">{subtitle}</p> : null}
      </div>
      {actions ? <div className="page-actions">{actions}</div> : null}
    </header>
  );
}

export function EmptyState({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty">
      <p className="empty-title">{title}</p>
      <p className="empty-body">{body}</p>
      {action ? <div className="empty-action">{action}</div> : null}
    </div>
  );
}

export function Notice({
  tone = "info",
  title,
  children,
}: {
  tone?: "info" | "warn" | "error" | "ok";
  title?: string;
  children: ReactNode;
}) {
  return (
    <div className={`notice notice-${tone}`} role={tone === "error" ? "alert" : undefined}>
      {title ? <p className="notice-title">{title}</p> : null}
      <div className="notice-body">{children}</div>
    </div>
  );
}

export function Skeleton({ height = 16, width = "100%" }: { height?: number; width?: string }) {
  return <div className="skeleton" style={{ height, width }} />;
}

export function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) {
  return (
    <div className="stat">
      <p className="stat-label">{label}</p>
      <p className="stat-value mono">{value}</p>
      {hint ? <p className="stat-hint">{hint}</p> : null}
    </div>
  );
}
