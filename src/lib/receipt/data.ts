import { db } from "@/lib/db";
import { activeChain } from "@/config/chain";

/**
 * Everything a receipt shows, and nothing else.
 *
 * Note what is absent: no wallet address of either party. A receipt is handed
 * to a user, downloaded to a disk and forwarded by mail, so it carries the two
 * usernames, the amount, the asset, the time, the status and the reference —
 * the things a person needs to recognise a payment — and no addressing detail.
 *
 * The transaction hash is kept because a receipt is also a reconciliation
 * document: support can match it against the chain from the payment record. It
 * is deliberately not part of a receipt anybody sees — not on the in-app page,
 * not in the PDF — so no document handed to a user carries a way to look the
 * payment up on a public ledger.
 */
export type ReceiptStatus = "pending" | "submitted" | "confirmed" | "failed" | "expired";

export interface ReceiptData {
  /** The payment's own id, which is also the receipt reference. */
  receiptId: string;
  status: ReceiptStatus;
  fromUsername: string;
  toUsername: string;
  amountWei: string | null;
  asset: string;
  note: string | null;
  createdAt: Date;
  confirmedAt: Date | null;
  /**
   * Held for reconciliation, never rendered. A receipt shows no transaction
   * hash, so this field exists only so the loader can be explicit about what it
   * reads and leaves out.
   */
  txHash: string | null;
  chainName: string;
  /** Whether this payment has reached a state a completed receipt can describe. */
  complete: boolean;
}

export type ReceiptLookup =
  | { ok: true; receipt: ReceiptData }
  | { ok: false; reason: "not_found" | "forbidden" };

/**
 * Loads one payment as a receipt, for one viewer.
 *
 * Authorization is the query, not a second step: a row that does not name the
 * viewer as sender or recipient simply is not returned, so no caller can forget
 * to check it. Sender and recipient both see their own receipt; nobody sees
 * anyone else's.
 */
export async function loadReceipt(paymentId: string, viewerUserId: string): Promise<ReceiptLookup> {
  // The id arrives from a URL, so it is checked before it reaches Postgres:
  // `::uuid` on a non-uuid is an error, and a malformed id is simply a payment
  // that does not exist rather than a 500.
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(paymentId)) {
    return { ok: false, reason: "not_found" };
  }

  const rows = await db()<
    {
      id: string;
      status: string;
      amount_wei: string | null;
      asset: string;
      note: string | null;
      created_at: Date;
      confirmed_at: Date | null;
      tx_hash: string | null;
      from_username: string | null;
      to_username: string | null;
    }[]
  >`
    select p.id, p.status, p.amount_wei, p.asset, p.note, p.created_at, p.confirmed_at, p.tx_hash,
           fu.username as from_username,
           tu.username as to_username
    from payments p
    left join users fu on fu.id = p.from_user_id
    left join users tu on tu.id = p.to_user_id
    where p.id = ${paymentId}::uuid
      and (p.from_user_id = ${viewerUserId} or p.to_user_id = ${viewerUserId})
  `;

  const row = rows[0];
  if (!row) return { ok: false, reason: "not_found" };

  const status = row.status as ReceiptStatus;
  return {
    ok: true,
    receipt: {
      receiptId: row.id,
      status,
      fromUsername: row.from_username ?? "unknown",
      toUsername: row.to_username ?? "unknown",
      amountWei: row.amount_wei,
      asset: row.asset,
      note: row.note,
      createdAt: row.created_at,
      confirmedAt: row.confirmed_at,
      txHash: row.tx_hash,
      chainName: activeChain.name,
      // A receipt is a statement that a payment completed. Only a confirmed
      // row supports that statement; a pending or failed one is shown with the
      // status it really has and no completed receipt.
      complete: status === "confirmed",
    },
  };
}

/** The filename a downloaded receipt is saved under. */
export function receiptFileName(receiptId: string): string {
  return `cloakpay-receipt-${receiptId}.pdf`;
}
