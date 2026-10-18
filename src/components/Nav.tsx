"use client";

import Link from "next/link";
import { createPortal } from "react-dom";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { BrandLink } from "./Brand";
import { Icon } from "./Icon";
import { activeChain } from "@/config/chain";
import { NotificationsBell } from "./NotificationsBell";
import { ThemeToggle } from "./ThemeToggle";
import { useInstallApp } from "@/lib/client/install";
import type { SessionUser } from "@/lib/session";

export interface NavUser {
  username: string | null;
  displayName: string | null;
}

/** One destination in the mobile drawer. */
interface DrawerItem {
  href: string;
  label: string;
  icon: string;
  /**
   * Set on a destination whose feature is not open yet. The page still exists
   * and is still worth reading, so the drawer keeps the link and labels it
   * rather than hiding a page that answers the question the user is asking.
   */
  soon?: boolean;
}

/** The horizontal bar, which is hidden on narrow screens. */
const DESKTOP_ITEMS = [
  { href: "/dashboard", label: "Home", icon: "home" },
  { href: "/send", label: "Send", icon: "send" },
  { href: "/receive", label: "Receive", icon: "receive" },
  { href: "/links", label: "Links", icon: "link" },
  { href: "/activity", label: "Activity", icon: "activity" },
];

/**
 * The mobile tab bar. Deliberately unchanged: the drawer is an addition to the
 * navigation, not a replacement for the five tabs people already reach for with
 * one thumb.
 */
const MOBILE_ITEMS = [
  { href: "/dashboard", label: "Home", icon: "home" },
  { href: "/activity", label: "Activity", icon: "activity" },
  { href: "/send", label: "Send", icon: "send", primary: true },
  { href: "/links", label: "Links", icon: "link" },
  { href: "/settings", label: "You", icon: "user" },
];

const PUBLIC_ITEMS = [
  { href: "/how-it-works", label: "How it works" },
  { href: "/security", label: "Security" },
  { href: "/faq", label: "FAQ" },
];

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select, [tabindex]:not([tabindex="-1"])';

