// Renders the app icons (PNG) from packages/ui/public/icon.svg using a real browser. Run by hand when the logo changes:
//   PW_CHANNEL=chrome node scripts/make-icons.mjs
// The PNGs are committed, so the normal build needs no browser.
import fs from "node:fs";
import path from "node:path";
import { chromium } from "@playwright/test";

const root = path.resolve(import.meta.dirname, "..");
const out = path.join(root, "packages", "ui", "public");
const svg = fs.readFileSync(path.join(out, "icon.svg"), "utf8");
const inner = svg.replace(/^<svg[^>]*>/, "").replace(/<\/svg>\s*$/, "");
const BLUE = "#0053fd";

// "any": the rounded logo as is. "maskable": full-bleed background with the drawing kept inside the central 80% (phones crop to circles or squircles).
const plain = (size) => `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 64 64">${inner}</svg>`;
const maskable = (size) => `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 64 64"><rect width="64" height="64" fill="${BLUE}"/><g transform="translate(6.4 6.4) scale(0.8)">${inner.replace(/<rect width="64"[^>]*\/>/, "")}</g></svg>`;

const jobs = [["icon-192.png", plain(192), 192], ["icon-512.png", plain(512), 512], ["icon-maskable-512.png", maskable(512), 512]];
const browser = await chromium.launch({ channel: process.env.PW_CHANNEL || undefined });
const page = await browser.newPage();
for (const [name, markup, size] of jobs) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<body style="margin:0;background:transparent">${markup}</body>`);
  await page.screenshot({ path: path.join(out, name), omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } });
  console.log(`wrote ${name} (${fs.statSync(path.join(out, name)).size} bytes)`);
}
await browser.close();
