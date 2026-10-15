#!/usr/bin/env node
/**
 * Exercises username registration against a real database.
 *
 * The bug this guards against was invisible from the outside: a write to the
 * generated `username_lower` column made Postgres reject every registration,
 * and a bare catch reported that rejection as "That username is taken". So this
 * checks the behaviour rather than the code — a name is claimed, a duplicate is
 * refused, and the two failures that are the caller's to see stay distinct from
 * the ones that are ours.
 *
 * Section 1 and 2 run inside a rolled-back transaction and change nothing.
 * The HTTP section needs a running server and creates one fixture user, which
 * it deletes again on the way out, including on failure.
 *
 * Usage:
 *   node scripts/username-flow-check.mjs                  # db only
 *   APP_URL=http://127.0.0.1:3200 node scripts/username-flow-check.mjs
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
const fresh = `qaflow${tag}`;

/** Runs `fn` inside a savepoint so one failure does not abort the rest. */
async function probe(tx, label, fn) {
  await tx.unsafe("savepoint probe");
  try {
    const value = await fn();
    await tx.unsafe("release savepoint probe");
    return { ok: true, value };
  } catch (error) {
    await tx.unsafe("rollback to savepoint probe");
    return { ok: false, code: error.code, message: error.message };
  }
}

// `assertSameOrigin` compares against the host the server knows itself by, so
// the probe has to use that host too — 127.0.0.1 and localhost are not the same
// origin, and treating them as one would weaken the check.
const origin = new URL(appUrl).origin;

console.log(`Checking username registration (tag ${tag})\n`);

// ── 1. the invariants the fix leans on ──────────────────────────────────────
const column = (
  await sql`select is_generated, generation_expression from information_schema.columns
            where table_name = 'users' and column_name = 'username_lower'`
)[0];
record(
  "username_lower is a generated column",
  column?.is_generated === "ALWAYS" && /lower\(username\)/i.test(column.generation_expression ?? ""),
  `generated=${column?.is_generated} expr=${column?.generation_expression}`,
);

const index = (await sql`select indexdef from pg_indexes where indexname = 'users_username_lower_key'`)[0];
record(
  "case-insensitive uniqueness is enforced by a unique index",
  /unique/i.test(index?.indexdef ?? "") && /username_lower/i.test(index?.indexdef ?? ""),
  index?.indexdef ?? "index missing",
);

// ── 2. the write path, against a disposable row ─────────────────────────────
await sql
  .begin(async (tx) => {
    const id = (await tx`insert into users (onboarding_step) values ('username') returning id`)[0].id;

    const generated = await probe(tx, "generated", () =>
      tx`update users set username = ${`bad${tag}`}, username_lower = ${`bad${tag}`} where id = ${id}`,
    );
    record(
      "naming username_lower in an update is still refused (the original bug)",
      !generated.ok && generated.code === "428C9",
      generated.ok ? "the database accepted a write to the generated column" : `${generated.code} ${generated.message}`,
    );

    // The statement the onboarding route runs, verbatim.
    const claimed = await probe(tx, "claim", async () => {
      await tx`update users set username = ${fresh} where id = ${id}`;
      return (await tx`select username, username_lower from users where id = ${id}`)[0];
    });
    record(
      "the route's statement claims a free username",
      claimed.ok && claimed.value.username === fresh && claimed.value.username_lower === fresh,
      claimed.ok ? JSON.stringify(claimed.value) : `${claimed.code} ${claimed.message}`,
    );

    const mixed = await probe(tx, "mixed", async () => {
      await tx`update users set username = ${`QaMixed${tag}`} where id = ${id}`;
      return (await tx`select username, username_lower from users where id = ${id}`)[0];
    });
    record(
      "mixed case is rejected unless the app normalises first",
      !mixed.ok && mixed.code === "23514",
      mixed.ok ? "the check constraint allowed a mixed-case username" : `${mixed.code}`,
    );

    const taken = (await tx`select username from users where username is not null and id <> ${id} limit 1`)[0];
    if (taken) {
      for (const [label, candidate] of [
        ["exact", taken.username],
        ["upper case", taken.username.toUpperCase()],
        ["capitalised", taken.username[0].toUpperCase() + taken.username.slice(1)],
      ]) {
        const clash = await probe(tx, "clash", () =>
          tx`update users set username = ${candidate.toLowerCase()} where id = ${id}`,
        );
        record(`a ${label} duplicate of an existing name is refused`, !clash.ok && clash.code === "23505", clash.code ?? "accepted");
      }
    } else {
      record("a duplicate of an existing name is refused", null, "no other username in the database to clash with");
    }

    throw new Error("ROLLBACK");
  })
  .catch((error) => {
    if (error.message !== "ROLLBACK") record("database section ran", false, error.message);
  });

