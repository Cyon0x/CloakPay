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
            txHash={receipt.txHash}
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
                ? `The reference above is the payment's id inside CloakPay, and the transaction reference is what the network recorded for it. Testing happens on a public test network, so a payment made here is not private: the chain can show that an address paid an address. What it does not show is who that address belongs to — CloakPay keeps the link between a username and an address to itself, and no receipt ever prints an address.`
                : "CloakPay only issues a completed receipt for a payment the network has confirmed. Nothing is downloaded for a payment in another state, because a receipt is a claim that money moved."}
            </Notice>
          </div>
        </div>
      </>
    </AuthedShell>
  );
}
