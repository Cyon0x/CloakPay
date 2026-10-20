"use client";

import { useEffect } from "react";
import { THEME_KEY } from "./ThemeToggle";

/**
 * Applies the landing page's dark first-visit default after client-side
 * navigation. A hard load is handled before paint by the inline bootstrap in
 * `app/page.tsx`; this covers React navigation from another public page.
 */
export function LandingThemeDefault() {
  useEffect(() => {
    let saved: string | null = null;
    try {
      saved = window.localStorage.getItem(THEME_KEY);
    } catch {
      // Storage can be blocked; the visual default should still apply.
    }
    if (saved === "light" || saved === "dark") return;

    try {
      window.localStorage.setItem(THEME_KEY, "dark");
    } catch {
      // The theme still applies for this visit.
    }

    const root = document.documentElement;
    root.dataset.theme = "dark";
    root.style.colorScheme = "dark";
    for (const meta of document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')) {
      meta.removeAttribute("media");
      meta.content = "#0b0d10";
    }
  }, []);

  return null;
}
