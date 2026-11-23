// Stress test: runs dist/pheme.mjs in fake mode and hammers it over HTTP. Prints PASS/FAIL per probe.
import { spawn } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "pheme-stress-"));
const dataDir = path.join(tmp, "data");
fs.copyFileSync(path.join(root, "dist", "pheme.mjs"), path.join(tmp, "pheme.mjs"));

let child, base, token, out = "";
const results = [];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function start() {
  out = "";
  child = spawn(process.execPath, [path.join(tmp, "pheme.mjs"), "--fake", "--no-open", "--port", "0", "--data-dir", dataDir], { stdio: ["ignore", "pipe", "pipe"] });
  child.stdout.on("data", (d) => (out += d));
  child.stderr.on("data", (d) => (out += d));
  let url;
  for (let i = 0; i < 100 && !url; i++) { await sleep(100); url = /Open: (\S+)/.exec(out)?.[1]; if (child.exitCode !== null) break; }
  if (!url) throw new Error("server did not start:\n" + out);
  const u = new URL(url);
  base = u.origin; token = u.searchParams.get("token");
}
async function stop() { child.kill(); await new Promise((r) => child.once("exit", r)); }
const H = () => ({ "x-pheme-token": token, "content-type": "application/json" });
const api = async (p, method = "GET", body, raw) => {
  const r = await fetch(base + "/api" + p, { method, headers: H(), body: raw ?? (body === undefined ? undefined : JSON.stringify(body)) });
  const text = await r.text();
  let json; try { json = JSON.parse(text); } catch { json = undefined; }
  return { status: r.status, json, text };
};
async function probe(name, fn) {
  const t = Date.now();
  try {
    const r = await fn();
    const ok = r === undefined || r === true;
    results.push({ name, ok, note: ok ? "" : String(r), ms: Date.now() - t });
  } catch (e) { results.push({ name, ok: false, note: e.stack?.split("\n").slice(0, 3).join(" | ") ?? String(e), ms: Date.now() - t }); }
  const r = results.at(-1);
  console.log(`${r.ok ? "PASS" : "FAIL"}  ${name} (${r.ms}ms)${r.note ? "\n      " + r.note : ""}`);
}
const waitIdle = async (id, ms = 30000) => {
  const t = Date.now();
  while (Date.now() - t < ms) { const c = await api(`/chats/${id}`); if (c.json && !c.json.busy) return c.json; await sleep(50); }
  throw new Error("chat never went idle " + id);
};
const newChat = async () => (await api("/chats", "POST", {})).json;
const sessionsDir = () => path.join(dataDir, "sessions");

await start();

await probe("A. 40 concurrent chats all finish with ordered events", async () => {
  const chats = await Promise.all(Array.from({ length: 40 }, newChat));
  await Promise.all(chats.map((c, i) => api(`/chats/${c.id}/messages`, "POST", { text: `hello ${i}` })));
  const done = await Promise.all(chats.map((c) => waitIdle(c.id)));
  for (const d of done) {
    const types = d.events.map((e) => e.type).join(",");
    if (types !== "user,turn_start,message,usage,idle") return `bad event order: ${types}`;
    const seqs = d.events.map((e) => e.seq);
    if (seqs.some((s, i) => i && s <= seqs[i - 1])) return "seq not increasing";
  }
});

await probe("B. 60 SSE clients on one chat all see the whole turn", async () => {
  const c = await newChat();
  const clients = Array.from({ length: 60 }, () => new Promise((resolve) => {
    http.get(`${base}/api/chats/${c.id}/events?token=${token}`, (res) => {
      let buf = ""; res.on("data", (d) => { buf += d; if (buf.includes('"type":"idle"')) { res.destroy(); resolve(buf); } });
    });
  }));
  await sleep(200);
  await api(`/chats/${c.id}/messages`, "POST", { text: "stream this to everyone please" });
  const bufs = await Promise.race([Promise.all(clients), sleep(15000).then(() => null)]);
  if (!bufs) return "some SSE clients never saw idle";
  if (bufs.some((b) => !b.includes('"type":"message"'))) return "client missed the message";
});

