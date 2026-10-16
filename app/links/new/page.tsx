import Link from "next/link";
import { AuthedShell } from "@/components/AuthedShell";
import { PageHeader } from "@/components/ui";
import { LinkComposer } from "@/components/LinkComposer";
import { currentUserOrRedirect } from "@/lib/session";
import { env } from "@/lib/env";
import { DENOMINATIONS, poolStatusSentence, privatePaymentsAvailable } from "@/config/pool";
import { activeChain } from "@/config/chain";

export const metadata = { title: "New payment link" };
export const dynamic = "force-dynamic";

export default async function NewLinkPage() {
  const user = await currentUserOrRedirect();

  return (
    <AuthedShell>
      <PageHeader
        title="New payment link"
        subtitle="One URL that anyone can pay. They sign in only when they are ready to pay."
        actions={
          <Link href="/links" className="btn btn-secondary btn-sm">
            All links
          </Link>
        }
      />
      <LinkComposer
        denominations={DENOMINATIONS.map((denomination) => ({
          id: denomination.id,
          label: denomination.label,
          wei: denomination.wei.toString(),
        }))}
        privateReady={privatePaymentsAvailable(activeChain.chainId)}
        poolSentence={poolStatusSentence(activeChain.chainId)}
        symbol={activeChain.nativeToken.symbol}
        decimals={activeChain.nativeToken.decimals}
        appUrl={env.appUrl}
      />
    </AuthedShell>
  );
}
