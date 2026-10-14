#!/usr/bin/env node
/**
 * Minimal, explicit migration runner.
 *
 * - Reads db/migrations/*.sql in lexical order.
 * - Records applied migrations in schema_migrations with a SHA-256 checksum.
 * - Refuses to run a migration whose checksum changed after being applied.
 * - Applies each file inside a single transaction.
 *
 * Usage:
 *   node scripts/migrate.mjs            apply pending migrations
 *   node scripts/migrate.mjs --status   show what is applied / pending
 */
import { readdir, readFile } from "node:fs/promises";
import { createHash } from "node:crypto";

import { connect, requireEnv, loadEnv } from "./db.mjs";

loadEnv();

const dir = new URL("../db/migrations/", import.meta.url);
const statusOnly = process.argv.includes("--status");

const files = (await readdir(dir))
  .filter((f) => f.endsWith(".sql"))
  .sort();

const sql = connect(requireEnv("DATABASE_URL"));

await sql`
  create table if not exists schema_migrations (
    name        text primary key,
    checksum    text not null,
    applied_at  timestamptz not null default now()
  )
`;

const applied = await sql`select name, checksum, applied_at from schema_migrations order by name`;
const appliedMap = new Map(applied.map((r) => [r.name, r]));

let pending = 0;
let changed = 0;

for (const file of files) {
  const body = await readFile(new URL(file, dir), "utf8");
  const checksum = createHash("sha256").update(body).digest("hex");
  const prior = appliedMap.get(file);

  if (prior) {
    if (prior.checksum !== checksum) {
      console.error(`! ${file} changed after it was applied (${prior.applied_at.toISOString()})`);
      changed++;
    } else if (statusOnly) {
      console.log(`  applied  ${file}`);
    }
    continue;
  }

  if (statusOnly) {
    console.log(`  PENDING  ${file}`);
    pending++;
    continue;
  }

  process.stdout.write(`  applying ${file} ... `);
  try {
    await sql.begin(async (tx) => {
      await tx.unsafe(body);
      await tx`insert into schema_migrations (name, checksum) values (${file}, ${checksum})`;
    });
    console.log("ok");
    pending++;
  } catch (error) {
    console.log("FAILED");
    throw error;
  }
}

if (statusOnly) {
  console.log(`\n${applied.length} applied, ${pending} pending`);
} else if (changed) {
  console.log("\nMigrations applied, but modified history detected. Review before deploying.");
} else {
  console.log(`\nDone. ${pending} migration(s) applied.`);
}

await sql.end();
if (changed) process.exit(2);