// ── 3. two writers, one name ────────────────────────────────────────────────
// Real concurrency needs two real connections: a savepoint pair on one
// connection is two statements taking turns, not a race. Both rows here are
// committed and then removed.
const second = postgres(databaseUrl, {
  ssl: databaseUrl.includes("sslmode=require") ? "require" : undefined,
  max: 1,
  onnotice: () => {},
});
try {
  const contenders = await sql`
    insert into users (onboarding_step) values ('username'), ('username')
    returning id
  `;
  const [a, b] = contenders.map((row) => row.id);
  const race = `qarace${tag}`;
  const attempt = (connection, id) =>
    connection
      .begin(async (tx) => {
        await tx`update users set username = ${race} where id = ${id}`;
        // Hold the index entry so the other writer has to wait for the outcome.
        await new Promise((resolve) => setTimeout(resolve, 150));
      })
      .then(() => "claimed")
      .catch((error) => `refused ${error.code}`);

  const outcomes = await Promise.all([attempt(sql, a), attempt(second, b)]);
  record(
    "two simultaneous claims cannot both succeed",
    outcomes.filter((o) => o === "claimed").length === 1 && outcomes.some((o) => o.includes("23505")),
    outcomes.join(" / "),
  );
  record(
    "exactly one account holds the contested name",
    (await sql`select count(*)::int as n from users where username = ${race}`)[0].n === 1,
  );
  await sql`delete from users where id in (${a}, ${b})`;
} catch (error) {
  record("two simultaneous claims cannot both succeed", false, error.message);
} finally {
  await second.end();
}

// ── 4. the flow over HTTP, if a server is up ────────────────────────────────
let reachable = false;
try {
  reachable = (await fetch(appUrl, { redirect: "manual" })).status < 500;
} catch {
  reachable = false;
}

if (!reachable) {
  console.log(`\nINFO  no server at ${appUrl}; skipped the HTTP checks (set APP_URL, or run npm run dev)`);
} else {
  const token = randomBytes(32).toString("base64url");
  const session = `cloakpay_session=${token}`;
  const user = (await sql`insert into users (onboarding_step, display_name) values ('username', 'Flow Check') returning id`)[0];
  await sql`insert into sessions (user_id, token_hash)
            values (${user.id}, ${createHash("sha256").update(token).digest("hex")})`;

  const call = async (path, init = {}) => {
    const response = await fetch(`${appUrl}${path}`, {
      ...init,
      redirect: "manual",
      headers: { cookie: session, origin, "content-type": "application/json", ...(init.headers ?? {}) },
    });
    return { status: response.status, body: await response.json().catch(() => null) };
  };

  try {
    const httpFresh = `qahttp${tag}`;

    let r = await call(`/api/username/check?u=${httpFresh}`);
    record("HTTP  a new username reads as available", r.body?.data?.available === true, JSON.stringify(r.body));

    r = await call("/api/onboarding", {
      method: "POST",
      body: JSON.stringify({ step: "wallet", username: httpFresh, displayName: "Flow Check" }),
    });
    const saved = (await sql`select username, username_lower, display_name, onboarding_step from users where id = ${user.id}`)[0];
    record(
      "HTTP  registration succeeds and saves to the signed-in user",
      r.status === 200 && r.body?.ok === true && saved.username === httpFresh && saved.display_name === "Flow Check",
      `http=${r.status} db=${JSON.stringify(saved)}`,
    );
    record("HTTP  the generated column filled itself", saved.username_lower === httpFresh, `username_lower=${saved.username_lower}`);

    r = await call(`/api/username/check?u=${httpFresh}`);
    record("HTTP  your own username no longer reads as taken", r.body?.data?.available === true, JSON.stringify(r.body?.data));

    r = await call("/api/onboarding", { method: "POST", body: JSON.stringify({ step: "wallet", username: "not valid!" }) });
    record(
      "HTTP  an invalid username is a 400, never a 409 conflict",
      r.status === 400 && r.body?.error?.code === "invalid_username",
      `http=${r.status} ${JSON.stringify(r.body?.error)}`,
    );

    const other = (await sql`select username from users where username is not null and id <> ${user.id} limit 1`)[0];
    if (other) {
      r = await call("/api/onboarding", { method: "POST", body: JSON.stringify({ step: "wallet", username: other.username }) });
      record(
        "HTTP  a name another account owns is a 409 conflict",
        r.status === 409 && r.body?.error?.code === "username_taken",
        `http=${r.status} ${JSON.stringify(r.body?.error)}`,
      );
      record(
        "HTTP  the conflict did not disturb the account",
        (await sql`select username from users where id = ${user.id}`)[0].username === httpFresh,
      );
    }
  } finally {
    await sql`delete from users where id = ${user.id}`;
  }
}

await sql.end();

const failed = results.filter((r) => r.ok === false);
const skipped = results.filter((r) => r.ok === null);
console.log(
  `\n${results.length - failed.length - skipped.length}/${results.length - skipped.length} checks passed` +
    (skipped.length ? `, ${skipped.length} skipped` : ""),
);
process.exit(failed.length ? 1 : 0);
