#!/usr/bin/env node
/**
 * Opens the navigation drawer in a real browser and measures it.
 *
 * This guards a defect that is invisible in the source: `.topbar` carries a
 * `backdrop-filter`, which makes it the containing block for `position: fixed`
 * descendants. The drawer and its scrim were children of the header, so they
 * were sized to the 60px header instead of the viewport -- the menu compiled,
 * rendered, and reported `aria-expanded="true"` while showing a thin sliver.
 * The header's `z-index` also trapped the overlay, so the mobile tab bar would
 * paint over it.
 *
 * Nothing in a type-check, a build or a unit test can see that. Geometry in a
 * browser can.
 *
 * Needs a running server and a real database; it creates one fixture account
 * and deletes it, along with the session and any payment rows it touches.
 * Skips itself when no server is reachable or no Chrome is installed.
 *
 * Usage:
 *   APP_URL=http://localhost:3200 node scripts/nav-drawer-check.mjs
 */
import { spawn } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import postgres from "postgres";
import WebSocket from "ws";

const EXPECTED = [
  "Home",
  "Send",
  "Receive",
  "Activities",
  "All transactions",
  "Payment links",
  "Privacy",
  "Faucet",
  "Profile",
  "Settings",
  "Swap",
  "Install app",
  "Log out",
];

const VIEWPORTS = [
  ["desktop", 1280, 900],
  ["tablet", 834, 1112],
  ["mobile", 390, 844],
];

const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
].filter(Boolean);

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

