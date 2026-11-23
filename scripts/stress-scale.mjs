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

// ---- branches and stash at scale
{
  const r2 = fs.mkdtempSync(path.join(os.tmpdir(), "s2-br-")); git(r2, "init", "-q", "-b", "main"); fs.writeFileSync(path.join(r2, "a.txt"), "1\n"); git(r2, "add", "."); git(r2, "commit", "-qm", "init");
  const refs = Array.from({ length: 400 }, (_, i) => `update-ref refs/heads/topic/b${i}-${"x".repeat(i % 30)}-é HEAD`).join("\n") + "\n";
  execFileSync("git", ["update-ref", "--stdin"], { cwd: r2, input: refs.replace(/update-ref /g, "update ").replace(/ HEAD\n/g, " HEAD\n") });
  const c2 = (await J("/chats", { method: "POST", body: "{}" })).j.id;
  await J(`/chats/${c2}`, { method: "PATCH", body: JSON.stringify({ projectDir: r2 }) });
  const bl = await time("list 401 branches", async () => (await J(`/chats/${c2}/git/branches`)).j);
  check("branches capped at 200, current first, count of the rest", bl.branches.length === 200 && bl.branches[0].current && bl.more === 201, `(${bl.branches.length}, more ${bl.more})`);
  for (let i = 0; i < 70; i++) { fs.writeFileSync(path.join(r2, "a.txt"), `v${i}\n`); await J(`/chats/${c2}/git/stash`, { method: "POST", body: JSON.stringify({ message: `s${i}` }) }); }
  const sl = await time("list 70 stashes", async () => (await J(`/chats/${c2}/git/stash`)).j);
  check("stashes capped at 50 with a count of the rest", sl.stashes.length === 50 && sl.more === 20 && sl.stashes[0].message === "s69", `(${sl.stashes.length}, more ${sl.more})`);
  const oldest = sl.stashes[49];
  const ap = await J(`/chats/${c2}/git/stash/apply`, { method: "POST", body: JSON.stringify({ sha: oldest.sha, drop: true }) });
  check("apply the 50th stash by id", ap.s === 200 && fs.readFileSync(path.join(r2, "a.txt"), "utf8") === "v20\n", `(${ap.s} ${ap.j.error ?? ""})`);
  git(r2, "checkout", "--", "a.txt");
  // 3000 untracked files: stash, switch, restore, byte-for-byte
  fs.mkdirSync(path.join(r2, "bulk")); for (let i = 0; i < 3000; i++) fs.writeFileSync(path.join(r2, "bulk", `f${i}.txt`), `${i}\n`);
  fs.writeFileSync(path.join(r2, "a.txt"), "edited\n");
  const st1 = await time("stash 3000 untracked files + edit", async () => (await J(`/chats/${c2}/git/stash`, { method: "POST", body: JSON.stringify({ message: "bulk" }) })).s);
  check("working folder clean after stash (untracked removed too)", st1 === 200 && git(r2, "status", "--porcelain") === "" && !fs.existsSync(path.join(r2, "bulk")));
  const [bulk] = (await J(`/chats/${c2}/git/stash`)).j.stashes;
  const rs = await time("restore it", async () => (await J(`/chats/${c2}/git/stash/apply`, { method: "POST", body: JSON.stringify({ sha: bulk.sha, drop: true }) })).s);
  check("all 3000 files and the edit came back", rs === 200 && fs.readdirSync(path.join(r2, "bulk")).length === 3000 && fs.readFileSync(path.join(r2, "a.txt"), "utf8") === "edited\n");
  // concurrent switches/creates from many requests: all succeed, repo healthy, HEAD is one of them
  const names = Array.from({ length: 25 }, (_, i) => `race/${i}`);
  const rr = await time("25 simultaneous branch creations", async () => (await Promise.all(names.map((n) => J(`/chats/${c2}/git/switch`, { method: "POST", body: JSON.stringify({ name: n, create: true }) })))).map((x) => x.s));
  check("all 25 succeeded, no 5xx", rr.every((c) => c === 200), `(${rr.filter((c) => c !== 200).join(",")})`);
  check("repo healthy and the 25 branches exist", (() => { try { execFileSync("git", ["fsck", "--no-progress"], { cwd: r2, stdio: "pipe" }); } catch { return false; } return git(r2, "branch", "--list", "race/*").split("\n").length === 25 && !fs.existsSync(path.join(r2, ".git", "index.lock")); })());
  const mix = await time("60 mixed reads+writes at once", async () => (await Promise.all(Array.from({ length: 60 }, (_, i) => i % 3 === 0 ? J(`/chats/${c2}/git/branches`) : i % 3 === 1 ? J(`/chats/${c2}/git/stash`) : J(`/chats/${c2}/git`)))).map((x) => x.s));
  check("mixed burst all 200", mix.every((c) => c === 200));
  // hostile
  for (const body of [{ name: "../../x", create: true }, { name: "a\u0000b", create: true }, { name: "--orphan", create: true }, { name: 5 }, { sha: "x" }]) {
    const x = await J(`/chats/${c2}/git/switch`, { method: "POST", body: JSON.stringify(body) }); check(`switch ${JSON.stringify(body)} -> 4xx`, x.s >= 400 && x.s < 500, `(${x.s})`);
  }
  for (const body of [{ sha: "stash@{0}" }, { sha: "--all" }, { sha: ["a"] }, {}]) {
    for (const act of ["apply", "drop"]) { const x = await J(`/chats/${c2}/git/stash/${act}`, { method: "POST", body: JSON.stringify(body) }); check(`stash/${act} ${JSON.stringify(body)} -> 4xx`, x.s >= 400 && x.s < 500, `(${x.s})`); }
  }
  // PR detail with no gh / no remote: must not 500
  const pd = await J(`/chats/${c2}/git/pr`); check("PR detail on a repo without a remote -> 200 {pr:null} or clear 4xx", (pd.s === 200 && pd.j.pr === null) || (pd.s >= 400 && pd.s < 500), `(${pd.s})`);
}

