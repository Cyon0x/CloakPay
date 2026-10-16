#!/usr/bin/env node
/**
 * Guards the receipt: who can download it, what it says, and what it must not.
 *
 * A receipt is the document a user keeps, forwards and comes back to weeks
 * later, so it is worth checking against the real route rather than trusting
 * the component that draws it:
 *
 *   1. Only the two parties to a payment can download its receipt. A third
 *      account must not be able to tell a payment it cannot see from one that
 *      does not exist, so it gets the same 404.
 *   2. A completed receipt exists only for a payment the network confirmed. A
 *      pending payment must not produce a file that says it settled.
 *   3. The file is a real PDF that names both usernames, and it carries no
 *      wallet address. That last one is checked against the bytes: an address
 *      printed on a receipt is exactly the leak this feature is meant to avoid.
 *
 * Needs a running server and a real database. It creates three fixture users
 * and two payments (one confirmed, one pending) and deletes them again.
 *
 * Usage:
 *   APP_URL=http://127.0.0.1:3200 npm run receipt:check
 */
import postgres from "postgres";
import { createHash, randomBytes } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { PDFDocument } from "pdf-lib";

function loadEnv() {
  const values = { ...process.env };
  if (existsSync(".env.local")) {
    for (const line of readFileSync(".env.local", "utf8").split("\n")) {
      const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (match && !values[match[1]]) values[match[1]] = match[2].replace(/^["']|["']$/g, "");
    }
  }
  return values;
}

const env = loadEnv();
const databaseUrl = env.DATABASE_URL;
if (!databaseUrl) {
  console.error("DATABASE_URL is not set (checked the environment and .env.local).");
  process.exit(2);
}

const appUrl = env.APP_URL || "http://127.0.0.1:3200";
const sql = postgres(databaseUrl, {
  ssl: databaseUrl.includes("sslmode=require") ? "require" : undefined,
  max: 2,
  onnotice: () => {},
});

const results = [];
const record = (name, ok, detail = "") => {
  results.push({ name, ok });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `\n        ${detail}` : ""}`);
};

const tag = randomBytes(3).toString("hex");
const PAYER_ADDRESS = `0x${"22".repeat(20)}`;
const PAYEE_ADDRESS = `0x${"33".repeat(20)}`;

let reachable = false;
try {
  reachable = (await fetch(appUrl, { redirect: "manual" })).status < 500;
} catch {
  reachable = false;
}
if (!reachable) {
  console.log(`\nINFO  no server at ${appUrl}; nothing to check. Start one, or set APP_URL.`);
  await sql.end();
  process.exit(2);
}

const envelope = JSON.stringify({ v: 1, alg: "P256-HKDF-SHA256-AES-256-GCM", epk: "x", iv: "y", ct: "z" });
const users = [];
const payments = [];

try {
  const make = async (label, address) => {
    const row = (
      await sql`
        insert into users (onboarding_step, display_name, username)
        values ('complete', ${label}, ${`qarc${tag}${users.length}`}) returning id, username
      `
    )[0];
    if (address) {
      await sql`insert into wallets (user_id, address, key_envelope)
                values (${row.id}, ${address}, ${envelope}::jsonb)`;
    }
    row.token = randomBytes(32).toString("base64url");
    await sql`insert into sessions (user_id, token_hash)
              values (${row.id}, ${createHash("sha256").update(row.token).digest("hex")})`;
    users.push(row);
    return row;
  };

  const payer = await make("Receipt Check Payer", PAYER_ADDRESS);
  const payee = await make("Receipt Check Payee", PAYEE_ADDRESS);
  const stranger = await make("Receipt Check Stranger", null);

  const insert = async (status, confirmedAt) => {
    const row = (
      await sql`
        insert into payments (
          chain_id, privacy, status, from_user_id, to_user_id, amount_wei, asset,
          note, tx_hash, idempotency_key, confirmed_at
        ) values (
          99801, 'public', ${status}, ${payer.id}, ${payee.id}, '1500000000000000000', 'HYPE',
          'Receipt check', ${`0x${"ef".repeat(32)}`}, ${`qa-receipt-${tag}-${status}`},
          ${confirmedAt ? sql`now()` : null}
        )
        returning id
      `
    )[0];
    payments.push(row);
    return row;
  };

  const confirmed = await insert("confirmed", true);
  const pending = await insert("pending", false);

  const get = (path, cookie) =>
    fetch(`${appUrl}${path}`, {
      redirect: "manual",
      headers: cookie ? { cookie: `cloakpay_session=${cookie}` } : {},
    });

  // ── who may download ──────────────────────────────────────────────────────
  let response = await get(`/api/payments/${confirmed.id}/receipt`);
  record("a signed-out request for a receipt is refused", response.status === 401, `http=${response.status}`);

  response = await get(`/api/payments/${confirmed.id}/receipt`, stranger.token);
  record(
    "a third account cannot download somebody else's receipt",
    response.status === 404,
    `http=${response.status}`,
  );

  response = await get(`/api/payments/${confirmed.id}/receipt`, payee.token);
  const payeeBytes = Buffer.from(await response.arrayBuffer());
  record("the recipient can download the receipt", response.status === 200, `http=${response.status}`);

  // ── a receipt exists only for a confirmed payment ─────────────────────────
  response = await get(`/api/payments/${pending.id}/receipt`, payer.token);
  const pendingBody = await response.text();
  record(
    "a payment that has not confirmed has no completed receipt",
    response.status === 409 && !pendingBody.startsWith("%PDF"),
    `http=${response.status}`,
  );

  response = await get(`/transactions/${pending.id}`, payer.token);
  const pendingHtml = await response.text();
  record(
    "the pending payment still shows its real status, without a download",
    response.status === 200 &&
      /Pending/i.test(pendingHtml) &&
      !pendingHtml.includes(`/api/payments/${pending.id}/receipt`),
    `http=${response.status}`,
  );

  // ── the file itself ───────────────────────────────────────────────────────
  response = await get(`/api/payments/${confirmed.id}/receipt`, payer.token);
  const bytes = Buffer.from(await response.arrayBuffer());
  const disposition = response.headers.get("content-disposition") ?? "";
  record(
    "the download is a PDF named after the receipt reference",
    response.status === 200 &&
      response.headers.get("content-type") === "application/pdf" &&
      disposition.includes(`cloakpay-receipt-${confirmed.id}.pdf`),
    `content-type=${response.headers.get("content-type")} disposition=${disposition}`,
  );
  record(
    "the file begins and ends like a PDF",
    bytes.subarray(0, 5).toString("latin1") === "%PDF-" &&
      bytes.toString("latin1").trimEnd().endsWith("%%EOF"),
    `${bytes.length} bytes, from ${bytes.subarray(0, 8).toString("latin1")}`,
  );
  record(
    "downloading twice returns the same document",
    payeeBytes.length > 0 && Buffer.compare(payeeBytes, bytes) === 0,
    payeeBytes.length === bytes.length
      ? `${bytes.length} bytes each time`
      : `${payeeBytes.length} bytes, then ${bytes.length}`,
  );

  const parsed = await PDFDocument.load(bytes);
  record(
    "the PDF parses, and carries the receipt reference and both usernames",
    parsed.getTitle()?.includes(confirmed.id) === true &&
      parsed.getSubject()?.includes(`@${payer.username}`) === true &&
      parsed.getSubject()?.includes(`@${payee.username}`) === true &&
      parsed.getPageCount() >= 1,
    `title=${parsed.getTitle()} subject=${parsed.getSubject()}`,
  );
  record(
    "no wallet address appears in the file",
    !/[0-9a-fA-F]{40}/.test(bytes.toString("latin1")),
    "no run of 40 hex characters in the file",
  );

  // ── the receipt page inside the app ───────────────────────────────────────
  response = await get(`/transactions/${confirmed.id}`, payer.token);
  const html = await response.text();
  record(
    "the receipt page shows both usernames and a download control",
    response.status === 200 &&
      html.includes(`@${payer.username}`) &&
      html.includes(`@${payee.username}`) &&
      html.includes(`/api/payments/${confirmed.id}/receipt`),
    `http=${response.status}`,
  );
  record(
    "and it prints no wallet address",
    !html.includes(PAYER_ADDRESS.slice(2)) && !html.includes(PAYEE_ADDRESS.slice(2)),
    "neither party's address is in the page",
  );

  response = await get(`/transactions/${confirmed.id}`, stranger.token);
  record(
    "a third account cannot open somebody else's receipt page",
    response.status === 404,
    `http=${response.status}`,
  );
} finally {
  for (const payment of payments) {
    await sql`delete from payments where id = ${payment.id}`;
  }
  for (const user of users) {
    await sql`delete from payments where from_user_id = ${user.id} or to_user_id = ${user.id}`;
    await sql`delete from users where id = ${user.id}`;
  }
  await sql.end();
}

const failed = results.filter((result) => result.ok === false);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
