import { AuthedShell } from "@/components/AuthedShell";
import { PageHeader } from "@/components/ui";
import { SendForm } from "@/components/SendForm";
import { currentUserOrRedirect } from "@/lib/session";
import { activeChain } from "@/config/chain";
import { db } from "@/lib/db";

export const metadata = { title: "Send" };
export const dynamic = "force-dynamic";

/**
 * Send.
 *
 * The only payment CloakPay offers is to another registered user, by username,
 * so the form asks for a username and an amount and nothing else. The address
 * behind an account never reaches this page: the settlement endpoint resolves
 * it server-side, only so the browser has something to sign against.
 */
export default async function SendPage({
  searchParams,
}: {
  searchParams: Promise<{ to?: string }>;
}) {
  const user = await currentUserOrRedirect();
  const { to } = await searchParams;

  const [wallet] = await db()<{ address: string }[]>`
    select address from wallets where user_id = ${user.userId}
  `;

  return (
    <AuthedShell>
      <PageHeader
        title="Send"
        subtitle="Pay another CloakPay user by typing their username. No wallet address changes hands, in either direction."
      />
      <SendForm
        walletAddress={wallet?.address ?? null}
        senderUsername={user.username ?? "you"}
        faucetUrl={activeChain.faucetUrl}
        symbol={activeChain.nativeToken.symbol}
        decimals={activeChain.nativeToken.decimals}
        initialRecipient={to}
      />
    </AuthedShell>
  );
}
