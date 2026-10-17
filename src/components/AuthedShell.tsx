import { redirect } from "next/navigation";
import { AppSidebar, MobileNav, TopBar } from "./Nav";
import { currentUser, type SessionUser } from "@/lib/session";
import type { ReactNode } from "react";

/**
 * Guards every authenticated page and renders the persistent chrome.
 * A user who has not finished onboarding is sent to it rather than shown a
 * half-working dashboard.
 */
export async function AuthedShell({
  children,
  allowIncompleteOnboarding = false,
}: {
  children: ReactNode | ((user: SessionUser) => ReactNode);
  allowIncompleteOnboarding?: boolean;
}) {
  const user = await currentUser();
  if (!user) redirect("/signin?error=session_expired");
  if (!allowIncompleteOnboarding && user.onboardingStep !== "complete") {
    redirect("/onboarding");
  }

  return (
    <div className="app-shell app-shell-auth">
      <AppSidebar user={user} />
      <div className="app-main">
        <TopBar user={user} withNav={false} />
        <main id="main" className="app-body">
          <div className="shell page">{typeof children === "function" ? children(user) : children}</div>
        </main>
        <MobileNav />
      </div>
    </div>
  );
}
