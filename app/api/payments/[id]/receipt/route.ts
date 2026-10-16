import { handle, fail } from "@/lib/api";
import { requireUser } from "@/lib/session";
import { loadReceipt } from "@/lib/receipt/data";
import { renderReceiptPdf } from "@/lib/receipt/pdf";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * The downloadable receipt.
 *
 * The file is produced from the payment row itself, so the PDF always says what
 * the database says: a pending or failed payment cannot be downloaded as a
 * completed receipt, because only a confirmed one reaches this code at all.
 *
 * Authorization is the same query that loads the row (`loadReceipt`), so a
 * payment that does not name the caller is indistinguishable from one that does
 * not exist. A receipt is never downloadable by guessing an id.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireUser();
    const { id } = await params;

    const found = await loadReceipt(id, user.userId);
    if (!found.ok) return fail(404, "not_found", "No such receipt on this account.");
    if (!found.receipt.complete) {
      return fail(
        409,
        "not_confirmed",
        "This payment has not confirmed, so there is no completed receipt for it yet.",
      );
    }

    const bytes = await renderReceiptPdf(found.receipt);
    return new Response(Buffer.from(bytes), {
      status: 200,
      headers: {
        "content-type": "application/pdf",
        // The filename is the receipt reference, so a folder of receipts sorts
        // and searches by the same id the app shows.
        "content-disposition": `attachment; filename="cloakpay-receipt-${found.receipt.receiptId}.pdf"`,
        "cache-control": "private, no-store",
      },
    });
  } catch (error) {
    return handle(error);
  }
}
