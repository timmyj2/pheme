import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Assets } from "./server.ts";

declare const __PHEME_ASSETS__: Assets | undefined;

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".json": "application/json",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
};

export function readAssetDir(dir: string): Assets {
  const out: Assets = {};
  const walk = (d: string) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const f = path.join(d, e.name);
      if (e.isDirectory()) walk(f);
      else out["/" + path.relative(dir, f).split(path.sep).join("/")] = { type: TYPES[path.extname(f)] ?? "application/octet-stream", data: fs.readFileSync(f).toString("base64") };
    }
  };
  if (fs.existsSync(dir)) walk(dir);
  return out;
}

/** In the single-file build the UI is embedded; in development it is read from packages/ui/dist. */
export function loadAssets(): Assets {
  if (typeof __PHEME_ASSETS__ !== "undefined" && __PHEME_ASSETS__) return __PHEME_ASSETS__;
  const here = path.dirname(fileURLToPath(import.meta.url));
  return readAssetDir(path.resolve(here, "../../ui/dist"));
}
