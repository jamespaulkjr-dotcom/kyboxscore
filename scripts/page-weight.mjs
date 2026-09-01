#!/usr/bin/env node
/**
 * What a page actually costs a reader.
 *
 * Written because measuring this by hand got it wrong once: summing every
 * <script> on the page counted Next's polyfill bundle, which carries
 * `nomodule` and is therefore never fetched by a browser that supports ES
 * modules - i.e. by any browser anyone reading a scoreboard in 2026 is using.
 * That put the scores page 22 KB "over" a budget it was comfortably under.
 *
 * Usage:
 *   node scripts/page-weight.mjs https://kyboxscore.com/football/scores
 *   node scripts/page-weight.mjs http://127.0.0.1:3000/football/scores [.next/static]
 *
 * With a local static directory it reads chunk sizes off disk; otherwise it
 * fetches them. Sizes are gzipped, because that is what goes over the wire.
 */
import { gzipSync } from "node:zlib";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const BUDGET_KB = 150; // CLAUDE.md, scores page

const url = process.argv[2];
const staticDir = process.argv[3] ?? "apps/web/.next/static";
if (!url) {
  console.error("usage: node scripts/page-weight.mjs <url> [staticDir]");
  process.exit(1);
}

const res = await fetch(url, { headers: { "accept-encoding": "identity" } });
const html = await res.text();
if (!res.ok) {
  console.error(`${url} returned ${res.status}`);
  process.exit(1);
}

const kb = (n) => `${(n / 1024).toFixed(1)} KB`;

async function sizeOf(src) {
  const local = join(staticDir, src.replace(/^\/_next\/static\//, ""));
  if (existsSync(local)) return gzipSync(readFileSync(local)).length;
  const abs = new URL(src, url);
  const r = await fetch(abs, { headers: { "accept-encoding": "identity" } });
  return gzipSync(Buffer.from(await r.arrayBuffer())).length;
}

let modern = 0;
let legacyOnly = 0;
const rows = [];
for (const tag of html.match(/<script[^>]*>/g) ?? []) {
  const src = tag.match(/src="([^"]+\.js)"/)?.[1];
  if (!src) continue;
  // HTML attribute names are case-insensitive, so React's noModule="" is the
  // nomodule attribute, and a module-supporting browser never fetches it.
  const skipped = /nomodule/i.test(tag);
  const bytes = await sizeOf(src);
  if (skipped) legacyOnly += bytes;
  else modern += bytes;
  rows.push({ src, bytes, skipped });
}

console.log(`\n${url}`);
console.log(`  document  ${kb(Buffer.byteLength(html))} raw, ${kb(gzipSync(html).length)} gzipped`);
console.log("\n  scripts:");
for (const r of rows.sort((a, b) => b.bytes - a.bytes)) {
  console.log(
    `   ${kb(r.bytes).padStart(9)}  ${r.skipped ? "nomodule, not fetched" : "fetched             "}  ${r.src}`
  );
}
console.log(
  `\n  JavaScript a modern browser fetches: ${kb(modern)}  (budget ${BUDGET_KB} KB) ` +
    `${modern / 1024 <= BUDGET_KB ? "OK" : "OVER"}`
);
if (legacyOnly) {
  console.log(`  Legacy-only polyfills, never fetched by modern browsers: ${kb(legacyOnly)}`);
}