await probe("C1. malformed JSON body -> 400 (not 500)", async () => {
  const r = await api("/chats", "POST", undefined, "{not json");
  return r.status === 400 || `status ${r.status}: ${r.text}`;
});
await probe("C2. 2 MB body -> 413 and server survives", async () => {
  const c = await newChat();
  let r; try { r = await api(`/chats/${c.id}/messages`, "POST", undefined, JSON.stringify({ text: "x".repeat(2_000_000) })); } catch { r = { status: "connection reset" }; }
  const alive = await api("/state");
  if (alive.status !== 200) return "server died";
  return r.status === 413 || r.status === "connection reset" || `status ${r.status}`;
});
await probe("C3. weird chat ids -> 4xx, never 500", async () => {
  for (const id of ["..", "a.b", "%2e%2e%2fsecret", "x%00y", "a b", "%F0%9F%98%80", "A".repeat(500)]) {
    const r = await api(`/chats/${id}`);
    if (r.status >= 500) return `id ${JSON.stringify(id)} -> ${r.status}`;
  }
});
await probe("C4. unicode / emoji / null bytes / 400 KB message round-trip", async () => {
  const c = await newChat();
  const text = "héllo 🙂 \u0000 日本語 " + "ab".repeat(200_000);
  const r = await api(`/chats/${c.id}/messages`, "POST", { text });
  if (r.status !== 202) return `send -> ${r.status}`;
  const d = await waitIdle(c.id);
  const u = d.events.find((e) => e.type === "user");
  return u.text === text || "text altered";
});
await probe("C5. empty / whitespace / non-string messages -> 400", async () => {
  const c = await newChat();
  for (const body of [{ text: "" }, { text: "   " }, { text: 5 }, {}, { text: null }]) {
    const r = await api(`/chats/${c.id}/messages`, "POST", body);
    if (r.status !== 400) return `${JSON.stringify(body)} -> ${r.status}`;
  }
});
await probe("D. deleting a busy chat leaves no orphan files", async () => {
  const c = await newChat();
  await api(`/chats/${c.id}/messages`, "POST", { text: "run something that waits for approval" });
  await sleep(300);
  await api(`/chats/${c.id}`, "DELETE");
  await sleep(800);
  const left = fs.readdirSync(sessionsDir()).filter((f) => f.startsWith(c.id));
  return left.length === 0 || `orphan files: ${left}`;
});
await probe("E. garbage settings values are rejected", async () => {
  for (const patch of [{ memoryReviewEveryUserMessages: 0 }, { skillReviewMinToolSteps: -3 }, { memoryLimit: -5 }, { userLimit: null }, { curatorEveryDays: 1e12 }, { memoryReviewEveryUserMessages: 2.5 }, { theme: "x".repeat(10000) }]) {
    await api("/settings", "PUT", patch);
  }
  const s = (await api("/settings")).json;
  const bad = [];
  if (!(s.memoryReviewEveryUserMessages >= 1 && Number.isInteger(s.memoryReviewEveryUserMessages))) bad.push("memoryReviewEveryUserMessages=" + s.memoryReviewEveryUserMessages);
  if (!(s.skillReviewMinToolSteps >= 1)) bad.push("skillReviewMinToolSteps=" + s.skillReviewMinToolSteps);
  if (!(s.memoryLimit >= 100)) bad.push("memoryLimit=" + s.memoryLimit);
  if (!(s.userLimit >= 100)) bad.push("userLimit=" + s.userLimit);
  if (!(s.curatorEveryDays <= 3650)) bad.push("curatorEveryDays=" + s.curatorEveryDays);
  if (s.theme.length > 100) bad.push("theme length " + s.theme.length);
  return bad.length === 0 || bad.join("; ");
});
await probe("F. approvals: double answer, unknown id, wrong chat", async () => {
  const c = await newChat();
  await api(`/chats/${c.id}/messages`, "POST", { text: "run ls" });
  let id; for (let i = 0; i < 100 && !id; i++) { await sleep(50); id = (await api(`/chats/${c.id}`)).json.pendingApprovals?.[0]; }
  if (!id) return "no approval appeared";
  const other = await newChat();
  if ((await api(`/chats/${other.id}/approvals/${id}`, "POST", { decision: "once" })).status !== 404) return "approval accepted from the wrong chat";
  const rs = await Promise.all([api(`/chats/${c.id}/approvals/${id}`, "POST", { decision: "once" }), api(`/chats/${c.id}/approvals/${id}`, "POST", { decision: "deny" })]);
  if (rs.filter((r) => r.status === 200).length !== 1) return `statuses ${rs.map((r) => r.status)}`;
  if ((await api(`/chats/${c.id}/approvals/nope`, "POST", { decision: "once" })).status !== 404) return "unknown id not 404";
  const d = await waitIdle(c.id);
  return d.events.filter((e) => e.type === "approval_resolved").length === 1 || "resolved twice";
});
await probe("G. rapid send/stop cycles leave the chat usable", async () => {
  const c = await newChat();
  for (let i = 0; i < 25; i++) {
    await api(`/chats/${c.id}/messages`, "POST", { text: "run ls" });
    await sleep(20);
    await api(`/chats/${c.id}/stop`, "POST", {});
    await waitIdle(c.id);
  }
  await api(`/chats/${c.id}/messages`, "POST", { text: "final hello" });
  const d = await waitIdle(c.id);
  const tail = d.events.filter((e) => e.type !== "usage"); // a turn also reports context usage just before it ends
  return tail.at(-2).type === "message" || `last events ${d.events.slice(-3).map((e) => e.type)}`;
});
await probe("H. 5,000-event transcript: read and append stay fast", async () => {
  const c = await newChat();
  const lines = [];
  for (let i = 1; i <= 5000; i++) lines.push(JSON.stringify({ type: "message", text: "line " + i + " ".repeat(200), seq: i, ts: Date.now() }));
  fs.writeFileSync(path.join(sessionsDir(), `${c.id}.jsonl`), lines.join("\n") + "\n");
  let t = Date.now();
  await api(`/chats/${c.id}`);
  const readMs = Date.now() - t;
  t = Date.now();
  await api(`/chats/${c.id}/messages`, "POST", { text: "after the big history" });
  await waitIdle(c.id);
  const turnMs = Date.now() - t;
  const seqs = (await api(`/chats/${c.id}`)).json.events.map((e) => e.seq);
  if (seqs.length !== 5005 || seqs[5000] !== 5001) return `seq continuity broken: len ${seqs.length}, next ${seqs[5000]}`;
  return (readMs < 1500 && turnMs < 3000) || `slow: read ${readMs}ms, turn ${turnMs}ms`;
});
await probe("I. skills: 30 parallel creates + hostile names/paths", async () => {
  const body = (n) => ({ content: `---\nname: ${n}\ndescription: Use when ${n}.\n---\nbody` });
  const rs = await Promise.all(Array.from({ length: 30 }, (_, i) => api(`/skills/s-${i}`, "PUT", body(`s-${i}`))));
  if (rs.some((r) => r.status !== 200)) return "a create failed";
  if ((await api("/skills")).json.length !== 30) return "wrong skill count";
  for (const n of ["..", "a%2Fb", "A", "x".repeat(100), "%00"]) { const r = await api(`/skills/${n}`, "PUT", body("x")); if (r.status >= 500 || r.status === 200) return `name ${n} -> ${r.status}`; }
});
await probe("J. jobs: bad input rejected, 20 jobs, run-now storm", async () => {
  for (const b of [{}, { name: "a", prompt: "b", schedule: { kind: "interval", everyMinutes: -1 } }, { name: "a", prompt: "b", schedule: { kind: "once", at: "soon" } }, { name: "a", prompt: "b", schedule: { kind: "daily", time: "7pm" } }, { name: "a", prompt: "b", schedule: null }]) {
    const r = await api("/jobs", "POST", b); if (r.status !== 400) return `${JSON.stringify(b)} -> ${r.status}`;
  }
  const ids = [];
  for (let i = 0; i < 20; i++) ids.push((await api("/jobs", "POST", { name: `j${i}`, prompt: "hello", schedule: { kind: "interval", everyMinutes: 60 } })).json.id);
  await Promise.all(ids.flatMap((id) => [api(`/jobs/${id}/run`, "POST", {}), api(`/jobs/${id}/run`, "POST", {})]));
  await sleep(4000);
  const jobs = (await api("/jobs")).json;
  if (jobs.some((j) => j.lastStatus !== "ok")) return "some job did not finish ok: " + jobs.filter((j) => j.lastStatus !== "ok").map((j) => j.name + ":" + j.lastStatus);
});
await probe("K. auth: token needed everywhere, no bypass via path tricks", async () => {
  for (const p of ["/api/state", "/api/chats", "/api/memory", "/api/skills", "/api/jobs", "/api/agents", "/api/curator", "/api/%2e%2e/api/state", "/api//state"]) {
    const r = await fetch(base + p); if (r.status === 200) return `${p} open without token`;
  }
  const evil = await fetch(base + "/api/state", { headers: { "x-pheme-token": token, origin: "http://evil.example" } });
  if (evil.status !== 403) return "foreign origin accepted";
  const t = await fetch(base + "/%2e%2e/%2e%2e/etc/passwd"); const tx = await t.text();
  if (tx.includes("root:")) return "static path traversal!";
});
await probe("L. memory API: huge, binary-ish and concurrent writes", async () => {
  const rs = await Promise.all(Array.from({ length: 20 }, (_, i) => api("/memory", "PUT", { store: "user", entries: [`fact ${i}`] })));
  if (rs.some((r) => r.status !== 200)) return "a write failed";
  const m = (await api("/memory")).json;
  if (m.user.length !== 1) return `user store has ${m.user.length} entries`;
  const r = await api("/memory", "PUT", { store: "user", entries: ["§ inside", "ok"] });
  if (r.status >= 500) return "500 on § entry";
  const after = (await api("/memory")).json.user;
  if (after.some((e) => e.includes("§"))) return "entry containing § was stored; it will split on next read: " + JSON.stringify(after);
});

