// Smoke test for the single-file build: copy dist/pheme.mjs to an empty folder (no node_modules), run it in fake mode,
// and talk to it over HTTP like the browser would.
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "pheme-smoke-"));
fs.copyFileSync(path.join(root, "dist", "pheme.mjs"), path.join(tmp, "pheme.mjs"));

const child = spawn(process.execPath, [path.join(tmp, "pheme.mjs"), "--fake", "--no-open", "--port", "0", "--data-dir", path.join(tmp, "data")], { stdio: ["ignore", "pipe", "pipe"] });
let out = "";
child.stdout.on("data", (d) => (out += d));
child.stderr.on("data", (d) => (out += d));

const fail = (msg) => {
  console.error(`SMOKE FAILED: ${msg}\n${out}`);
  child.kill();
  process.exit(1);
};

try {
  let url;
  for (let i = 0; i < 100 && !url; i++) {
    await new Promise((r) => setTimeout(r, 100));
    url = /Open: (\S+)/.exec(out)?.[1];
  }
  if (!url) fail("server did not start");
  const u = new URL(url);
  const base = u.origin;
  const token = u.searchParams.get("token");
  const html = await (await fetch(base + "/")).text();
  if (!html.includes("<title>Pheme</title>")) fail("UI html missing");
  const asset = /src="(\/assets\/[^"]+\.js)"/.exec(html)?.[1];
  if (!asset || !(await fetch(base + asset)).ok) fail("UI script missing");
  const h = { "x-pheme-token": token, "content-type": "application/json" };
  if ((await fetch(base + "/api/state")).status !== 401) fail("API must require the token");
  const chat = await (await fetch(base + "/api/chats", { method: "POST", headers: h, body: "{}" })).json();
  await fetch(`${base}/api/chats/${chat.id}/messages`, { method: "POST", headers: h, body: JSON.stringify({ text: "steps 10 smoke" }) });
  let events = [];
  for (let i = 0; i < 100; i++) {
    await new Promise((r) => setTimeout(r, 100));
    events = (await (await fetch(`${base}/api/chats/${chat.id}`, { headers: h })).json()).events;
    if (events.some((e) => e.type === "notice")) break;
  }
  if (!events.some((e) => e.type === "notice" && e.kind === "skill")) fail("skill review notice never appeared");
  const skills = await (await fetch(base + "/api/skills", { headers: h })).json();
  if (skills.length !== 1) fail("expected one learned skill");
  console.log("Smoke test passed: bundle served the UI, ran a fake chat and learned a skill.");
} finally {
  child.kill();
  fs.rmSync(tmp, { recursive: true, force: true });
}
