import { redirect } from "next/navigation";
import { TopBar } from "@/components/Nav";
import { Notice } from "@/components/ui";
import { OnboardingWizard } from "@/components/OnboardingWizard";
import { currentUser } from "@/lib/session";
import { activeChain } from "@/config/chain";

export const metadata = { title: "Set up your account" };
export const dynamic = "force-dynamic";

export default async function OnboardingPage() {
  const user = await currentUser();
  if (!user) redirect("/signin?error=session_expired");
  if (user.onboardingStep === "complete") redirect("/dashboard");

  return (
    <div className="app-shell">
      <TopBar user={user} />
      <main id="main" className="app-body">
        <div className="shell" style={{ maxWidth: 620, paddingTop: 40, paddingBottom: 90 }}>
          <h1 style={{ fontSize: 27 }}>Three things and you are done</h1>
          <p className="muted" style={{ marginTop: 10, fontSize: 14 }}>
            A username, a wallet, and a passphrase. Nothing else is required before you can use{" "}
            {activeChain.name}.
          </p>

          <div style={{ marginTop: 24 }}>
            <Notice tone="info" title="Before you continue">
              This is a testnet. Anything you deposit has no monetary value, and no independent audit of
              CloakPay or its contracts has taken place.
            </Notice>
          </div>

          <div style={{ marginTop: 26 }}>
            <OnboardingWizard
              initialUsername={user.username ?? ""}
              initialDisplayName={user.displayName ?? ""}
              chainId={activeChain.chainId}
            />
          </div>
        </div>
      </main>
    </div>
  );
}
