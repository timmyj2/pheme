// Builds dist/pheme.mjs: the UI (vite) is embedded into one bundled Node file together with the Copilot SDK.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dist = path.join(root, "dist");
const npm = process.platform === "win32" ? "npm.cmd" : "npm";

execFileSync(npm, ["run", "build:ui"], { cwd: root, stdio: "inherit", shell: process.platform === "win32" });

const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png", ".ico": "image/x-icon", ".json": "application/json", ".woff2": "font/woff2" };
const assets = {};
const uiDist = path.join(root, "packages", "ui", "dist");
const walk = (d) => {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const f = path.join(d, e.name);
    if (e.isDirectory()) walk(f);
    else assets["/" + path.relative(uiDist, f).split(path.sep).join("/")] = { type: TYPES[path.extname(f)] ?? "application/octet-stream", data: fs.readFileSync(f).toString("base64") };
  }
};
walk(uiDist);

fs.rmSync(dist, { recursive: true, force: true });
fs.mkdirSync(dist, { recursive: true });

const result = await build({
  entryPoints: [path.join(root, "packages/server/src/main.ts")],
  outfile: path.join(dist, "pheme.mjs"),
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  plugins: [
    {
      // The SDK imports koffi (native FFI) at the top of its experimental in-process mode, which Pheme
      // never uses (it launches the user's own Copilot CLI). Stub it so the single file has no native dependency.
      name: "stub-koffi",
      setup(b) {
        b.onResolve({ filter: /^koffi$/ }, () => ({ path: "koffi", namespace: "stub-koffi" }));
        b.onLoad({ filter: /.*/, namespace: "stub-koffi" }, () => ({
          contents: 'export default new Proxy({}, { get() { throw new Error("The in-process Copilot runtime is not supported by Pheme."); } });',
          loader: "js",
        }));
      },
    },
  ],
  define: { __PHEME_ASSETS__: JSON.stringify(assets) },
  banner: { js: "#!/usr/bin/env node\nimport { createRequire as __cr } from 'node:module';\nconst require = __cr(import.meta.url);" },
  metafile: true,
  legalComments: "none",
  logLevel: "warning",
});

fs.copyFileSync(path.join(root, "scripts", "start-pheme.cmd"), path.join(dist, "start-pheme.cmd"));

// License summary for bundled packages.
const pkgs = new Map();
for (const input of Object.keys(result.metafile.inputs)) {
  const m = /node_modules\/((?:@[^/]+\/)?[^/]+)\//.exec(input);
  if (m && !pkgs.has(m[1])) {
    try {
      const j = JSON.parse(fs.readFileSync(path.join(root, "node_modules", m[1], "package.json"), "utf8"));
      pkgs.set(m[1], `${m[1]}@${j.version} — ${typeof j.license === "string" ? j.license : j.license?.type ?? "see package"}`);
    } catch { /* ignore */ }
  }
}
fs.writeFileSync(path.join(dist, "THIRD_PARTY_LICENSES.txt"), `Packages bundled into pheme.mjs\n\n${[...pkgs.values()].sort().join("\n")}\n\nSee THIRD_PARTY_NOTICES.md in the repository for the adapted UI code notice.\n`);

const kb = Math.round(fs.statSync(path.join(dist, "pheme.mjs")).size / 1024);
console.log(`Built dist/pheme.mjs (${kb} KB), ${Object.keys(assets).length} UI assets, ${pkgs.size} bundled packages.`);
