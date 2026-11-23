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

// Licenses for everything that ships: server packages bundled by esbuild plus the UI's runtime dependency tree
// (react, react-dom, the markdown stack and their dependencies), each with its full license text.
const found = new Map(); // name -> { dir, json }
function locate(name, from) {
  for (const base of [path.join(from, "node_modules"), path.join(root, "packages", "ui", "node_modules"), path.join(root, "node_modules")]) {
    const dir = path.join(base, name);
    try { return { dir, json: JSON.parse(fs.readFileSync(path.join(dir, "package.json"), "utf8")) }; } catch { /* try the next place */ }
  }
  return null;
}
function collect(name, from) {
  if (found.has(name)) return;
  const hit = locate(name, from);
  if (!hit) return;
  found.set(name, hit);
  for (const dep of Object.keys(hit.json.dependencies ?? {})) collect(dep, hit.dir);
}
for (const input of Object.keys(result.metafile.inputs)) {
  const m = /node_modules\/((?:@[^/]+\/)?[^/]+)\//.exec(input);
  if (m) collect(m[1], root);
}
const uiPkg = JSON.parse(fs.readFileSync(path.join(root, "packages", "ui", "package.json"), "utf8"));
for (const name of ["react", "react-dom", ...Object.keys(uiPkg.dependencies ?? {})]) collect(name, path.join(root, "packages", "ui"));
const licenseOf = (j) => (typeof j.license === "string" ? j.license : j.license?.type ?? (j.licenses ?? []).map((l) => l.type).join(" OR ")) || "see package";
const licenseText = (dir) => {
  const f = fs.readdirSync(dir).find((n) => /^(licen[sc]e|copying)(\.(md|txt))?$/i.test(n));
  return f ? fs.readFileSync(path.join(dir, f), "utf8").trim() : "(no license file in the package; see its package.json)";
};
const sorted = [...found.entries()].sort(([x], [y]) => x.localeCompare(y));
const summary = sorted.map(([n, { json }]) => `${n}@${json.version} — ${licenseOf(json)}`).join("\n");
const texts = sorted.map(([n, { dir, json }]) => `${"=".repeat(72)}\n${n}@${json.version} (${licenseOf(json)})\n${"=".repeat(72)}\n${licenseText(dir)}\n`).join("\n");
fs.writeFileSync(
  path.join(dist, "THIRD_PARTY_LICENSES.txt"),
  `Third-party packages bundled with or required by Pheme (${sorted.length})\n\n${summary}\n\nSee THIRD_PARTY_NOTICES.md in the repository for the adapted UI code notice.\n\n${texts}`,
);

const kb = Math.round(fs.statSync(path.join(dist, "pheme.mjs")).size / 1024);
console.log(`Built dist/pheme.mjs (${kb} KB), ${Object.keys(assets).length} UI assets, ${sorted.length} licensed packages.`);
