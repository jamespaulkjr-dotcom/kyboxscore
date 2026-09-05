#!/usr/bin/env node
/**
 * How many people used the site, from our own access log.
 *
 * There is no tracker on the page and there never needs to be: Caddy already
 * sees every request. This reads its JSON log and reports, per day, how many
 * distinct visitors and how many page views, plus what they were reading.
 *
 *   node scripts/traffic.mjs                 # last 7 days
 *   node scripts/traffic.mjs --days 1        # today
 *   node scripts/traffic.mjs --pages 20
 *
 * "Visitors" means distinct client addresses in a day. That undercounts a
 * household sharing a connection and overcounts a phone that changes towers,
 * so treat it as a good indicator and not a headcount. It is the honest number
 * available without following anybody around.
 */
import { readdirSync, createReadStream, existsSync } from "node:fs";
import { createInterface } from "node:readline";
import { join } from "node:path";
import { createHash } from "node:crypto";

const LOG_DIR = process.env.CADDY_LOG_DIR ?? "/home/deploy/kyboxscore/logs/caddy";

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? Number(args[i + 1]) : fallback;
};
const days = flag("days", 7);
const topPages = flag("pages", 10);

if (!existsSync(LOG_DIR)) {
  console.error(`No log directory at ${LOG_DIR}. Is access logging on?`);
  process.exit(1);
}

// Requests that are not a person reading a page.
const isAsset = (uri) =>
  uri.startsWith("/_next/") ||
  uri.startsWith("/brand/") ||
  uri.startsWith("/api/") ||
  /\.(js|css|png|jpg|jpeg|svg|ico|webp|woff2?|txt|xml|map)$/i.test(uri);

const isBot = (ua = "") =>
  /bot|crawler|spider|slurp|curl|wget|headless|monitor|uptime|probe|scanner/i.test(ua);

const cutoff = new Date(Date.now() - days * 86_400_000);
const byDay = new Map();

/** Visitors are counted by a hash, so this report never prints an address. */
const visitorKey = (ip, ua) =>
  createHash("sha256").update(`${ip}|${ua}`).digest("hex").slice(0, 16);

const files = readdirSync(LOG_DIR).filter((f) => f.startsWith("access"));
if (files.length === 0) {
  console.error(`No access logs in ${LOG_DIR} yet.`);
  process.exit(1);
}

for (const file of files) {
  const rl = createInterface({
    input: createReadStream(join(LOG_DIR, file)),
    crlfDelay: Infinity,
  });
  for await (const line of rl) {
    if (!line.startsWith("{")) continue;
    let e;
    try {
      e = JSON.parse(line);
    } catch {
      continue;
    }
    if (!e.ts || !e.request) continue;
    const when = new Date(e.ts * 1000);
    if (when < cutoff) continue;

    const uri = e.request.uri ?? "";
    const ua = e.request.headers?.["User-Agent"]?.[0] ?? "";
    if (isAsset(uri) || isBot(ua)) continue;
    if ((e.status ?? 0) >= 400) continue;

    const day = when.toISOString().slice(0, 10);
    if (!byDay.has(day)) {
      byDay.set(day, { visitors: new Set(), views: 0, pages: new Map() });
    }
    const d = byDay.get(day);
    // Behind a proxy the real address arrives in a header; without one,
    // remote_ip is already the visitor.
    const ip =
      e.request.headers?.["Cf-Connecting-Ip"]?.[0] ??
      e.request.headers?.["X-Forwarded-For"]?.[0]?.split(",")[0]?.trim() ??
      e.request.client_ip ??
      e.request.remote_ip ??
      "";
    d.visitors.add(visitorKey(ip, ua));
    d.views += 1;
    const path = uri.split("?")[0];
    d.pages.set(path, (d.pages.get(path) ?? 0) + 1);
  }
}

if (byDay.size === 0) {
  console.log("No page views recorded in that window.");
  process.exit(0);
}

const rows = [...byDay.entries()].sort(([a], [b]) => (a < b ? 1 : -1));
console.log("\n  date         visitors   page views");
let totalViews = 0;
const everyone = new Set();
for (const [day, d] of rows) {
  console.log(
    `  ${day}   ${String(d.visitors.size).padStart(8)}   ${String(d.views).padStart(10)}`
  );
  totalViews += d.views;
  for (const v of d.visitors) everyone.add(v);
}
console.log(
  `\n  ${days} days: ${everyone.size} distinct visitors, ${totalViews} page views`
);

const pages = new Map();
for (const [, d] of rows) {
  for (const [p, n] of d.pages) pages.set(p, (pages.get(p) ?? 0) + n);
}
console.log(`\n  most read:`);
for (const [p, n] of [...pages].sort((a, b) => b[1] - a[1]).slice(0, topPages)) {
  console.log(`  ${String(n).padStart(6)}  ${p}`);
}
console.log();
