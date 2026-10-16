import { formatWei } from "@/lib/format";

/**
 * Formatting shared by the receipt on screen and the receipt in the PDF.
 *
 * Kept free of database and server imports so the same function renders in a
 * browser, in a server component and inside the PDF route.
 */

/** "16 Oct 2026, 15:04 UTC" — one unambiguous reading, in any locale. */
export function formatStamp(date: Date | string): string {
  const iso = (typeof date === "string" ? new Date(date) : date).toISOString();
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const day = Number(iso.slice(8, 10));
  const month = months[Number(iso.slice(5, 7)) - 1];
  return `${day} ${month} ${iso.slice(0, 4)}, ${iso.slice(11, 16)} UTC`;
}

/** The amount as it appears on a receipt, or a dash when there is none. */
export function formatReceiptAmount(amountWei: string | null, symbol: string): string {
  if (!amountWei) return "—";
  return `${formatWei(BigInt(amountWei))} ${symbol}`;
}

/** Whether a payment's status supports issuing a completed receipt. */
export function isComplete(status: string): boolean {
  return status === "confirmed";
}
