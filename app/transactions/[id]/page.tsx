import Link from "next/link";
import { notFound } from "next/navigation";
import { AuthedShell } from "@/components/AuthedShell";
import { PaymentReceipt } from "@/components/PaymentReceipt";
import { Notice, PageHeader } from "@/components/ui";
import { currentUserOrRedirect } from "@/lib/session";
import { loadReceipt } from "@/lib/receipt/data";
import { activeChain } from "@/config/chain";

export const dynamic = "force-dynamic";

/**
 * One payment, reopened from the transaction history.
 *
 * The receipt here is the same component the send flow shows the moment a
 * payment confirms, so an old receipt and a fresh one cannot describe the same
 * payment differently. A payment that has not confirmed is still shown — with
 * the status it really has and no download — because hiding it would leave the
 * ledger and the receipt disagreeing about whether it exists.
 */
export default async function ReceiptPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await currentUserOrRedirect();
  const { id } = await params;

  const found = await loadReceipt(id, user.userId);
  if (!found.ok) notFound();
  const receipt = found.receipt;

  return (
    <AuthedShell>
      <>
        <PageHeader
          title="Receipt"
          subtitle={`Payment between two CloakPay users on ${activeChain.name}.`}
          actions={
            <Link href="/transactions" className="btn btn-secondary btn-sm">
              All transactions
            </Link>
          }
        />

        <div style={{ maxWidth: 620 }}>
          <PaymentReceipt
            receiptId={receipt.receiptId}
            status={receipt.status}
            fromUsername={receipt.fromUsername}
            toUsername={receipt.toUsername}
            amountWei={receipt.amountWei}
            symbol={receipt.asset}
            createdAt={receipt.createdAt.toISOString()}
            note={receipt.note}
            chainName={receipt.chainName}
            downloadable={receipt.complete}
          >
            <Link href="/activity" className="btn btn-ghost btn-sm">
              Activity
            </Link>
          </PaymentReceipt>

          <div style={{ marginTop: 16 }}>
            <Notice tone="info" title={receipt.complete ? "How to read this receipt" : "This payment is not complete"}>
              {receipt.complete
                ? `The reference above is the payment's id inside CloakPay, and it is the only reference you need to quote to support. This receipt deliberately carries no wallet address and no transaction hash: it records the payment, and it is not a pointer anybody can follow to a wallet or to an explorer. Testing happens on a public test network, so a transfer made here can still be seen on chain — but your receipt does not carry the means to look it up.`
                : "CloakPay only issues a completed receipt for a payment the network has confirmed. Nothing is downloaded for a payment in another state, because a receipt is a claim that money moved."}
            </Notice>
          </div>
        </div>
      </>
    </AuthedShell>
  );
}
