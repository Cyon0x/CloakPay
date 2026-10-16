#!/usr/bin/env node
/**
 * Guards the payment routing: one live path, two paused ones.
 *
 * CloakPay pays a registered user by username. Two paths sit beside it and are
 * switched off in `src/config/features.ts`:
 *
 *   * external transfers — a public transfer to a wallet address that is not a
 *     CloakPay account;
 *   * the shielded pool — deposits, private transfers and withdrawals.
 *
 * Three things this script exists to catch, all of which have been real defects
 * or are one edit away from becoming one:
 *
 *   1. A paused path reachable anyway. The form no longer offers one, so the
 *      only way to know is to ask the API the way a stale tab would. Every
 *      paused entry point is probed here and must refuse, and a refusal must
 *      leave nothing behind: no payment row, no burned link use.
 *   2. A private link settled as an ordinary transfer. The link's mode is the
 *      promise its owner made; the payer must not be handed a settlement that
 *      breaks it, and the refusal must cost the one-time link nothing.
 *   3. A username payment that is not really the payment that was asked for.
 *      The recipient must be the account the username names, the amount and
 *      asset the ones that were requested, and the row that is written must
 *      agree with all of it.
 *
 * Needs a running server and a real database. It creates three fixture users
 * (a payer, a payee and a stranger) and deletes them again, including on
 * failure, along with every payment row it caused.
 *
 * Usage:
 *   APP_URL=http://127.0.0.1:3200 npm run privacy:check
 */
import postgres from "postgres";
import { createHash, randomBytes } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";

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
const origin = new URL(appUrl).origin;
const sql = postgres(databaseUrl, {
  ssl: databaseUrl.includes("sslmode=require") ? "require" : undefined,
  max: 2,
  onnotice: () => {},
});