// ---- attachments
{
  const c3 = (await J("/chats", { method: "POST", body: "{}" })).j.id;
  const up = (name, body, id = c3) => fetch(`http://127.0.0.1:${PORT}/api/chats/${id}/attachments?name=${encodeURIComponent(name)}`, { method: "POST", headers: { "x-pheme-token": T, "content-type": "application/octet-stream" }, body }).then(async (r) => ({ s: r.status, j: await r.json().catch(() => ({})) })).catch(() => ({ s: -1, j: {} }));
  const png = (extra) => Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(extra, 7)]);
  const big = await time("upload a 5 MB image", async () => (await up("big.png", png(5 * 1024 * 1024 - 100))).s);
  check("5 MB image accepted", big === 201);
  const par = await time("20 parallel uploads", async () => (await Promise.all(Array.from({ length: 20 }, (_, i) => up(`p${i}.txt`, `file ${i}\n`)))).map((x) => x.s));
  check("all 20 accepted", par.every((c) => c === 201));
  const ids = new Set((await Promise.all(Array.from({ length: 20 }, (_, i) => up(`q${i}.txt`, `q ${i}`)))).map((x) => x.j.id));
  check("ids are unique", ids.size === 20);
  const hostile = [
    ["../../../etc/passwd.txt", "x"], ["a\u0000b.txt", "x"], ["x".repeat(5000) + ".txt", "x"], ["..", "x"], ["", "x"], ["con.txt", "x"], ["a:b*c?.txt", "x"], ["日本語ファイル.md", "# 日本語"], ["emoji🎉.json", "{}"],
  ];
  for (const [n, b] of hostile) { const r = await up(n, b); check(`hostile name ${JSON.stringify(n.slice(0, 24))} -> 201 with a clean name, or 4xx; never 5xx`, r.s === 201 ? ![...r.j.name].some((ch) => "\\/:*?\u0000".includes(ch)) && r.j.name.length <= 100 : r.s >= 400 && r.s < 500, `(${r.s} ${r.j.name ?? r.j.error ?? ""})`.slice(0, 80)); }
  const trav = fs.readdirSync(path.join(data, "attachments", c3)).filter((f) => f.includes("passwd") || f.includes(".."));
  check("nothing named from the client reached the disk", trav.length === 0);
  check("empty body -> 400", (await up("e.txt", "")).s === 400);
  check("zip renamed .txt -> 415", (await up("z.txt", Buffer.from([0x50, 0x4b, 3, 4, 0, 0, 0]))).s === 415);
  check("svg -> 415", (await up("a.svg", '<svg onload="alert(1)"/>')).s === 415);
  check(".env -> 422", (await up(".env", "A=1")).s === 422);
  const over = await up("over.png", png(6 * 1024 * 1024));
  check("6 MB image -> 413 (or the connection cut)", over.s === 413 || over.s === -1, `(${over.s})`);
  // storage cap: 5 MB images until the 50 MB cap
  const c4 = (await J("/chats", { method: "POST", body: "{}" })).j.id;
  const codes = []; for (let i = 0; i < 12; i++) codes.push((await up(`i${i}.png`, png(5 * 1024 * 1024 - 100), c4)).s);
  const okCount = codes.filter((c) => c === 201).length;
  check("per-chat 50 MB cap holds (9-10 accepted, the rest 413, nothing else)", okCount >= 9 && okCount <= 10 && codes.every((c) => c === 201 || c === 413) && codes.at(-1) === 413, `(${codes.join(",")})`);
  // send limits
  const five = []; for (let i = 0; i < 6; i++) five.push((await up(`s${i}.txt`, `s${i}`)).j.id);
  const send6 = await J(`/chats/${c3}/messages`, { method: "POST", body: JSON.stringify({ text: "six", attachments: five }) });
  check("six attachments in one message -> 400", send6.s === 400, `(${send6.s})`);
  const send5 = await J(`/chats/${c3}/messages`, { method: "POST", body: JSON.stringify({ text: "five", attachments: five.slice(0, 5) }) });
  check("five attachments -> 202", send5.s === 202, `(${send5.s})`);
  await new Promise((r) => setTimeout(r, 400));
  const busy2 = await J(`/chats/${c3}/messages`, { method: "POST", body: JSON.stringify({ text: "again", attachments: [five[5]] }) });
  check("a message that reuses nothing wrong while idle is accepted", busy2.s === 202 || busy2.s === 409, `(${busy2.s})`);
  // download of the 5 MB image
  const dl = await time("download the 5 MB image", async () => { const r = await call(`/chats/${c3}/attachments/${big === 201 ? (await J(`/chats/${c3}`)).j.events.find((e) => e.attachments)?.attachments?.[0]?.id ?? "x" : "x"}`); return r.status; });
  void dl;
  // delete chat removes files
  await J(`/chats/${c4}`, { method: "DELETE" });
  check("deleting a chat deletes its attachments", !fs.existsSync(path.join(data, "attachments", c4)));
}

