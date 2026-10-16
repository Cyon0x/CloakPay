import { AuthedShell } from "@/components/AuthedShell";
import { PageHeader } from "@/components/ui";
import { SendForm } from "@/components/SendForm";
import { db } from "@/lib/db";
import { currentUserOrRedirect } from "@/lib/session";
import { activeChain } from "@/config/chain";
import { DENOMINATIONS, poolStatusSentence, privatePaymentsAvailable } from "@/config/pool";

export const metadata = { title: "Send" };
export const dynamic = "force-dynamic";

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
        subtitle="Pay a CloakPay username privately, or send a public transfer to an external wallet address. The two settle differently and the form says which is which."
      />
      <SendForm
        walletAddress={wallet?.address ?? null}
        privateReady={privatePaymentsAvailable(activeChain.chainId)}
        poolSentence={poolStatusSentence(activeChain.chainId)}
        faucetUrl={activeChain.faucetUrl}
        symbol={activeChain.nativeToken.symbol}
        decimals={activeChain.nativeToken.decimals}
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
