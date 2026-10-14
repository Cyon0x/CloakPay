#!/usr/bin/env node
/**
 * Creates the CloakPay database inside the existing Neon project, if it does
 * not already exist. Uses DATABASE_ADMIN_URL (a connection to the project's
 * default database) and DATABASE_URL (the target) to derive the name.
 *
 * Nothing here prints credentials.
 */

import { connect, requireEnv, loadEnv } from "./db.mjs";

loadEnv();

const adminUrl = requireEnv("DATABASE_ADMIN_URL");
const targetUrl = requireEnv("DATABASE_URL");

const targetName = new URL(targetUrl).pathname.replace(/^\//, "");
if (!/^[a-z_][a-z0-9_]*$/.test(targetName)) {
  console.error(`Refusing to use unsafe database name: ${targetName}`);
  process.exit(1);
}

const sql = connect(adminUrl);
const existing = await sql`select 1 from pg_database where datname = ${targetName}`;

if (existing.length) {
  console.log(`Database "${targetName}" already exists.`);
} else {
  // Identifier cannot be parameterised; it is validated above.
  await sql.unsafe(`create database "${targetName}"`);
  console.log(`Created database "${targetName}".`);
}

await sql.end();