// Persistence + corruption + restart
await probe("M. restart with corrupted data files still boots and serves", async () => {
  await stop();
  const chatsBefore = fs.readdirSync(sessionsDir()).filter((f) => f.endsWith(".meta.json")).length;
  fs.writeFileSync(path.join(dataDir, "settings.json"), "{broken");
  fs.writeFileSync(path.join(dataDir, "jobs.json"), "not json at all");
  fs.writeFileSync(path.join(dataDir, "usage.json"), "[]");
  fs.writeFileSync(path.join(dataDir, "agent-runs.json"), "{}");
  fs.writeFileSync(path.join(dataDir, "curator.json"), "null");
  fs.writeFileSync(path.join(dataDir, "skill-usage.json"), "7");
  const one = fs.readdirSync(sessionsDir()).find((f) => f.endsWith(".jsonl"));
  fs.appendFileSync(path.join(sessionsDir(), one), '{"type":"message","text":"torn');
  fs.writeFileSync(path.join(sessionsDir(), "garbage.meta.json"), "{{{");
  await start();
  for (const p of ["/state", "/chats", "/jobs", "/agents", "/curator", "/skills", "/memory", "/settings"]) {
    const r = await api(p); if (r.status !== 200) return `${p} -> ${r.status} ${r.text.slice(0, 120)}`;
  }
  const chats = (await api("/chats")).json;
  if (chats.length < chatsBefore - 5) return `chats lost: ${chats.length} of ${chatsBefore}`;
  const c = await newChat();
  await api(`/chats/${c.id}/messages`, "POST", { text: "after corruption" });
  await waitIdle(c.id);
  const t = (await api(`/chats/${one.replace(".jsonl", "")}`)).json;
  if (!t || !t.events) return "chat with torn line unreadable";
  // can we keep chatting in the chat that has a torn last line?
  const r = await api(`/chats/${one.replace(".jsonl", "")}/messages`, "POST", { text: "continue" });
  if (r.status !== 202) return `continue torn chat -> ${r.status}`;
  const d = await waitIdle(one.replace(".jsonl", ""));
  return d.events.some((e) => e.type === "user" && e.text === "continue") || "message after a torn line was lost";
});
await probe("N. chats started before a restart: busy flag cleared, can send again", async () => {
  const c = await newChat();
  await api(`/chats/${c.id}/messages`, "POST", { text: "run ls" });
  await sleep(300);
  await stop();
  await start();
  const d = (await api(`/chats/${c.id}`)).json;
  if (d.busy) return "chat still busy after restart";
  const r = await api(`/chats/${c.id}/messages`, "POST", { text: "hello again" });
  if (r.status !== 202) return `send after restart -> ${r.status}`;
  const done = await waitIdle(c.id);
  return done.events.filter((e) => e.type !== "usage").at(-2).type === "message" || "no reply after restart";
});
await probe("O. static UI: SPA fallback, HEAD, unknown asset 404", async () => {
  const html = await fetch(base + "/some/route"); if (!(await html.text()).includes("<title>Pheme</title>")) return "no SPA fallback";
  if ((await fetch(base + "/assets/missing.js")).status !== 404) return "missing asset not 404";
  const h = await fetch(base + "/", { method: "HEAD" }); if (h.status >= 500) return "HEAD -> " + h.status;
});
await probe("P. server stayed healthy: no crash output", async () => {
  if (/Error|Unhandled|TypeError|ENOENT/.test(out)) return out.slice(-600);
  const st = await api("/state"); return st.status === 200;
});

await stop();
fs.rmSync(tmp, { recursive: true, force: true });
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} probes passed`);
process.exit(failed.length ? 1 : 0);