const results = [];
const record = (name, ok, detail = "") => {
  results.push({ name, ok });
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}${detail ? `\n          ${detail}` : ""}`);
};

const env = loadEnv();
const appUrl = env.APP_URL || "http://localhost:3200";
const chromePath = CHROME_CANDIDATES.find((candidate) => existsSync(candidate));

if (!chromePath) {
  console.log("INFO  no Chrome found; skipped. Set CHROME_PATH to run this check.");
  process.exit(0);
}
if (!env.DATABASE_URL) {
  console.log("INFO  DATABASE_URL is not set; skipped.");
  process.exit(0);
}

let reachable = false;
try {
  reachable = (await fetch(appUrl, { redirect: "manual" })).status < 500;
} catch {
  reachable = false;
}
if (!reachable) {
  console.log(`INFO  no server at ${appUrl}; skipped. Start one, or set APP_URL.`);
  process.exit(0);
}

const host = new URL(appUrl).hostname;
const port = 9335;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const sql = postgres(env.DATABASE_URL, {
  ssl: env.DATABASE_URL.includes("sslmode=require") ? "require" : undefined,
  max: 2,
  onnotice: () => {},
});

const tag = randomBytes(3).toString("hex");
const envelope = JSON.stringify({ v: 1, alg: "P256-HKDF-SHA256-AES-256-GCM", epk: "x", iv: "y", ct: "z" });
let user;
let sessionId;
let chrome;

try {
  user = (await sql`
    insert into users (onboarding_step, display_name, username)
    values ('complete', 'Nav Check', ${`qanav${tag}`}) returning id
  `)[0];
  await sql`insert into wallets (user_id, address, key_envelope)
            values (${user.id}, ${"0x4444444444444444444444444444444444444444"}, ${envelope}::jsonb)`;
  const token = randomBytes(32).toString("base64url");
  sessionId = (
    await sql`insert into sessions (user_id, token_hash)
              values (${user.id}, ${createHash("sha256").update(token).digest("hex")}) returning id`
  )[0].id;

  chrome = spawn(chromePath, [
    "--headless=new",
    `--remote-debugging-port=${port}`,
    "--no-first-run",
    "--no-default-browser-check",
    "--user-data-dir=/tmp/cloak-nav-drawer-profile",
    "--window-size=1280,900",
    "about:blank",
  ], { stdio: "ignore" });

  let page;
  for (let attempt = 0; attempt < 40 && !page; attempt++) {
    try {
      const targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
      page = targets.find((target) => target.type === "page" && target.webSocketDebuggerUrl);
    } catch {}
    if (!page) await sleep(500);
  }
  if (!page) throw new Error("Chrome never exposed a page target.");

  const socket = new WebSocket(page.webSocketDebuggerUrl, { perMessageDeflate: false });
  await new Promise((resolve, reject) => {
    socket.on("open", resolve);
    socket.on("error", reject);
  });

  let messageId = 0;
  const pending = new Map();
  socket.on("message", (raw) => {
    const message = JSON.parse(raw.toString());
    if (message.id && pending.has(message.id)) {
      pending.get(message.id)(message);
      pending.delete(message.id);
    }
  });
  const send = (method, params = {}) =>
    new Promise((resolve) => {
      const id = ++messageId;
      pending.set(id, resolve);
      socket.send(JSON.stringify({ id, method, params }));
    });

  await send("Page.enable");
  await send("Runtime.enable");
  await send("Network.enable");
  await send("Network.setCookie", {
    name: "cloakpay_session",
    value: token,
    domain: host,
    path: "/",
  });

  const probe = `(async () => {
    const frame = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    const btn = document.querySelector('.menu-toggle');
    const box = (el) => { const b = el.getBoundingClientRect(); return { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height) }; };
    if (!btn) return { missingButton: true };
    const btnStyle = getComputedStyle(btn);
    const btnBox = btn.getBoundingClientRect();
    const buttonVisible = btnStyle.display !== 'none' && btnStyle.visibility !== 'hidden' && btnBox.width > 0 && btnBox.height > 0;

    btn.click();
    await frame();
    const drawer = document.querySelector('.drawer');
    const scrim = document.querySelector('.drawer-scrim');
    if (!drawer || !scrim) return { buttonVisible, notOpened: true };

    const drawerBox = box(drawer);
    const scrimBox = box(scrim);
    const nav = document.querySelector('.mobile-nav');
    const navShown = nav && getComputedStyle(nav).display !== 'none';
    const painted = document.elementFromPoint(innerWidth - 180, innerHeight - 24);
    const focusInside = Boolean(document.activeElement && document.activeElement.closest('.drawer'));

    const out = {
      buttonVisible,
      opened: true,
      drawerBox,
      scrimBox,
      fillsHeight: Math.abs(drawerBox.h - innerHeight) < 2,
      scrimCoversPage: Math.abs(scrimBox.h - innerHeight) < 2 && Math.abs(scrimBox.w - innerWidth) < 2,
      bottomNavShown: Boolean(navShown),
      drawerPaintsOverBottomNav: Boolean(painted && painted.closest('.drawer')),
      labels: [...document.querySelectorAll('.drawer-item')].map((el) => (el.querySelector('.grow') ?? el).textContent.trim()),
      focusInside,
      ariaExpanded: btn.getAttribute('aria-expanded'),
    };

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await frame();
    out.escapeCloses = !document.querySelector('.drawer');
    out.focusReturnsToButton = document.activeElement === btn;
    out.scrollRestored = document.body.style.overflow === '';

    btn.click();
    await frame();
    document.querySelector('.drawer-scrim')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await frame();
    out.scrimClickCloses = !document.querySelector('.drawer');
    return out;
  })()`;

  for (const [label, width, height] of VIEWPORTS) {
    console.log(`\n${label} ${width}x${height}`);
    await send("Emulation.setDeviceMetricsOverride", {
      width, height, deviceScaleFactor: 1, mobile: width < 700,
    });
    await send("Page.navigate", { url: `${appUrl}/dashboard` });
    await sleep(2200);
    const response = await send("Runtime.evaluate", {
      awaitPromise: true, returnByValue: true, expression: probe,
    });
    const out = response.result?.result?.value ?? {};

    record("the menu control is visible", out.buttonVisible === true, JSON.stringify(out));
    record("clicking it opens the drawer", out.opened === true);
    if (!out.opened) continue;
    record("the drawer fills the viewport height", out.fillsHeight === true, `drawer ${out.drawerBox?.h}px of ${height}px`);
    record("the scrim covers the whole page", out.scrimCoversPage === true, `${out.scrimBox?.w}x${out.scrimBox?.h}`);
    record(
      "the drawer is painted over the bottom bar",
      out.drawerPaintsOverBottomNav === true,
      out.bottomNavShown ? "bottom bar is showing" : "no bottom bar at this width",
    );
    record(
      "it carries the menu in order",
      JSON.stringify(out.labels) === JSON.stringify(EXPECTED),
      JSON.stringify(out.labels),
    );
    record("focus moves into the drawer", out.focusInside === true);
    record("Escape closes it and returns focus", out.escapeCloses === true && out.focusReturnsToButton === true);
    record("closing restores page scrolling", out.scrollRestored === true);
    record("clicking the scrim closes it", out.scrimClickCloses === true);
  }

  // The brand link and the landing-page guard read the same session the drawer
  // does, so they are checked once, in the same signed-in browser. These are the
  // two ways a signed-in user was being sent back to the marketing page: the
  // logo's own href, and the page it pointed at.
  console.log("\nsigned-in routing");
  await send("Emulation.setDeviceMetricsOverride", {
    width: 1280, height: 900, deviceScaleFactor: 1, mobile: false,
  });

  const evaluate = async (expression) => {
    const response = await send("Runtime.evaluate", { awaitPromise: true, returnByValue: true, expression });
    return response.result?.result?.value ?? {};
  };
  const visit = async (path, settle = 1800) => {
    await send("Page.navigate", { url: `${appUrl}${path}` });
    await sleep(settle);
  };

  await visit("/send");
  const brand = await evaluate(
    `({ path: location.pathname, href: document.querySelector('.brand-link')?.getAttribute('href') })`,
  );
  record(
    "a signed-in header points the brand at the app home",
    brand.href === "/dashboard",
    `href=${brand.href} while on ${brand.path}`,
  );

  const afterClick = await evaluate(`(async () => {
    document.querySelector('.brand-link')?.click();
    await new Promise((r) => setTimeout(r, 1500));
    return { path: location.pathname };
  })()`);
  record(
    "clicking the brand from another page lands on the dashboard",
    afterClick.path === "/dashboard",
    `ended on ${afterClick.path}`,
  );

  await visit("/");
  const guarded = await evaluate(`({ path: location.pathname })`);
  record(
    "the landing page sends a signed-in visitor into the app",
    guarded.path === "/dashboard",
    `ended on ${guarded.path}`,
  );

  // Public pages are the ones that should stay readable to a signed-in user, so
  // the guard above must not have been written broadly enough to swallow them.
  const publicPages = await evaluate(`(async () => {
    const out = {};
    for (const path of ['/how-it-works', '/security', '/faq', '/terms']) {
      const response = await fetch(path);
      out[path] = [response.status, response.redirected, new URL(response.url).pathname].join(' ');
    }
    return out;
  })()`);
  record(
    "the public pages stay reachable while signed in",
    Object.entries(publicPages).every(([path, said]) => said === `200 false ${path}`),
    JSON.stringify(publicPages),
  );

  console.log("\nsigned-out routing");
  // Log out the way the drawer does -- a same-origin POST to the sign-out route
  // -- rather than by throwing the cookie away, so revocation itself is
  // exercised. An app page is then re-requested: if sign-out had only cleared
  // the cookie and left the session row alive, it would still render.
  const signedOut = await evaluate(`(async () => {
    const response = await fetch('/api/auth/signout', { method: 'POST' });
    const guarded = await fetch('/send');
    return {
      signout: response.status,
      appPage: [guarded.status, new URL(guarded.url).pathname].join(' '),
    };
  })()`);
  record(
    "logging out revokes the session, not only the cookie",
    signedOut.signout === 200 && signedOut.appPage === "200 /signin",
    JSON.stringify(signedOut),
  );

  await visit("/");
  const anonymous = await evaluate(
    `({ path: location.pathname, href: document.querySelector('.brand-link')?.getAttribute('href') })`,
  );
  record("a signed-out visitor keeps the landing page", anonymous.path === "/", `landed on ${anonymous.path}`);
  record("and its brand points back at the landing page", anonymous.href === "/", `href=${anonymous.href}`);

  socket.close();
} catch (error) {
  record("the check ran", false, error.message);
} finally {
  chrome?.kill();
  if (sessionId) await sql`delete from sessions where id = ${sessionId}`;
  if (user) {
    await sql`delete from payments where from_user_id = ${user.id} or to_user_id = ${user.id}`;
    await sql`delete from users where id = ${user.id}`;
  }
  await sql.end();
}

const failed = results.filter((result) => result.ok === false);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