const results = [];
const record = (name, ok, detail = "") => {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `\n        ${detail}` : ""}`);
};

const tag = randomBytes(3).toString("hex");
/** A valid, non-zero, checksum-free external address. */
const EXTERNAL = "0x1111111111111111111111111111111111111111";
const PAYER_ADDRESS = "0x2222222222222222222222222222222222222222";
const PAYEE_ADDRESS = "0x3333333333333333333333333333333333333333";
const AMOUNT = "2500000000000000000"; // 2.5 HYPE

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
let payer;
let payee;
let stranger;
let privateLink;
let recordLink;
/**
 * `payments` keeps its rows when a user is deleted (`on delete set null`), which
 * is right for a ledger and wrong for a fixture: nothing here may leave a
 * payment behind, so every id and key the server hands back is removed
 * explicitly.
 */
const createdPayments = [];
const remember = (response) => {
  const data = response.body?.data;
  if (!data) return;
  if (data.paymentId) createdPayments.push({ id: data.paymentId });
  if (data.idempotencyKey) createdPayments.push({ key: data.idempotencyKey });
};

try {
  payer = (await sql`
    insert into users (onboarding_step, display_name, username)
    values ('complete', 'Routing Check Payer', ${`qapay${tag}`}) returning id, username
  `)[0];
  payee = (await sql`
    insert into users (onboarding_step, display_name, username)
    values ('complete', 'Routing Check Payee', ${`qaray${tag}`}) returning id, username
  `)[0];
  stranger = (await sql`
    insert into users (onboarding_step, display_name, username)
    values ('complete', 'Routing Check Stranger', ${`qastr${tag}`}) returning id, username
  `)[0];
  await sql`insert into wallets (user_id, address, key_envelope)
            values (${payer.id}, ${PAYER_ADDRESS}, ${envelope}::jsonb)`;
  await sql`insert into wallets (user_id, address, key_envelope)
            values (${payee.id}, ${PAYEE_ADDRESS}, ${envelope}::jsonb)`;

  // A private link of the kind that existed before the pool was paused. The row
  // is written directly because the API now refuses to create one, and the
  // point of the fixture is to prove that an old link cannot be settled either.
  privateLink = (await sql`
    insert into payment_links (code, owner_user_id, title, amount_wei, denomination_id, mode, reusable, max_uses)
    values (${`qapriv${tag}`}, ${payee.id}, 'Private request', ${"1000000000000000000"}, 'hype-1', 'private', false, 1)
    returning id, code
  `)[0];
  recordLink = (await sql`
    insert into payment_links (code, owner_user_id, title, mode, reusable, max_uses)
    values (${`qarec${tag}`}, ${payee.id}, 'Ordinary request', 'record', true, null)
    returning id, code
  `)[0];

  const token = randomBytes(32).toString("base64url");
  await sql`insert into sessions (user_id, token_hash)
            values (${payer.id}, ${createHash("sha256").update(token).digest("hex")})`;
  const strangerToken = randomBytes(32).toString("base64url");
  await sql`insert into sessions (user_id, token_hash)
            values (${stranger.id}, ${createHash("sha256").update(strangerToken).digest("hex")})`;

  const call = async (path, body, method = "POST", cookie = token) => {
    const response = await fetch(`${appUrl}${path}`, {
      method,
      redirect: "manual",
      headers: {
        cookie: `cloakpay_session=${cookie}`,
        origin,
        "content-type": "application/json",
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: response.status, body: await response.json().catch(() => null) };
  };

    // ── 1. the shielded pool is paused, and says so ────────────────────────────
  let r = await call("/api/payments/intent", {
    toUsername: payee.username,
    denominationId: "hype-1",
    privacy: "private",
  });
  record(
    "a private payment is refused while the pool is paused",
    r.status === 409 && r.body?.error?.code === "shielded_pool_paused",
    `http=${r.status} ${JSON.stringify(r.body?.error?.code)}`,
  );

  // ── 2. an external transfer is paused, and says so ─────────────────────────
  r = await call("/api/payments/intent", {
    toAddress: EXTERNAL,
    amountWei: AMOUNT,
    privacy: "public",
  });
  record(
    "an external transfer is refused while it is paused",
    r.status === 409 && r.body?.error?.code === "external_transfer_paused",
    `http=${r.status} ${JSON.stringify(r.body?.error?.code)}`,
  );

  // ── 3. a private link cannot be created now ────────────────────────────────
  r = await call("/api/links", { mode: "private", amount: "1" });
  record(
    "a private payment link cannot be created while the pool is paused",
    r.status === 409 && r.body?.error?.code === "shielded_pool_paused",
    `http=${r.status} ${JSON.stringify(r.body?.error?.code)}`,
  );

  // ── 4. an old private link cannot be settled privately either ──────────────
  r = await call("/api/payments/intent", {
    linkCode: privateLink.code,
    denominationId: "hype-1",
    privacy: "private",
  });
  record(
    "an old private link cannot be settled privately while the pool is paused",
    r.status === 409 && r.body?.error?.code === "shielded_pool_paused",
    `http=${r.status} ${JSON.stringify(r.body?.error?.code)}`,
  );

  // ── 5. and it cannot be settled as an ordinary transfer instead ────────────
  //
  // The refusal here is the paused pool rather than a link-mode mismatch, and
  // that precedence is deliberate: the link asks for a private payment, private
  // payments are off, and saying so is more use to the payer than describing a
  // mismatch. Either way the link is not settled as something it did not ask
  // for, which is the property being protected.
  r = await call("/api/payments/intent", {
    linkCode: privateLink.code,
    amountWei: "1000000000000000000",
    privacy: "public",
  });
  record(
    "settling a private link as an ordinary transfer is refused",
    r.status === 409 && r.body?.error?.code === "privacy_unavailable",
    `http=${r.status} ${JSON.stringify(r.body?.error?.code)}`,
  );

  const after = (
    await sql`select uses, claimed_by_user_id, status from payment_links where id = ${privateLink.id}`
  )[0];
  record(
    "the refusals did not spend the one-time link",
    after.uses === 0 && after.claimed_by_user_id === null && after.status === "active",
    JSON.stringify({ uses: after.uses, claimed: after.claimed_by_user_id, status: after.status }),
  );

  // ── 6. nothing above wrote a payment row ───────────────────────────────────
  const refusedRows = await sql`
    select count(*)::int from payments where from_user_id = ${payer.id}
  `;
  record(
    "a refused settlement leaves no payment row behind",
    refusedRows[0].count === 0,
    `${refusedRows[0].count} row(s) written by the payer`,
  );

  // ── 7. the one live path: pay a username ──────────────────────────────────
  r = await call("/api/payments/intent", {
    toUsername: payee.username.toUpperCase(),
    amountWei: AMOUNT,
    privacy: "public",
    note: "routing check",
  });
  const intent = r.body?.data;
  record(
    "a username payment opens, and the lookup is case-insensitive",
    r.status === 201 && intent?.recipientUsername === payee.username,
    `http=${r.status} recipient=${intent?.recipientUsername}`,
  );
  record(
    "the opened payment names the request that was made",
    intent?.amountWei === AMOUNT && intent?.asset === "HYPE" && intent?.privacy === "public",
    JSON.stringify({ amountWei: intent?.amountWei, asset: intent?.asset, privacy: intent?.privacy }),
  );
  // The destination address comes back because the browser has to sign against
  // it. It is internal: no page renders it, and no receipt contains it.
  record(
    "the destination handed to the signer is the payee's own address",
    typeof intent?.to === "string" && intent.to.toLowerCase() === PAYEE_ADDRESS,
    `to=${intent?.to}`,
  );
  record(
    "the payer's own address is never part of the response",
    !JSON.stringify(r.body ?? {}).includes(PAYER_ADDRESS.toLowerCase()),
    "the payer's own address is absent from the response",
  );
  remember(r);

  const written = await sql`select from_user_id, to_user_id, amount_wei, asset, status from payments where id = ${intent.paymentId}`;
  record(
    "the row records the sender, the recipient, the amount and the asset",
    written[0]?.from_user_id === payer.id &&
      written[0]?.to_user_id === payee.id &&
      written[0]?.amount_wei === AMOUNT &&
      written[0]?.asset === "HYPE" &&
      written[0]?.status === "pending",
    JSON.stringify(written[0]),
  );

  // ── 8. the ways a username payment can be wrong ───────────────────────────
  r = await call("/api/payments/intent", {
    toUsername: `nosuch${tag}`,
    amountWei: AMOUNT,
    privacy: "public",
  });
  record(
    "a username that does not exist is a 404, not a payment",
    r.status === 404 && r.body?.error?.code === "recipient_not_found",
    `http=${r.status} ${JSON.stringify(r.body?.error?.code)}`,
  );

  r = await call("/api/payments/intent", {
    toUsername: payer.username,
    amountWei: AMOUNT,
    privacy: "public",
  });
  record(
    "paying yourself is refused",
    r.status === 400 && r.body?.error?.code === "self_payment",
    `http=${r.status} ${JSON.stringify(r.body?.error?.code)}`,
  );

  r = await call("/api/payments/intent", { toUsername: payee.username, amountWei: "0", privacy: "public" });
  record(
    "an amount of zero is refused",
    r.status === 400 && r.body?.error?.code === "invalid_amount",
    `http=${r.status} ${JSON.stringify(r.body?.error?.code)}`,
  );

  r = await call("/api/payments/intent", { toUsername: payee.username, privacy: "public" });
  record(
    "a payment with no amount is refused",
    r.status === 400 && r.body?.error?.code === "missing_amount",
    `http=${r.status} ${JSON.stringify(r.body?.error?.code)}`,
  );

  r = await call("/api/payments/intent", { toAddress: EXTERNAL, amountWei: AMOUNT, privacy: "private" });
  record(
    "an address cannot be smuggled in through the paused private path",
    r.status === 409 && r.body?.error?.code === "shielded_pool_paused",
    `http=${r.status} ${JSON.stringify(r.body?.error?.code)}`,
  );

  // ── 9. the settlement endpoint refuses a private record too ───────────────
  const goodEnvelope = {
    v: 1,
    alg: "P256-HKDF-SHA256-AES-256-GCM",
    epk: "a".repeat(64),
    iv: "b".repeat(16),
    ct: "c".repeat(64),
  };
  r = await call("/api/payments", {
    idempotencyKey: `qa-routing-${tag}`,
    toUsername: payee.username,
    denominationId: "hype-1",
    privacy: "private",
    commitment: `0x${"11".repeat(32)}`,
    txHash: `0x${"ab".repeat(32)}`,
    noteEnvelope: goodEnvelope,
  });
  record(
    "a private payment cannot be recorded through the API while the pool is paused",
    r.status === 409 && r.body?.error?.code === "shielded_pool_paused",
    `http=${r.status} ${JSON.stringify(r.body?.error?.code)}`,
  );

  // ── 10. an ordinary link still works, and settles to its owner ────────────
  r = await call("/api/payments/intent", {
    linkCode: recordLink.code,
    amountWei: "1000000000000000000",
    privacy: "public",
  });
  record(
    "an ordinary link still settles as a transfer to its owner",
    r.status === 201 &&
      r.body?.data?.recipientUsername === payee.username &&
      r.body?.data?.to?.toLowerCase() === PAYEE_ADDRESS,
    `http=${r.status} ${JSON.stringify(r.body?.data ?? r.body?.error)}`,
  );
  remember(r);

  // ── 11. a payment is only visible to its two parties ─────────────────────
  r = await call(`/api/payments/${intent.paymentId}`, { status: "confirmed", txHash: `0x${"cd".repeat(32)}` }, "PATCH");
  record(
    "the sender can confirm their own payment",
    r.status === 200,
    `http=${r.status} ${JSON.stringify(r.body?.error ?? "")}`,
  );

  r = await call(
    `/api/payments/${intent.paymentId}`,
    { status: "failed", failureReason: "not yours" },
    "PATCH",
    strangerToken,
  );
  record(
    "a third account cannot change somebody else's payment",
    r.status === 403 && r.body?.error?.code === "forbidden",
    `http=${r.status} ${JSON.stringify(r.body?.error?.code)}`,
  );

  const untouched = await sql`
    select status from payments where id = ${intent.paymentId}
  `;
  record(
    "and the payment it tried to change is untouched",
    untouched[0]?.status === "confirmed",
    `status=${untouched[0]?.status}`,
  );
} finally {
  for (const entry of createdPayments) {
    if (entry.id) await sql`delete from payments where id = ${entry.id}`;
    if (entry.key) await sql`delete from payments where idempotency_key = ${entry.key}`;
  }
  // Users cascade to wallets, sessions, links and notes, but not to payments.
  for (const user of [payer, payee, stranger]) {
    if (!user) continue;
    await sql`delete from payments where from_user_id = ${user.id} or to_user_id = ${user.id}`;
    await sql`delete from users where id = ${user.id}`;
  }
  await sql.end();
}

const failed = results.filter((result) => result.ok === false);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
