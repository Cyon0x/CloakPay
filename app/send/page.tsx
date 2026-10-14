import { AuthedShell } from "@/components/AuthedShell";
import { PageHeader } from "@/components/ui";
import { SendForm } from "@/components/SendForm";
import { db } from "@/lib/db";
import { currentUser } from "@/lib/session";
import { activeChain } from "@/config/chain";
import { DENOMINATIONS, getPoolDeployment } from "@/config/pool";

export const metadata = { title: "Send" };
export const dynamic = "force-dynamic";

export default async function SendPage({
  searchParams,
}: {
  searchParams: Promise<{ to?: string; amount?: string }>;
}) {
  const user = await currentUser();
  if (!user) return null;
  const { to } = await searchParams;

  const [wallet] = await db()<{ address: string }[]>`
    select address from wallets where user_id = ${user.userId}
  `;
  const deployment = getPoolDeployment(activeChain.chainId);

  return (
    <AuthedShell>
      <PageHeader
        title="Send"
        subtitle="Pay a username. Choose a fixed amount, then decide whether it settles privately or as a normal transfer."
      />
      <SendForm
        walletAddress={wallet?.address ?? null}
        poolDeployed={Boolean(deployment)}
        faucetUrl={activeChain.faucetUrl}
        denominations={DENOMINATIONS.map((denomination) => ({
          id: denomination.id,
          label: denomination.label,
          wei: denomination.wei.toString(),
        }))}
        initialRecipient={to}
      />
    </AuthedShell>
  );
}
