import { spawn, execFileSync } from "node:child_process";
import fs from "node:fs"; import os from "node:os"; import path from "node:path";
const PORT = 7741, T = "s2-token-0123456789abcdefghijk";
const data = fs.mkdtempSync(path.join(os.tmpdir(), "s2-data-"));
const srv = spawn("node", [path.resolve(import.meta.dirname, "../dist/pheme.mjs"), "--fake", "--no-open", "--port", String(PORT), "--data-dir", data], { env: { ...process.env, PHEME_TOKEN: T }, stdio: "ignore" });
await new Promise((r) => setTimeout(r, 1500));
if (!(await fetch(`http://127.0.0.1:${PORT}/`).then((r) => r.ok).catch(() => false))) { console.log("server did not start on the expected port"); process.exit(2); }
const call = (p, init = {}) => fetch(`http://127.0.0.1:${PORT}/api${p}`, { ...init, headers: { "x-pheme-token": T, "content-type": "application/json", ...(init.headers ?? {}) } });
const J = async (p, init) => { const r = await call(p, init); return { s: r.status, j: await r.json().catch(() => ({})) }; };
const time = async (label, fn) => { const t = performance.now(); const v = await fn(); console.log(`${label.padEnd(58)} ${String(Math.round(performance.now() - t)).padStart(6)} ms`, typeof v === "object" ? "" : (v ?? "")); return v; };
const git = (cwd, ...a) => execFileSync("git", ["-c", "user.name=T", "-c", "user.email=t@t", "-c", "commit.gpgsign=false", ...a], { cwd, encoding: "utf8" }).trim();
let fails = 0; const check = (name, ok, extra = "") => { if (!ok) fails++; console.log(`${ok ? "PASS" : "FAIL"}  ${name} ${extra}`); };

// ---- big data: 1500 chats, one with 6000 events
const sess = path.join(data, "sessions"); fs.mkdirSync(sess, { recursive: true });
for (let i = 0; i < 1500; i++) {
  const id = `c${String(i).padStart(5, "0")}-0000-0000-0000-000000000000`;
  fs.writeFileSync(path.join(sess, `${id}.meta.json`), JSON.stringify({ id, title: `Chat ${i} about topic${i % 50}`, pinned: false, archived: false, createdAt: 1, updatedAt: Date.now() - i * 1000, userMessages: 3, lastMemoryReviewAt: 0 }));
  const lines = []; for (let k = 0; k < 6; k++) lines.push(JSON.stringify({ type: k % 2 ? "message" : "user", text: `message ${k} of chat ${i} needle${i % 97} ${"lorem ipsum ".repeat(20)}`, seq: k + 1, ts: 1 }));
  fs.writeFileSync(path.join(sess, `${id}.jsonl`), lines.join("\n") + "\n");
}
const big = "bigchat-0000-0000-0000-000000000000";
fs.writeFileSync(path.join(sess, `${big}.meta.json`), JSON.stringify({ id: big, title: "Huge chat", pinned: false, archived: false, createdAt: 1, updatedAt: Date.now() + 1e6, userMessages: 3000, lastMemoryReviewAt: 0 }));
fs.writeFileSync(path.join(sess, `${big}.jsonl`), Array.from({ length: 6000 }, (_, k) => JSON.stringify({ type: k % 2 ? "message" : "user", text: `big ${k} ${"x".repeat(200)} uniqueneedle${k}`, seq: k + 1, ts: 1 })).join("\n") + "\n");

await time("list 1501 chats", async () => (await J("/chats")).j.length);
const s1 = await time("search (hit in ~1/97 of chats)", async () => (await J("/search?q=needle5")).j);
check("search returns hits, bounded", s1.hits.length > 0 && s1.hits.length <= 40, `(${s1.hits.length}, partial=${s1.partial})`);
await time("search miss across 1501 chats", async () => (await J("/search?q=zzzzqqqq")).j.hits.length);
const par = await time("30 parallel searches", async () => (await Promise.all(Array.from({ length: 30 }, (_, i) => J(`/search?q=needle${i}`)))).map((r) => r.s));
check("parallel searches: only 200 or 429, no 5xx", par.every((c) => c === 200 || c === 429), `(${par.filter((c) => c === 200).length} ok, ${par.filter((c) => c === 429).length} busy)`);
await time("list chats WHILE a search runs", async () => { await Promise.all([J("/search?q=qqqqzzzz"), J("/search?q=zzzzzzzzz")]); const a = performance.now(); await J("/chats"); return Math.round(performance.now() - a) + " ms"; });
await time("export 6000-event chat", async () => { const r = await call(`/chats/${big}/export`); const t = await r.text(); return `${r.status} ${t.length} chars`; });
await time("backup 1501 chats", async () => { const r = await call("/backup"); const b = Buffer.from(await r.arrayBuffer()); fs.writeFileSync("/tmp/s2/big.pheme-backup", b); return `${r.status} ${(b.length / 1e6).toFixed(2)} MB`; });
const prev = await time("preview restore of it", async () => { const r = await fetch(`http://127.0.0.1:${PORT}/api/restore/preview`, { method: "POST", headers: { "x-pheme-token": T }, body: fs.readFileSync("/tmp/s2/big.pheme-backup") }); return (await r.json()); });
check("preview counts 1501 chats", prev.chats === 1501, JSON.stringify({ chats: prev.chats, files: prev.files }));
await time("restore (all exist -> skipped) with safety copy", async () => { const r = await fetch(`http://127.0.0.1:${PORT}/api/restore`, { method: "POST", headers: { "x-pheme-token": T }, body: fs.readFileSync("/tmp/s2/big.pheme-backup") }); return JSON.stringify(await r.json()); });
check("safety copy exists", fs.readdirSync(path.join(data, "backups")).length === 1);

