// Shared helpers for CLI scripts (no runtime dependency on a dotenv package).
import { readFileSync } from "node:fs";
import postgres from "postgres";

/** Loads .env.local into process.env without overwriting existing values. */
export function loadEnv(file = ".env.local") {
  let raw;
  try {
    raw = readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
  } catch {
    return;
  }
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

export function connect(url, { max = 1, timeout = 20 } = {}) {
  if (!url) throw new Error("Missing database URL");
  return postgres(url, {
    max,
    idle_timeout: timeout,
    connect_timeout: timeout,
    ssl: url.includes("sslmode=require") ? "require" : undefined,
    onnotice: () => {},
  });
}

export function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    console.error(`Missing required environment variable: ${name}`);
    process.exit(1);
  }
  return value;
}