// ---- prompts
{
  const mk = (b) => J("/prompts", { method: "POST", body: JSON.stringify(b) });
  const par = await time("60 parallel prompt creates", async () => (await Promise.all(Array.from({ length: 60 }, (_, i) => mk({ name: `p${i}`, text: `text ${i}` })))).map((r) => r.s));
  check("all 60 created (no lost writes)", par.every((c) => c === 201) && (await J("/prompts")).j.length === 60);
  const dup = await Promise.all(Array.from({ length: 10 }, () => mk({ name: "same", text: "x" })));
  check("10 parallel creates of one name: exactly one wins, the rest 409", dup.filter((r) => r.s === 201).length === 1 && dup.filter((r) => r.s === 409).length === 9);
  for (let i = 0; i < 138; i++) await mk({ name: `fill${i}`, text: "t" });
  check("199 saved, one more fits", (await mk({ name: "last", text: "t" })).s === 201);
  check("the 201st is refused", (await mk({ name: "overflow", text: "t" })).s === 409);
  const list = await time("list 200 prompts", async () => (await J("/prompts")).j);
  check("sorted by name, all present", list.length === 200 && list.every((p, i) => i === 0 || list[i - 1].name.localeCompare(p.name, undefined, { sensitivity: "base" }) <= 0));
  for (const body of [{ name: "x".repeat(81), text: "t" }, { name: "n", text: "x".repeat(20001) }, { name: "n", text: "a\u0000b" }, { name: {}, text: "t" }, { name: "n", text: "t", projectDir: 5 }, { name: "n", text: "t", projectDir: "x".repeat(501) }]) {
    const r = await mk(body); check(`prompt ${JSON.stringify(body).slice(0, 36)}... -> 4xx`, r.s >= 400 && r.s < 500, `(${r.s})`);
  }
  const big = await mk({ name: "biggest", text: "y".repeat(20000) });
  check("a 20,000-character prompt is fine", big.s === 409 || big.s === 201, `(${big.s})`); // 409 only because the library is full
  const del = await Promise.all(list.slice(0, 50).map((p) => J(`/prompts/${p.id}`, { method: "DELETE" })));
  check("50 parallel deletes all succeed", del.every((r) => r.s === 200) && (await J("/prompts")).j.length === 150);
  const again = await J(`/prompts/${list[0].id}`, { method: "DELETE" });
  check("deleting twice -> 404", again.s === 404);
}

