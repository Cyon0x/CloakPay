import { Fragment, type ReactNode } from "react";
import { Lockup } from "./Brand";
import { Badge, Card } from "./ui";
import { Icon } from "./Icon";
import { formatReceiptAmount, formatStamp } from "@/lib/receipt/format";

/**
 * The CloakPay receipt for one payment.
 *
 * Written as a plain presentational component on purpose: the send flow renders
 * it the moment a payment confirms, and the transaction history renders the
 * very same component when an old receipt is reopened. One component means the
 * two can never disagree about what a receipt says.
 *
 * It shows the two usernames and never a wallet address, and it carries no link
 * to an explorer: the document has to be understood on its own, on screen or on
 * paper.
 */
export interface PaymentReceiptProps {
  /** The payment id, which is also the receipt reference. */
  receiptId: string;
  status: string;
  fromUsername: string;
  toUsername: string;
  amountWei: string | null;
  symbol: string;
  createdAt: string;
  note?: string | null;
  txHash?: string | null;
  chainName: string;
  /** True only for a confirmed payment: nothing else can be downloaded. */
  downloadable?: boolean;
  /** Extra actions, e.g. a way back to the dashboard. */
  children?: ReactNode;
}

const STATUS_LABEL: Record<string, string> = {
  confirmed: "Payment confirmed",
  submitted: "Submitted to the network",
  pending: "Pending",
  failed: "Payment failed",
  expired: "Expired",
};

const STATUS_NOTE: Record<string, string> = {
  confirmed:
    "This receipt is issued because the network confirmed the payment. CloakPay recorded no wallet address for either party.",
  submitted:
    "The transaction has been broadcast and is waiting to be mined. A completed receipt is issued once the network confirms it.",
  pending: "This payment has not settled yet. A completed receipt is issued once the network confirms it.",
  failed: "This payment did not settle. No funds moved, and this is not a completed receipt.",
  expired: "This payment expired before it settled, and this is not a completed receipt.",
};

export function PaymentReceipt({
  receiptId,
  status,
  fromUsername,
  toUsername,
  amountWei,
  symbol,
  createdAt,
  note,
  txHash,
  chainName,
  downloadable = false,
  children,
}: PaymentReceiptProps) {
  const amount = formatReceiptAmount(amountWei, symbol);
  const rows: [string, string, boolean?][] = [
    ["From", `@${fromUsername}`],
    ["To", `@${toUsername}`],
    ["Amount", amount],
    ["Asset", symbol],
    ["Date", formatStamp(createdAt)],
    ["Status", STATUS_LABEL[status] ?? status],
    ["Network", chainName],
  ];
  if (note) rows.push(["Note", note]);
  rows.push(["Receipt reference", receiptId, true]);
  if (txHash) rows.push(["Transaction reference", txHash, true]);

  return (
    <Card className="receipt-card">
      <div style={{ padding: 24 }}>
        <div className="row-between" style={{ alignItems: "flex-start" }}>
          <Lockup markSize={28} />
          <Badge kind={status} />
        </div>

        <p className="receipt-amount mono">{amount}</p>
        <p className="tiny muted" style={{ marginTop: 6 }}>
          {STATUS_LABEL[status] ?? status}
        </p>

        <dl className="kv" style={{ marginTop: 20 }}>
          {rows.map(([label, value, mono]) => (
            <Fragment key={label}>
              <dt>{label}</dt>
              <dd className={mono ? "mono tiny" : undefined} style={mono ? { wordBreak: "break-all" } : undefined}>
                {value}
              </dd>
            </Fragment>
          ))}
        </dl>

        <p className="tiny muted" style={{ marginTop: 18 }}>
          {STATUS_NOTE[status] ?? ""}
        </p>

        <div className="row" style={{ gap: 8, marginTop: 18, flexWrap: "wrap" }}>
          {downloadable ? (
            <a className="btn btn-primary btn-sm" href={`/api/payments/${receiptId}/receipt`}>
              <Icon name="download" size={14} />
              Download receipt
            </a>
          ) : (
            <span className="badge badge-pending">
              <span className="dot" aria-hidden="true" />
              Receipt available once confirmed
            </span>
          )}
          {children}
        </div>
      </div>
    </Card>
  );
}
