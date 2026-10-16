import { readFile } from "node:fs/promises";
import path from "node:path";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { formatWei } from "@/lib/format";
import type { ReceiptData } from "./data";
import { formatStamp } from "./format";

/**
 * Renders a receipt as a PDF.
 *
 * Drawn rather than screenshotted, so the file is small, selectable, and
 * identical everywhere: the same ink on the same paper, whatever the user's
 * browser does with a print dialog. The layout is a single column with a rule
 * between the amount and the detail, which is what reads well printed on A5
 * and on a phone screen.
 *
 * The palette is CloakPay's: ink `#14171b` for text, slate for labels, and the
 * brand lockup at the top. No wallet address is printed, and neither is a link
 * to an explorer — the document has to stand on its own.
 */

const INK = rgb(0.078, 0.09, 0.106); // #14171b
const SLATE = rgb(0.42, 0.45, 0.49);
const LINE = rgb(0.87, 0.88, 0.89);
const OK = rgb(0.09, 0.45, 0.31);
const WARN = rgb(0.55, 0.36, 0.03);
const FAIL = rgb(0.6, 0.16, 0.16);

const PAGE = { width: 595.28, height: 841.89 }; // A4, in points
const MARGIN = 56;

const STATUS_TEXT: Record<ReceiptData["status"], string> = {
  confirmed: "Confirmed",
  submitted: "Submitted",
  pending: "Pending",
  failed: "Failed",
  expired: "Expired",
};

const STATUS_COLOR: Record<ReceiptData["status"], ReturnType<typeof rgb>> = {
  confirmed: OK,
  submitted: WARN,
  pending: WARN,
  failed: FAIL,
  expired: FAIL,
};

/** Wraps on spaces to a measured width, so nothing runs off the page. */
function wrap(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(/\s+/)) {
    const candidate = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth || !line) line = candidate;
    else {
      lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  return lines;
}

async function drawLockup(pdf: PDFDocument, page: PDFPage, y: number): Promise<number> {
  const file = path.join(process.cwd(), "public", "brand", "lockup.png");
  try {
    const png = await pdf.embedPng(await readFile(file));
    // The lockup is wide, so it is scaled to a fixed height and reads as a
    // masthead rather than as a watermark.
    const height = 26;
    const width = (png.width / png.height) * height;
    page.drawImage(png, { x: MARGIN, y: y - height, width, height });
    return y - height;
  } catch {
    // A receipt that cannot be generated is worse than a receipt without its
    // logo, so this falls back to the wordmark in type rather than failing.
    const font = await pdf.embedFont(StandardFonts.HelveticaBold);
    page.drawText("CloakPay", { x: MARGIN, y: y - 18, size: 18, font, color: INK });
    return y - 20;
  }
}

export async function renderReceiptPdf(receipt: ReceiptData): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`CloakPay receipt ${receipt.receiptId}`);
  pdf.setAuthor("CloakPay");
  pdf.setSubject(`Payment from @${receipt.fromUsername} to @${receipt.toUsername}`);
  pdf.setProducer("CloakPay");
  // Both dates are pinned to the moment the payment happened rather than to
  // "now". pdf-lib stamps a modification date of the current time otherwise,
  // which would make two downloads of one receipt differ by a few bytes; a
  // receipt is a record of a fixed moment, and re-downloading it should produce
  // the same file it produced the first time.
  const issuedAt = receipt.confirmedAt ?? receipt.createdAt;
  pdf.setCreationDate(issuedAt);
  pdf.setModificationDate(issuedAt);

  const page = pdf.addPage([PAGE.width, PAGE.height]);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const mono = await pdf.embedFont(StandardFonts.Courier);

  const width = PAGE.width - MARGIN * 2;
  let y = PAGE.height - MARGIN;

  y = (await drawLockup(pdf, page, y)) - 4;

  page.drawText("Payment receipt", { x: MARGIN, y: y - 16, size: 15, font: bold, color: INK });
  y -= 30;

  // Status, in words and in colour: the first thing a reader looks for.
  page.drawText(STATUS_TEXT[receipt.status], {
    x: MARGIN,
    y: y - 10,
    size: 11,
    font: bold,
    color: STATUS_COLOR[receipt.status],
  });
  y -= 26;

  page.drawLine({
    start: { x: MARGIN, y },
    end: { x: MARGIN + width, y },
    thickness: 1,
    color: LINE,
  });
  y -= 34;

  // The amount, at the size it deserves.
  const amount = receipt.amountWei ? `${formatWei(BigInt(receipt.amountWei))} ${receipt.asset}` : "—";
  page.drawText(amount, { x: MARGIN, y: y - 20, size: 24, font: bold, color: INK });
  y -= 56;

  const rows: [string, string][] = [
    ["Status", STATUS_TEXT[receipt.status]],
    ["From", `@${receipt.fromUsername}`],
    ["To", `@${receipt.toUsername}`],
    ["Amount", amount],
    ["Asset", receipt.asset],
    ["Date", formatStamp(receipt.createdAt)],
  ];
  if (receipt.confirmedAt) rows.push(["Confirmed", formatStamp(receipt.confirmedAt)]);
  if (receipt.note) rows.push(["Note", receipt.note]);
  rows.push(["Receipt reference", receipt.receiptId]);
  if (receipt.txHash) rows.push(["Transaction reference", receipt.txHash]);
  rows.push(["Network", receipt.chainName]);

  for (const [label, value] of rows) {
    page.drawText(label.toUpperCase(), { x: MARGIN, y: y - 9, size: 8, font: bold, color: SLATE });
    y -= 16;

    const isReference = label.includes("reference") || label === "Network";
    const font = isReference ? mono : regular;
    const size = isReference ? 8.5 : 11;
    const lines = wrap(value, font, size, width);
    for (const line of lines) {
      page.drawText(line, { x: MARGIN, y: y - size, size, font, color: INK });
      y -= size + 4;
    }
    y -= 14;
  }

  y -= 6;
  page.drawLine({
    start: { x: MARGIN, y },
    end: { x: MARGIN + width, y },
    thickness: 0.75,
    color: LINE,
  });
  y -= 22;

  const footer =
    "CloakPay identifies people by username. This receipt deliberately records no wallet address for either party. " +
    `It is issued for ${receipt.chainName}, a test network: the amounts shown have no monetary value.`;
  for (const line of wrap(footer, regular, 9, width)) {
    page.drawText(line, { x: MARGIN, y: y - 9, size: 9, font: regular, color: SLATE });
    y -= 13;
  }

  return pdf.save();
}