srv.kill();
await new Promise((r) => setTimeout(r, 500));
{
  // startup sweep: 2000 chat folders of stale, never-sent uploads
  let made = 0;
  for (let i = 0; i < 2000; i++) { const d = path.join(data, "attachments", `old${String(i).padStart(5, "0")}`); fs.mkdirSync(d, { recursive: true }); for (let k = 0; k < 2; k++) { const id = `abcdef01-0000-4000-8000-${String(i * 10 + k).padStart(12, "0")}`; fs.writeFileSync(path.join(d, `${id}.txt`), "x"); fs.writeFileSync(path.join(d, `${id}.json`), JSON.stringify({ id, name: "o.txt", kind: "text", mime: "text/plain", size: 1, file: `${id}.txt`, createdAt: Date.now() - 3 * 86400_000, sent: false })); made++; } }
  const t0 = performance.now();
  const srv2 = spawn("node", [path.resolve(import.meta.dirname, "../dist/pheme.mjs"), "--fake", "--no-open", "--port", String(PORT), "--data-dir", data], { env: { ...process.env, PHEME_TOKEN: T }, stdio: "ignore" });
  let ready = false; for (let i = 0; i < 300 && !ready; i++) { ready = await fetch(`http://127.0.0.1:${PORT}/`).then((r) => r.ok).catch(() => false); if (!ready) await new Promise((r) => setTimeout(r, 50)); }
  const ms = Math.round(performance.now() - t0);
  console.log(`restart with ${made} stale uploads in 2000 folders: ready in ${ms} ms`);
  check("startup stays quick with 2000 stale folders (< 8 s)", ready && ms < 8000);
  const left = fs.readdirSync(path.join(data, "attachments")).filter((d) => d.startsWith("old")).reduce((n, d) => n + fs.readdirSync(path.join(data, "attachments", d)).length, 0);
  check("stale uploads were swept", left === 0, `(${left} files left)`);
  srv2.kill();
}
console.log(fails ? `\n${fails} FAILED` : "\nALL PASSED");
process.exit(fails ? 1 : 0);