// ---- git at scale
const repo = fs.mkdtempSync(path.join(os.tmpdir(), "s2-repo-")); git(repo, "init", "-q", "-b", "main"); fs.writeFileSync(path.join(repo, "seed.txt"), "1\n"); git(repo, "add", "."); git(repo, "commit", "-qm", "init");
const chat = (await J("/chats", { method: "POST", body: "{}" })).j.id;
check("set folder", (await J(`/chats/${chat}`, { method: "PATCH", body: JSON.stringify({ projectDir: repo }) })).s === 200);
fs.mkdirSync(path.join(repo, "many")); for (let i = 0; i < 5000; i++) fs.writeFileSync(path.join(repo, "many", `f${i}.txt`), `${i}\n`);
const st = await time("status with 5000 untracked files", async () => (await J(`/chats/${chat}/git`)).j);
check("status capped at 500 + moreFiles", st.files.length === 500 && st.moreFiles === 4500, `(${st.files.length}+${st.moreFiles})`);
await time("50 parallel status calls", async () => (await Promise.all(Array.from({ length: 50 }, () => J(`/chats/${chat}/git`)))).filter((r) => r.s === 200).length);
fs.writeFileSync(path.join(repo, "huge.txt"), "line of text here\n".repeat(400000)); // ~7 MB
const hd = await time("diff of a 7 MB file", async () => (await J(`/chats/${chat}/git/diff?path=huge.txt`)).j);
check("huge diff truncated", hd.truncated === true && hd.diff.length <= 200000);
const deep = path.join(repo, ...Array.from({ length: 25 }, (_, i) => `d${i}`)); fs.mkdirSync(deep, { recursive: true }); fs.writeFileSync(path.join(deep, "leaf.txt"), "leaf\n");
const rel = path.relative(repo, path.join(deep, "leaf.txt"));
check("deep path diff works", (await J(`/chats/${chat}/git/diff?path=${encodeURIComponent(rel)}`)).j.diff?.includes("+leaf"));
// concurrent commits to the same repo: exactly one wins, the other fails cleanly, repo stays consistent
git(repo, "switch", "-q", "-c", "work"); fs.writeFileSync(path.join(repo, "c1.txt"), "1\n"); fs.writeFileSync(path.join(repo, "c2.txt"), "2\n");
const two = await Promise.all([J(`/chats/${chat}/git/commit`, { method: "POST", body: JSON.stringify({ message: "A", paths: ["c1.txt"] }) }), J(`/chats/${chat}/git/commit`, { method: "POST", body: JSON.stringify({ message: "B", paths: ["c2.txt"] }) })]);
console.log("   concurrent commits ->", two.map((r) => `${r.s}${r.j.error ? " " + r.j.error.slice(0, 90) : ""}`).join(" | "));
const fsck = (() => { try { execFileSync("git", ["fsck", "--no-progress"], { cwd: repo, stdio: "pipe" }); return true; } catch { return false; } })();
check("repo healthy after concurrent commits", fsck && !fs.existsSync(path.join(repo, ".git", "index.lock")), `(lock left: ${fs.existsSync(path.join(repo, ".git", "index.lock"))})`);
check("both concurrent commits succeed", two.every((r) => r.s === 200));
check("no commit lost", git(repo, "log", "--format=%s", "-2").split("\n").sort().join() === "A,B");
// rapid folder switching
const t0 = performance.now(); for (let i = 0; i < 40; i++) await J(`/chats/${chat}`, { method: "PATCH", body: JSON.stringify({ projectDir: i % 2 ? repo : os.tmpdir() }) });
console.log(`40 folder switches ${Math.round(performance.now() - t0)} ms`);
// hostile inputs
for (const body of [{ projectDir: "x".repeat(5000) }, { projectDir: "/etc/passwd" }, { projectDir: { a: 1 } }, { model: 5 }, { model: "a\u0000b" }]) {
  const r = await J(`/chats/${chat}`, { method: "PATCH", body: JSON.stringify(body) }); check(`PATCH ${JSON.stringify(body).slice(0, 40)} -> 4xx not 5xx`, r.s >= 400 && r.s < 500, `(${r.s})`);
}
for (const [p, b] of [[`/chats/${chat}/git/commit`, { message: 5, paths: "x" }], [`/chats/${chat}/git/commit`, {}], [`/chats/${chat}/git/pr`, { title: {} }], [`/chats/${chat}/git/undo`, { sha: ["a"] }]]) {
  const r = await J(p, { method: "POST", body: JSON.stringify(b) }); check(`POST ${p.split("/").slice(-2).join("/")} ${JSON.stringify(b)} -> 4xx`, r.s >= 400 && r.s < 500, `(${r.s})`);
}
srv.kill();
console.log(fails ? `\n${fails} FAILED` : "\nALL PASSED");
process.exit(fails ? 1 : 0);
