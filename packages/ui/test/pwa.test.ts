import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ui = path.resolve(import.meta.dirname, "..");
const pub = (f: string) => path.join(ui, "public", f);
const manifest = JSON.parse(fs.readFileSync(pub("manifest.webmanifest"), "utf8")) as { id: string; name: string; short_name: string; start_url: string; scope: string; display: string; background_color: string; theme_color: string; icons: { src: string; sizes: string; type: string; purpose?: string }[] };
const pngSize = (f: string) => { const b = fs.readFileSync(pub(f)); return b.subarray(0, 8).toString("latin1") === "\x89PNG\r\n\x1a\n" ? [b.readUInt32BE(16), b.readUInt32BE(20)] : null; };

describe("installable app files", () => {
  it("has a manifest that makes a standalone app rooted at /", () => {
    expect(manifest).toMatchObject({ name: "Pheme", short_name: "Pheme", start_url: "/", scope: "/", display: "standalone", id: "/" });
    expect(manifest.background_color).toMatch(/^#[0-9a-f]{6}$/i);
    expect(manifest.theme_color).toMatch(/^#[0-9a-f]{6}$/i);
    expect(manifest.start_url).not.toMatch(/token/i); // the access key must never be baked into a file
  });
  it("lists real icons at the sizes it claims, including a maskable one", () => {
    for (const i of manifest.icons.filter((x) => x.type === "image/png")) {
      const [w, h] = i.sizes.split("x").map(Number);
      expect(fs.existsSync(pub(path.basename(i.src))), i.src).toBe(true);
      expect(pngSize(path.basename(i.src)), i.src).toEqual([w, h]);
    }
    const sizes = manifest.icons.filter((i) => i.purpose === "any" && i.type === "image/png").map((i) => i.sizes);
    expect(sizes).toEqual(expect.arrayContaining(["192x192", "512x512"]));
    expect(manifest.icons.some((i) => i.purpose === "maskable" && i.sizes === "512x512")).toBe(true);
    for (const i of manifest.icons) expect(fs.existsSync(pub(path.basename(i.src))), i.src).toBe(true);
  });
  it("the page links the manifest and an icon for phones", () => {
    const html = fs.readFileSync(path.join(ui, "index.html"), "utf8");
    expect(html).toContain('rel="manifest" href="/manifest.webmanifest"');
    expect(html).toContain('rel="apple-touch-icon" href="/icon-192.png"');
  });
  it("deliberately has no service worker: nothing can serve a stale app or keep chats in a cache", () => {
    expect(fs.readdirSync(path.join(ui, "public")).filter((f) => /^(sw|service-?worker)/i.test(f))).toEqual([]);
    const walk = (d: string): string[] => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
    const src = walk(path.join(ui, "src")).filter((f) => /\.(ts|tsx)$/.test(f)).map((f) => fs.readFileSync(f, "utf8")).join("\n");
    expect(src).not.toMatch(/serviceWorker\.register|navigator\.serviceWorker/);
  });
  it("the build serves .webmanifest with the right content type", () => {
    const build = fs.readFileSync(path.resolve(ui, "../../scripts/build.mjs"), "utf8");
    expect(build).toContain('".webmanifest": "application/manifest+json"');
  });
});