/** True for the page itself and anything nested beneath it. */
function isCurrent(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function TopBar({
  user,
  withNav = true,
}: {
  user: NavUser | SessionUser | null;
  /** The authenticated shell has a sidebar; public pages do not. */
  withNav?: boolean;
}) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const [installOpen, setInstallOpen] = useState(false);
  // The drawer is portalled to `document.body`, so it cannot render until the
  // document exists.
  const [mounted, setMounted] = useState(false);
  const panel = useRef<HTMLDivElement>(null);
  const toggle = useRef<HTMLButtonElement>(null);
  const install = useInstallApp();

  useEffect(() => setMounted(true), []);

  // A route change should always close the panel. Leaving it open over the new
  // page would hide the content the user just asked for.
  useEffect(() => {
    setMenuOpen(false);
    setInstallOpen(false);
  }, [pathname]);

  // Escape closes, Tab stays inside, and focus returns to the control that
  // opened the panel rather than being dropped at the top of the document.
  useEffect(() => {
    if (!menuOpen) return;
    const node = panel.current;
    if (!node) return;

    const items = () =>
      Array.from(node.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (element) => element.offsetParent !== null,
      );

    items()[0]?.focus();

    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setMenuOpen(false);
        toggle.current?.focus();
        return;
      }
      if (event.key !== "Tab") return;
      const list = items();
      if (list.length === 0) return;
      const first = list[0];
      const last = list[list.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [menuOpen]);

  // The drawer covers the page, so the page behind it must not scroll.
  useEffect(() => {
    if (!menuOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [menuOpen]);

  const close = useCallback(() => setMenuOpen(false), []);

  const account: DrawerItem[] = user
    ? [
        { href: "/dashboard", label: "Home", icon: "home" },
        { href: "/send", label: "Send", icon: "send" },
        { href: "/receive", label: "Receive", icon: "receive" },
        { href: "/activity", label: "Activities", icon: "activity" },
        { href: "/notifications", label: "Notifications", icon: "bell" },
        { href: "/transactions", label: "All transactions", icon: "list" },
        { href: "/links", label: "Payment links", icon: "link" },
        { href: "/faucet", label: "Faucet", icon: "gift" },
        user.username
          ? { href: `/u/${user.username}`, label: "Profile", icon: "user" }
          : { href: "/onboarding", label: "Finish setup", icon: "user" },
        { href: "/settings", label: "Settings", icon: "settings" },
      ]
    : [];

  return (
    <header className={`topbar${withNav ? "" : " topbar-with-sidebar"}${!user ? " topbar-public" : ""}`}>
      <div className="shell topbar-inner">
        {/* Signed in, the brand is the way back to the app home. Signed out, it
            is the way back to the landing page. Both are the same component so
            the two headers cannot drift apart. On desktop the sidebar carries
            the lockup and this copy is hidden by the stylesheet. */}
        <div className="brand-block">
          <BrandLink href={user ? "/dashboard" : "/"} markSize={25} />
          <p className="brand-tagline">Private · Fast · Global</p>
        </div>

        {user && withNav ? (
          <nav className="topbar-nav" aria-label="Primary">
            {DESKTOP_ITEMS.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="nav-link"
                aria-current={isCurrent(pathname, item.href) ? "page" : undefined}
              >
                {item.label}
              </Link>
            ))}
          </nav>
        ) : !user ? (
          <nav className="topbar-nav" aria-label="Primary">
            {PUBLIC_ITEMS.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="nav-link"
                aria-current={isCurrent(pathname, item.href) ? "page" : undefined}
              >
                {item.label}
              </Link>
            ))}
          </nav>
        ) : null}

        {user && !withNav ? (
          <p className="topbar-context">
            <span className="topbar-context-dot" aria-hidden="true" />
            {activeChain.name}
          </p>
        ) : null}

        <div className="topbar-actions">
          <ThemeToggle />
          {user ? (
            <>
              <NotificationsBell />
              <Link href="/settings" className="btn btn-secondary btn-sm topbar-set">
                <Icon name="settings" size={15} />
                <span className="topbar-action-label">Settings</span>
              </Link>
            </>
          ) : (
            <>
              <Link href="/signin" className="btn btn-secondary topbar-signin">
                Sign in
              </Link>
              <Link href="/signin" className="btn btn-primary topbar-getstarted">
                Get started
              </Link>
            </>
          )}

          {/* The menu sits in both layouts: the compact header has no room for
              the full list, and the desktop bar cannot carry thirteen items. */}
          <button
            ref={toggle}
            type="button"
            className="theme-toggle menu-toggle"
            aria-expanded={menuOpen}
            aria-controls="app-menu"
            aria-label={menuOpen ? "Close navigation menu" : "Open navigation menu"}
            title={menuOpen ? "Close navigation menu" : "Open navigation menu"}
            onClick={() => setMenuOpen((open) => !open)}
          >
            <Icon name={menuOpen ? "close" : "menu"} size={18} strokeWidth={2} />
          </button>
        </div>
      </div>

      {/* The panel is rendered outside the header on purpose. `.topbar` carries
          a `backdrop-filter`, which makes it the containing block for
          `position: fixed` descendants -- the drawer would be sized to the 60px
          header and the scrim would cover only the header, not the page. The
          header's `z-index` also traps the overlay in its stacking context, so
          the mobile tab bar would paint over it. A portal escapes both. */}
      {mounted && menuOpen ? createPortal(
        <>
          <div className="drawer-scrim" onClick={close} aria-hidden="true" />
          <aside
            className="drawer"
            id="app-menu"
            ref={panel}
            role="dialog"
            aria-modal="true"
            aria-label="Navigation"
          >
            <div className="drawer-head">
              <p className="drawer-title">Menu</p>
              <button
                type="button"
                className="icon-btn"
                aria-label="Close navigation menu"
                title="Close navigation menu"
                onClick={() => {
                  setMenuOpen(false);
                  toggle.current?.focus();
                }}
              >
                <Icon name="close" size={18} strokeWidth={2} />
              </button>
            </div>

            <nav className="drawer-nav" aria-label="All destinations">
              {account.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="drawer-item"
                  aria-current={isCurrent(pathname, item.href) ? "page" : undefined}
                  onClick={close}
                >
                  <Icon name={item.icon} size={17} />
                  <span className="grow">{item.label}</span>
                  {item.soon ? (
                    <span className="drawer-soon">Coming soon</span>
                  ) : isCurrent(pathname, item.href) ? (
                    <span className="drawer-dot" aria-hidden="true" />
                  ) : null}
                </Link>
              ))}

              {!user
                ? PUBLIC_ITEMS.map((item) => (
                    <Link key={item.href} href={item.href} className="drawer-item" onClick={close}>
                      <Icon name="external" size={17} />
                      <span className="grow">{item.label}</span>
                    </Link>
                  ))
                : null}

              {!user ? (
                <Link href="/signin" className="drawer-item" onClick={close}>
                  <Icon name="lock" size={17} />
                  <span className="grow">Sign in</span>
                </Link>
              ) : null}

              {!user ? (
                <Link href="/signin" className="drawer-item" onClick={close}>
                  <Icon name="wallet" size={17} />
                  <span className="grow">Get started</span>
                </Link>
              ) : null}

              {/* Not a link and not pretending to be one. */}
              <span className="drawer-item drawer-item-disabled" aria-disabled="true">
                <Icon name="swap" size={17} />
                <span className="grow">Swap</span>
                <span className="drawer-soon">Coming soon</span>
              </span>

              <button
                type="button"
                className="drawer-item drawer-item-button"
                aria-expanded={installOpen}
                onClick={() => {
                  if (install.state.kind === "promptable") {
                    void install.install();
                    setInstallOpen(true);
                  } else {
                    setInstallOpen((open) => !open);
                  }
                }}
              >
                <Icon name="download" size={17} />
                <span className="grow">Install app</span>
                {install.state.kind === "installed" ? (
                  <span className="drawer-soon drawer-done">Installed</span>
                ) : (
                  <Icon name={installOpen ? "arrowLeft" : "arrowRight"} size={14} />
                )}
              </button>

              {installOpen ? (
                <div className="drawer-note" role="status" aria-live="polite">
                  {install.message ? <p className="tiny">{install.message}</p> : null}
                  {install.state.kind === "installed" ? (
                    <p className="tiny">CloakPay is on your home screen. Open it from there like any app.</p>
                  ) : install.state.kind === "promptable" ? (
                    <p className="tiny">
                      Your browser offered an install prompt. If nothing appeared, it may have been missed —
                      reopen the menu and try again.
                    </p>
                  ) : install.state.kind === "manual-ios" ? (
                    <p className="tiny">
                      On iPhone and iPad, installation is manual: tap the Share button in Safari, then
                      &ldquo;Add to Home Screen&rdquo;. No prompt exists for a website to call.
                    </p>
                  ) : (
                    <p className="tiny">
                      This browser exposes no install prompt. Look for &ldquo;Install app&rdquo; or
                      &ldquo;Add to Home Screen&rdquo; in its own menu. If it is not there, the browser does
                      not support installing sites.
                    </p>
                  )}
                </div>
              ) : null}

              {user ? (
                <>
                  <span className="drawer-sep" aria-hidden="true" />
                  <form action="/api/auth/signout" method="post" className="drawer-form">
                    <button type="submit" className="drawer-item drawer-item-danger drawer-item-button">
                      <Icon name="logout" size={17} />
                      <span className="grow">Log out</span>
                    </button>
                  </form>
                </>
              ) : null}
            </nav>
          </aside>
        </>,
        document.body,
      ) : null}
    </header>
  );
}

