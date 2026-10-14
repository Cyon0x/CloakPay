"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BrandLink } from "./Brand";
import { Icon } from "./Icon";
import type { SessionUser } from "@/lib/session";

export interface NavUser {
  username: string | null;
  displayName: string | null;
}

const DESKTOP_ITEMS = [
  { href: "/dashboard", label: "Home", icon: "home" },
  { href: "/send", label: "Send", icon: "send" },
  { href: "/receive", label: "Receive", icon: "receive" },
  { href: "/links", label: "Links", icon: "link" },
  { href: "/activity", label: "Activity", icon: "activity" },
];

/** Home, Activity, Send, Links, You. Send is anchored in the middle. */
const MOBILE_ITEMS = [
  { href: "/dashboard", label: "Home", icon: "home" },
  { href: "/activity", label: "Activity", icon: "activity" },
  { href: "/send", label: "Send", icon: "send", primary: true },
  { href: "/links", label: "Links", icon: "link" },
  { href: "/settings", label: "You", icon: "user" },
];

const PUBLIC_ITEMS = [
  { href: "/how-it-works", label: "How it works" },
  { href: "/security", label: "Privacy" },
  { href: "/faq", label: "FAQ" },
];

export function TopBar({ user }: { user: NavUser | SessionUser | null }) {
  const pathname = usePathname();

  return (
    <div className="topbar">
      <div className="shell topbar-inner">
        <BrandLink markSize={26} />
        {user ? (
          <nav className="topbar-nav" aria-label="Primary">
            {DESKTOP_ITEMS.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="nav-link"
                aria-current={pathname === item.href ? "page" : undefined}
              >
                {item.label}
              </Link>
            ))}
          </nav>
        ) : (
          <nav className="topbar-nav" aria-label="Primary">
            {PUBLIC_ITEMS.map((item) => (
              <Link key={item.href} href={item.href} className="nav-link">
                {item.label}
              </Link>
            ))}
          </nav>
        )}
        <div className="topbar-actions">
          {user ? (
            <>
              {user.username ? (
                <Link href={`/u/${user.username}`} className="btn btn-ghost btn-sm topbar-handle">
                  @{user.username}
                </Link>
              ) : (
                <Link href="/onboarding" className="btn btn-ghost btn-sm topbar-handle">
                  Finish setup
                </Link>
              )}
              <Link href="/settings" className="btn btn-secondary btn-sm">
                <Icon name="settings" size={15} />
                <span className="topbar-action-label">Settings</span>
              </Link>
            </>
          ) : (
            <>
              <Link href="/signin" className="btn btn-secondary btn-sm">
                Sign in
              </Link>
              <Link href="/signin" className="btn btn-primary btn-sm">
                Get started
              </Link>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export function MobileNav() {
  const pathname = usePathname();
  return (
    <nav className="mobile-nav" aria-label="Primary, mobile">
      {MOBILE_ITEMS.map((item) =>
        item.primary ? (
          <Link
            key={item.href}
            href={item.href}
            className="mobile-send"
            aria-current={pathname === item.href ? "page" : undefined}
          >
            <span className="mobile-send-disc">
              <Icon name="send" size={21} strokeWidth={1.8} />
            </span>
            <span className="mobile-send-label">{item.label}</span>
          </Link>
        ) : (
          <Link
            key={item.href}
            href={item.href}
            className="nav-link"
            aria-current={pathname === item.href ? "page" : undefined}
          >
            <Icon name={item.icon} />
            <span>{item.label}</span>
          </Link>
        ),
      )}
    </nav>
  );
}
