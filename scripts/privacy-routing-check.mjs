#!/usr/bin/env node
/**
 * Proves the private and public payment paths stay apart, against a real
 * database and a running server.
 *
 * Three things this guards, all of which were live defects:
 *
 *   1. A private link settled as a public transfer. The payer's UI used to
 *      offer "Continue to payment" for a link whose owner asked for privacy,
 *      and the request that followed was an ordinary public transfer. The
 *      server refuses it, but the client offered it first.
 *   2. A refused private link burning a use. The usage counter moved before
 *      the privacy check ran, so a payer who could not pay a one-time link
 *      nevertheless claimed it and spent its single use.
 *   3. A private link settled as a public transfer once private payments became
 *      available. The link's mode was never compared with the requested one, so
 *      the payer could be handed the owner's wallet address and publish the
 *      amount -- for a link whose whole point was that this would not happen.
 *
 * The HTTP section needs a running server and creates two fixture users, which
 * it deletes again on the way out, including on failure.
 *
 * Usage:
 *   APP_URL=http://127.0.0.1:3210 node scripts/privacy-routing-check.mjs
 */
import postgres from "postgres";
import { createHash, randomBytes, webcrypto as crypto } from "node:crypto";
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

const appUrl = env.APP_URL || "http://127.0.0.1:3210";
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
/**
 * `payments` keeps its rows when a user is deleted (`on delete set null`),
 * which is right for a ledger and wrong for a fixture: nothing here may leave
 * a payment behind, so every id and key the server hands back is removed
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
  await sql`insert into wallets (user_id, address, key_envelope)
            values (${payer.id}, ${"0x2222222222222222222222222222222222222222"}, ${envelope}::jsonb)`;
  // The payee needs a real viewing key: a private payment is sealed to one, and
  // the server refuses to open a private payment for an account that has none.
  const viewing = await crypto.subtle.exportKey(
    "jwk",
    (await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]))
      .publicKey,
  );
  await sql`insert into wallets (user_id, address, key_envelope, viewing_public_key, viewing_key_id)
            values (${payee.id}, ${"0x3333333333333333333333333333333333333333"}, ${envelope}::jsonb,
                    ${sql.json(viewing)}, ${randomBytes(12).toString("base64url")})`;

  const link = (await sql`
    insert into payment_links (code, owner_user_id, title, amount_wei, denomination_id, mode, reusable, max_uses)
    values (${`qalink${tag}`}, ${payee.id}, 'Private request', ${"1000000000000000000"}, 'hype-1', 'private', false, 1)
    returning id, code
  `)[0];

  const token = randomBytes(32).toString("base64url");
  await sql`insert into sessions (user_id, token_hash)
            values (${payer.id}, ${createHash("sha256").update(token).digest("hex")})`;

  const call = async (path, body) => {
    const response = await fetch(`${appUrl}${path}`, {
      method: "POST",
      redirect: "manual",
      headers: {
        cookie: `cloakpay_session=${token}`,
        origin,
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
    });
    return { status: response.status, body: await response.json().catch(() => null) };
  };

  // ── 1. a private payment opens, and still never reveals an address ─────────
  let r = await call("/api/payments/intent", {
    toUsername: payee.username,
    denominationId: "hype-1",
    privacy: "private",
  });
  record(
    "a private payment to a username opens without a destination address",
    r.status === 201 &&
      r.body?.data?.privacy === "private" &&
      r.body?.data?.to === null &&
      r.body?.data?.recipientUsername === payee.username,
    `http=${r.status} to=${JSON.stringify(r.body?.data?.to)} recipient=${r.body?.data?.recipientUsername}`,
  );
  record(
    "the opened private payment carries no wallet address anywhere in the response",
    !JSON.stringify(r.body ?? {}).includes("0x3333"),
    JSON.stringify(r.body?.data ?? null),
  );
  remember(r);

  // ── 2. an address cannot be smuggled into the private flow ────────────────
  r = await call("/api/payments/intent", {
    toAddress: EXTERNAL,
    amountWei: "1000000000000000000",
    privacy: "private",
  });
  record(
    "a private payment addressed to a wallet address is a 400, not a transfer",
    r.status === 400 && r.body?.error?.code === "invalid_body",
    `http=${r.status} ${JSON.stringify(r.body?.error)}`,
  );

  // ── 3. a private link cannot be settled as a public transfer ──────────────
  r = await call("/api/payments/intent", {
    linkCode: link.code,
    denominationId: "hype-1",
    privacy: "public",
  });
  record(
    "settling a private link as a public transfer is refused",
    r.status === 409 && r.body?.error?.code === "link_mode_mismatch",
    `http=${r.status} ${JSON.stringify(r.body?.error)}`,
  );

  const after = (
    await sql`select uses, claimed_by_user_id, status from payment_links where id = ${link.id}`
  )[0];
  record(
    "the refused attempt did not spend the one-time link",
    after.uses === 0 && after.claimed_by_user_id === null && after.status === "active",
    JSON.stringify({ uses: after.uses, claimed: after.claimed_by_user_id, status: after.status }),
  );

  // ── 3b. and the same link still settles the way it asked to ───────────────
  r = await call("/api/payments/intent", {
    linkCode: link.code,
    denominationId: "hype-1",
    privacy: "private",
  });
  record(
    "the private link opens when it is asked for privately, with no address",
    r.status === 201 && r.body?.data?.to === null && r.body?.data?.privacy === "private",
    `http=${r.status} to=${JSON.stringify(r.body?.data?.to)} ${JSON.stringify(r.body?.error ?? "")}`,
  );
  remember(r);

  // ── 4. the public path still works, and still reports its destination ─────
  r = await call("/api/payments/intent", {
    toAddress: EXTERNAL,
    amountWei: "1000000000000000000",
    privacy: "public",
  });
  record(
    "an external transfer still opens against a validated address",
    r.status === 201 && r.body?.data?.to?.toLowerCase() === EXTERNAL,
    `http=${r.status} ${JSON.stringify(r.body?.data ?? r.body?.error)}`,
  );
  remember(r);

  // ── 5. the settlement endpoint refuses a private record too ───────────────
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
    noteEnvelope: goodEnvelope,
  });
  record(
    "a private payment cannot be recorded without the transaction that settled it",
    r.status === 400 && r.body?.error?.code === "private_payment_incomplete",
    `http=${r.status} ${JSON.stringify(r.body?.error)}`,
  );

  r = await call("/api/payments", {
    idempotencyKey: `qa-routing-bad-${tag}`,
    toUsername: payee.username,
    denominationId: "hype-1",
    privacy: "private",
    commitment: "not-a-field-element",
    txHash: `0x${"ab".repeat(32)}`,
    noteEnvelope: goodEnvelope,
  });
  record(
    "a commitment that is not a field element is refused",
    r.status === 400 && r.body?.error?.code === "invalid_body",
    `http=${r.status} ${JSON.stringify(r.body?.error)}`,
  );
} finally {
  // Users cascade to wallets, sessions, links and notes, but not to payments.
  for (const entry of createdPayments) {
    if (entry.id) await sql`delete from payments where id = ${entry.id}`;
    if (entry.key) await sql`delete from payments where idempotency_key = ${entry.key}`;
  }
  if (payer) await sql`delete from payments where from_user_id = ${payer.id} or to_user_id = ${payer.id}`;
  if (payee) await sql`delete from payments where from_user_id = ${payee.id} or to_user_id = ${payee.id}`;
  if (payer) await sql`delete from users where id = ${payer.id}`;
  if (payee) await sql`delete from users where id = ${payee.id}`;
  await sql.end();
}

const failed = results.filter((result) => result.ok === false);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