/**
 * The desktop rail. It carries the same five destinations as the phone tab bar
 * and the same routes, but with room for the full lockup and the account, as in
 * the reference. It is display:none below the desktop breakpoint, where the
 * compact header and tab bar take over; the drawer remains the complete list.
 */
export function AppSidebar({ user }: { user: NavUser | SessionUser | null }) {
  const pathname = usePathname();
  if (!user) return null;

  const initial = (user.displayName ?? user.username ?? "C").trim().slice(0, 1).toUpperCase();

  return (
    <aside className="app-sidebar" aria-label="Primary">
      <div className="sidebar-brand">
        <BrandLink href="/dashboard" markSize={27} />
        <p className="brand-tagline">Private · Fast · Global</p>
      </div>

      <nav className="sidebar-nav">
        {DESKTOP_ITEMS.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="sidebar-link"
            aria-current={isCurrent(pathname, item.href) ? "page" : undefined}
          >
            <Icon name={item.icon} size={18} strokeWidth={1.7} />
            <span>{item.label}</span>
          </Link>
        ))}
      </nav>

      <div className="sidebar-foot">
        <Link href="/settings" className="sidebar-account" aria-label="Account and settings">
          <span className="avatar avatar-sm" aria-hidden="true">{initial}</span>
          <span className="sidebar-account-name">@{user.username ?? "account"}</span>
          <Icon name="settings" size={16} strokeWidth={1.7} />
        </Link>
      </div>
    </aside>
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
            aria-current={isCurrent(pathname, item.href) ? "page" : undefined}
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
            aria-current={isCurrent(pathname, item.href) ? "page" : undefined}
          >
            <span className="mobile-nav-icon">
              <Icon name={item.icon} />
            </span>
            <span>{item.label}</span>
          </Link>
        ),
      )}
    </nav>
  );
}
