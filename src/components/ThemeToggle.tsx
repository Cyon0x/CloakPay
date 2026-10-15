"use client";

import { useCallback, useEffect, useState } from "react";
import { Icon } from "./Icon";

export type Theme = "light" | "dark";

export const THEME_KEY = "cloakpay.theme";

/**
 * The active theme lives on `<html data-theme>`, set before first paint by the
 * script in the document head. This component reads that attribute rather than
 * owning the value, so the server render, the bootstrap script and the toggle
 * can never disagree about which theme is showing.
 */
function readTheme(): Theme {
  if (typeof document === "undefined") return "light";
  return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
}

/**
 * Keeps the browser chrome in step with the surface. Next emits one
 * `theme-color` per `prefers-color-scheme`, and those media queries describe
 * the operating system rather than the choice made here, so an explicit
 * selection would otherwise leave the address bar on the wrong colour until the
 * next load.
 */
function syncThemeColor(theme: Theme) {
  const colour = theme === "dark" ? "#0b0d10" : "#faf9f7";
  for (const meta of document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')) {
    meta.removeAttribute("media");
    meta.content = colour;
  }
}

function applyTheme(theme: Theme) {
  const root = document.documentElement;

  // The transition is scoped to the switch itself. Left on permanently it would
  // also slow down hover and focus changes, which should stay immediate.
  root.classList.add("theming");
  root.dataset.theme = theme;
  root.style.colorScheme = theme;
  syncThemeColor(theme);

  window.setTimeout(() => root.classList.remove("theming"), 320);
}

export function ThemeToggle({ className }: { className?: string }) {
  // The glyph is chosen by CSS from `html[data-theme]` rather than by React, so
  // the right one is painted by the bootstrap script before hydration and the
  // button never spends a frame showing the wrong icon. Only the label, which
  // nobody sees, waits for the effect below to catch up.
  const [theme, setTheme] = useState<Theme>("light");

  useEffect(() => {
    setTheme(readTheme());
  }, []);

  const toggle = useCallback(() => {
    const next: Theme = readTheme() === "dark" ? "light" : "dark";
    try {
      window.localStorage.setItem(THEME_KEY, next);
    } catch {
      // A blocked storage API must not stop the theme from changing.
    }
    applyTheme(next);
    setTheme(next);
  }, []);

  // Follow the system preference only while the user has not chosen for
  // themselves, which is the same rule the bootstrap script applies.
  useEffect(() => {
    const query = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = (event: MediaQueryListEvent) => {
      let stored: string | null = null;
      try {
        stored = window.localStorage.getItem(THEME_KEY);
      } catch {
        stored = null;
      }
      if (stored === "light" || stored === "dark") return;
      const next: Theme = event.matches ? "dark" : "light";
      applyTheme(next);
      setTheme(next);
    };
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  const label = theme === "dark" ? "Switch to light theme" : "Switch to dark theme";

  return (
    <button
      type="button"
      className={className ?? "theme-toggle"}
      onClick={toggle}
      aria-label={label}
      title={label}
    >
      {/* Named for the theme each one switches to, so the stylesheet reads as
          the same sentence the label does. */}
      <Icon name="moon" className="theme-glyph to-dark" size={18} strokeWidth={2} />
      <Icon name="sun" className="theme-glyph to-light" size={18} strokeWidth={2} />
    </button>
  );
}
