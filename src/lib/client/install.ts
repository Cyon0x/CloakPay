"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * Home-screen installation.
 *
 * The browser decides whether an app can be installed, and only it can show the
 * prompt. This hook captures the event Chrome fires when the app qualifies,
 * replays it when the user asks, and reports plainly when the platform offers
 * no prompt at all so the UI can give instructions instead of pretending the
 * install happened.
 */
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

declare global {
  interface Window {
    __cloakpayInstallPrompt?: BeforeInstallPromptEvent;
  }
}

export type InstallState =
  | { kind: "checking" }
  | { kind: "promptable" }
  | { kind: "installed" }
  | { kind: "manual-ios" }
  | { kind: "manual-desktop" };

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  const navigatorWithStandalone = navigator as Navigator & { standalone?: boolean };
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    window.matchMedia("(display-mode: fullscreen)").matches ||
    navigatorWithStandalone.standalone === true
  );
}

function isIos(): boolean {
  if (typeof navigator === "undefined") return false;
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  );
}

export function useInstallApp() {
  const [state, setState] = useState<InstallState>({ kind: "checking" });
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (isStandalone()) {
      setState({ kind: "installed" });
      return;
    }
    const onAvailable = () => setState({ kind: "promptable" });
    const onInstalled = () => {
      window.__cloakpayInstallPrompt = undefined;
      setState({ kind: "installed" });
    };
    // The event can fire before React hydrates; the inline script in the root
    // layout stores it on `window` so this effect can still find it.
    if (window.__cloakpayInstallPrompt) setState({ kind: "promptable" });
    else setState({ kind: isIos() ? "manual-ios" : "manual-desktop" });

    window.addEventListener("cloakpay:installable", onAvailable);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("cloakpay:installable", onAvailable);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const install = useCallback(async () => {
    const event = window.__cloakpayInstallPrompt;
    if (!event) {
      setMessage("This browser has no install prompt. Use the steps below instead.");
      return;
    }
    try {
      await event.prompt();
      const choice = await event.userChoice;
      if (choice.outcome === "accepted") {
        setState({ kind: "installed" });
        setMessage("CloakPay was added to your device.");
      } else {
        setMessage("Installation was dismissed. You can try again from this menu.");
      }
    } catch {
      setMessage("The browser declined to open its install prompt.");
    } finally {
      // A captured prompt event is single use.
      window.__cloakpayInstallPrompt = undefined;
      setState((current) => (current.kind === "installed" ? current : { kind: isIos() ? "manual-ios" : "manual-desktop" }));
    }
  }, []);

  return { state, message, install };
}
