import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { branchFromMessage, draftMessage, gitCommit, gitStatus, gitUndo, looksSecret } from "../src/git.ts";
import { startServer, type RunningServer } from "../src/server.ts";
import { makeApp } from "./helpers.ts";

const dirs: string[] = [];
const saved: Record<string, string | undefined> = {};
const cfgDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "pheme-gitcfg-")));
const cfg = path.join(cfgDir, "gitconfig");

beforeAll(() => {
  // Isolate from the developer's own Git config (signing, hooks, templates) so results are the same everywhere.
  fs.writeFileSync(cfg, "[user]\n\tname = Test\n\temail = t@example.com\n[commit]\n\tgpgsign = false\n[init]\n\tdefaultBranch = main\n");
  for (const k of ["GIT_CONFIG_GLOBAL", "GIT_CONFIG_NOSYSTEM", "HOME"]) saved[k] = process.env[k];
  process.env.GIT_CONFIG_GLOBAL = cfg;
  process.env.GIT_CONFIG_NOSYSTEM = "1";
});
afterAll(() => {
  for (const [k, v] of Object.entries(saved)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
  fs.rmSync(cfgDir, { recursive: true, force: true });
});

function tmp(): string {
  const d = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "pheme-gc-")));
  dirs.push(d);
  return d;
}
const git = (cwd: string, ...a: string[]) => execFileSync("git", a, { cwd, encoding: "utf8", env: process.env }).trim();
const w = (d: string, f: string, c: string) => { fs.mkdirSync(path.dirname(path.join(d, f)), { recursive: true }); fs.writeFileSync(path.join(d, f), c); };
function repo(branch = "feat/work"): string {
  const d = tmp();
  git(d, "init", "-q", "-b", "main");
  w(d, "a.txt", "one\ntwo\n"); w(d, "b.txt", "keep\n");
  git(d, "add", "."); git(d, "commit", "-q", "-m", "init");
  if (branch !== "main") git(d, "switch", "-q", "-c", branch);
  return d;
}
let srv: RunningServer | undefined;
afterEach(async () => {
  await srv?.close(); srv = undefined;
  for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
});
const staged = (d: string) => git(d, "diff", "--cached", "--name-only").split("\n").filter(Boolean);
const lastFiles = (d: string) => git(d, "show", "--name-only", "--format=", "HEAD").split("\n").filter(Boolean).sort();

describe("helpers", () => {
  it("flags secret-looking files but not templates or public keys", () => {
    for (const p of [".env", "app/.env.local", "id_rsa", "keys/server.pem", "tls.key", "credentials.json", "secrets.yml", ".npmrc", "my-service-account-123.json", "x.p12"]) expect(looksSecret(p), p).toBe(true);
    for (const p of [".env.example", "id_rsa.pub", "README.md", "src/keyboard.ts", "environment.ts", "config.sample", "monkey.txt"]) expect(looksSecret(p), p).toBe(false);
  });
  it("drafts a message and a branch name from the files", () => {
    expect(draftMessage([{ path: "src/a.ts", staged: "", unstaged: "modified" }])).toBe("Update a.ts");
    expect(draftMessage([{ path: "n.ts", staged: "", unstaged: "untracked" }, { path: "m.ts", staged: "added", unstaged: "" }])).toBe("Add n.ts, m.ts");
    expect(draftMessage(["a", "b", "c", "d", "e"].map((p) => ({ path: p, staged: "" as const, unstaged: "modified" as const })))).toBe("Update a, b, c and 2 more");
    expect(draftMessage([])).toBe("");
    expect(branchFromMessage("Fix the login bug!!")).toBe("pheme/fix-the-login-bug");
    expect(branchFromMessage("日本語")).toBe("pheme/changes");
    expect(branchFromMessage("x".repeat(200)).length).toBeLessThanOrEqual(47);
  });
});

describe("gitCommit", () => {
  it("commits only the ticked files and leaves the rest exactly as they were", async () => {
    const d = repo();
    w(d, "a.txt", "one\nTWO\n"); w(d, "new.txt", "n\n"); w(d, "other.txt", "o\n");
    git(d, "add", "other.txt"); // staged by the user but not ticked
    const r = await gitCommit(d, { message: "Change a and add new", paths: ["a.txt", "new.txt"] });
    expect(r).toMatchObject({ branch: "feat/work", files: 2, summary: "Change a and add new" });
    expect(lastFiles(d)).toEqual(["a.txt", "new.txt"]);
    expect(staged(d)).toEqual([]); // other.txt was set aside, not committed and no longer staged
    const st = await gitStatus(d);
    expect(st.files.map((f) => [f.path, f.unstaged])).toEqual([["other.txt", "untracked"]]);
    expect(fs.readFileSync(path.join(d, "other.txt"), "utf8")).toBe("o\n"); // content untouched
  });

  it("handles deletions and renames, including the old path", async () => {
    const d = repo();
    fs.rmSync(path.join(d, "b.txt"));
    git(d, "mv", "a.txt", "moved.txt");
    const st = await gitStatus(d);
    const paths = st.files.map((f) => f.path);
    await gitCommit(d, { message: "Remove and rename", paths });
    expect(git(d, "status", "--porcelain")).toBe("");
    expect(fs.existsSync(path.join(d, "moved.txt"))).toBe(true);
    expect(git(d, "show", "--name-status", "--format=", "HEAD")).toMatch(/D\tb\.txt/);
  });

  it("keeps awkward messages intact: quotes, $(…), backticks, unicode, several lines", async () => {
    const d = repo();
    w(d, "a.txt", "x\n");
    const msg = 'Fix "quotes" and $(touch pwned) `id` 日本語 ✓\n\nBody line 1\nBody line 2';
    await gitCommit(d, { message: msg, paths: ["a.txt"] });
    expect(git(d, "log", "-1", "--format=%B")).toBe(msg);
    expect(fs.existsSync(path.join(d, "pwned"))).toBe(false);
  });

  it("works with unusual file names (spaces, glob characters, leading dashes)", async () => {
    const d = repo();
    // "*" and a few other characters are not legal in Windows file names, so use them only elsewhere.
    const names = ["with space.txt", "-dash.txt", "[br].txt", "sub dir/in side.txt", ...(process.platform === "win32" ? [] : ["star*.txt", "q?.txt"])];
    for (const n of names) w(d, n, "x\n");
    const st = await gitStatus(d);
    await gitCommit(d, { message: "odd names", paths: st.files.map((f) => f.path) });
    expect(git(d, "status", "--porcelain")).toBe("");
    expect(lastFiles(d)).toHaveLength(names.length);
  });

  it("refuses to commit on main: asks for a branch, validates it, then creates it", async () => {
    const d = repo("main");
    w(d, "a.txt", "changed\n");
    await expect(gitCommit(d, { message: "m", paths: ["a.txt"] })).rejects.toThrow(/You are on main/);
    expect(git(d, "rev-parse", "--abbrev-ref", "HEAD")).toBe("main"); // nothing moved
    for (const bad of ["has space", "a..b", "-x", "end.", "x".repeat(300), "feat/"]) await expect(gitCommit(d, { message: "m", paths: ["a.txt"], branch: bad })).rejects.toThrow(/not a valid branch name/);
    expect(git(d, "log", "--oneline")).toHaveLength(git(d, "log", "--oneline").length); // still just "init"
    expect(git(d, "rev-list", "--count", "HEAD")).toBe("1");
    git(d, "branch", "taken");
    await expect(gitCommit(d, { message: "m", paths: ["a.txt"], branch: "taken" })).rejects.toThrow(/already exists/);
    const r = await gitCommit(d, { message: "Do it", paths: ["a.txt"], branch: "feat/new-thing" });
    expect(r.branch).toBe("feat/new-thing");
    expect(git(d, "rev-parse", "--abbrev-ref", "HEAD")).toBe("feat/new-thing");
    expect(git(d, "rev-list", "--count", "main")).toBe("1"); // main untouched
  });

  it("refuses a new-branch name when it is not needed, and a detached HEAD without one", async () => {
    const d = repo();
    w(d, "a.txt", "z\n");
    await expect(gitCommit(d, { message: "m", paths: ["a.txt"], branch: "other" })).rejects.toThrow(/only needed when you are on main/);
    git(d, "checkout", "-q", "--detach");
    await expect(gitCommit(d, { message: "m", paths: ["a.txt"] })).rejects.toThrow(/detached/);
    const r = await gitCommit(d, { message: "m", paths: ["a.txt"], branch: "from-detached" });
    expect(r.branch).toBe("from-detached");
  });

  it("works in a brand-new repo with no commits (first commit needs a branch off main)", async () => {
    const d = tmp();
    git(d, "init", "-q", "-b", "main");
    w(d, "first.txt", "hi\n");
    const r = await gitCommit(d, { message: "First", paths: ["first.txt"], branch: "start" });
    expect(r.branch).toBe("start");
    expect(git(d, "rev-list", "--count", "HEAD")).toBe("1");
  });

  it("never commits secret-looking files unless explicitly confirmed", async () => {
    const d = repo();
    w(d, ".env", "TOKEN=abc\n"); w(d, "ok.txt", "fine\n");
    await expect(gitCommit(d, { message: "m", paths: [".env", "ok.txt"] })).rejects.toThrow(/look like secrets.*\.env/);
    expect(git(d, "rev-list", "--count", "HEAD")).toBe("1");
    await gitCommit(d, { message: "m", paths: ["ok.txt"] }); // unticked secret is simply left alone
    expect(lastFiles(d)).toEqual(["ok.txt"]);
    await gitCommit(d, { message: "I mean it", paths: [".env"], allowRisky: [".env"] });
    expect(lastFiles(d)).toEqual([".env"]);
  });

  it("refuses conflicted files, empty/huge messages, empty selection, stale and malicious paths", async () => {
    const d = repo();
    w(d, "a.txt", "main side\n"); git(d, "commit", "-qam", "m1");
    git(d, "switch", "-q", "-c", "other", "HEAD~1"); w(d, "a.txt", "other side\n"); git(d, "commit", "-qam", "o1");
    try { git(d, "merge", "feat/work"); } catch { /* conflict is the point */ }
    await expect(gitCommit(d, { message: "m", paths: ["a.txt"] })).rejects.toThrow(/conflicts/);
    git(d, "merge", "--abort");
    w(d, "b.txt", "changed\n");
    await expect(gitCommit(d, { message: "  \n ", paths: ["b.txt"] })).rejects.toThrow(/commit message/);
    await expect(gitCommit(d, { message: "x".repeat(10_001), paths: ["b.txt"] })).rejects.toThrow(/too long/);
    await expect(gitCommit(d, { message: "m", paths: [] })).rejects.toThrow(/at least one file/);
    await expect(gitCommit(d, { message: "m", paths: ["never-changed.txt"] })).rejects.toThrow(/no changes to commit any more/);
    for (const bad of ["../../etc/passwd", "/etc/passwd", "a/../../x"]) await expect(gitCommit(d, { message: "m", paths: [bad] })).rejects.toThrow(/Bad file path/);
    await expect(gitCommit(d, { message: "m", paths: Array.from({ length: 501 }, (_, i) => `f${i}`) })).rejects.toThrow(/Too many files/);
  });

  it("explains missing Git identity in plain words", async () => {
    const d = repo();
    w(d, "a.txt", "q\n");
    const keep = process.env.GIT_CONFIG_GLOBAL;
    const empty = path.join(cfgDir, "empty");
    fs.writeFileSync(empty, "[commit]\n\tgpgsign = false\n[user]\n\tuseConfigOnly = true\n");
    process.env.GIT_CONFIG_GLOBAL = empty;
    const names = ["GIT_AUTHOR_NAME", "GIT_AUTHOR_EMAIL", "GIT_COMMITTER_NAME", "GIT_COMMITTER_EMAIL", "EMAIL"];
    const old = names.map((n) => process.env[n]);
    names.forEach((n) => delete process.env[n]);
    const home = process.env.HOME; process.env.HOME = cfgDir;
    try {
      await expect(gitCommit(d, { message: "m", paths: ["a.txt"] })).rejects.toThrow(/does not know who you are/);
    } finally {
      process.env.GIT_CONFIG_GLOBAL = keep; process.env.HOME = home;
      names.forEach((n, i) => { if (old[i] !== undefined) process.env[n] = old[i]; });
    }
  });

  it("reports a failing pre-commit hook's own message", async () => {
    if (process.platform === "win32") return; // hook scripts are POSIX shell here
    const d = repo();
    const hook = path.join(d, ".git", "hooks", "pre-commit");
    fs.writeFileSync(hook, '#!/bin/sh\necho "lint failed: no TODOs allowed" >&2\nexit 1\n', { mode: 0o755 });
    w(d, "a.txt", "TODO\n");
    await expect(gitCommit(d, { message: "m", paths: ["a.txt"] })).rejects.toThrow(/lint failed: no TODOs allowed/);
    expect(git(d, "rev-list", "--count", "HEAD")).toBe("1");
  });
});

describe("gitUndo", () => {
  it("soft-resets the last commit and keeps all changes", async () => {
    const d = repo();
    w(d, "a.txt", "mine\n");
    const r = await gitCommit(d, { message: "oops", paths: ["a.txt"] });
    const u = await gitUndo(d, r.sha);
    expect(u.undone).toBe(r.short);
    expect(git(d, "rev-list", "--count", "HEAD")).toBe("1");
    expect(fs.readFileSync(path.join(d, "a.txt"), "utf8")).toBe("mine\n");
    expect(git(d, "status", "--porcelain")).toMatch(/^M\s+a\.txt/); // still staged, nothing lost
  });

  it("refuses when HEAD moved, when pushed, on a first commit, on a merge, and on a bad id", async () => {
    const d = repo();
    w(d, "a.txt", "1\n");
    const r1 = await gitCommit(d, { message: "c1", paths: ["a.txt"] });
    w(d, "a.txt", "2\n"); git(d, "commit", "-qam", "outside");
    await expect(gitUndo(d, r1.sha)).rejects.toThrow(/no longer safe/);
    await expect(gitUndo(d, "not-a-sha")).rejects.toThrow(/Bad commit id/);
    await expect(gitUndo(d, "")).rejects.toThrow(/Bad commit id/);

    // pushed
    const bare = tmp(); git(bare, "init", "-q", "--bare");
    git(d, "remote", "add", "origin", bare); git(d, "push", "-q", "-u", "origin", "feat/work");
    const head = git(d, "rev-parse", "HEAD");
    await expect(gitUndo(d, head)).rejects.toThrow(/already been pushed/);

    // first commit
    const f = tmp(); git(f, "init", "-q", "-b", "main"); w(f, "x", "1\n");
    const fr = await gitCommit(f, { message: "first", paths: ["x"], branch: "b1" });
    await expect(gitUndo(f, fr.sha)).rejects.toThrow(/first commit/);

    // merge
    const m = repo(); git(m, "switch", "-q", "-c", "side"); w(m, "s.txt", "s\n"); git(m, "add", "."); git(m, "commit", "-qm", "side");
    git(m, "switch", "-q", "feat/work"); w(m, "t.txt", "t\n"); git(m, "add", "."); git(m, "commit", "-qm", "t"); git(m, "merge", "-q", "--no-ff", "side", "-m", "merge");
    await expect(gitUndo(m, git(m, "rev-parse", "HEAD"))).rejects.toThrow(/merge commit/);
  });
});

describe("HTTP", () => {
  async function boot() {
    const ctx = makeApp();
    srv = await startServer({ app: ctx.app, fake: true, version: "t", token: "secret-token", assets: {} });
    const base = `http://127.0.0.1:${srv.port}`;
    const call = (p: string, body?: unknown) => fetch(base + p, { method: body === undefined ? "GET" : "POST", headers: { "x-pheme-token": "secret-token", "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
    const chat = ctx.app.store.create();
    return { ...ctx, call, id: chat.id };
  }

  it("needs a folder, refuses while a reply runs, commits and undoes over HTTP", async () => {
    const { app, call, id } = await boot();
    expect((await call(`/api/chats/${id}/git/commit`, { message: "m", paths: ["a"] })).status).toBe(400);
    const d = repo(); w(d, "a.txt", "http\n");
    await app.setProjectDir(id, d);
    app.send(id, "run ls"); // approval pending => busy
    const busy = await call(`/api/chats/${id}/git/commit`, { message: "m", paths: ["a.txt"] });
    expect(busy.status).toBe(409);
    expect(((await busy.json()) as { error: string }).error).toMatch(/reply is running/);
    app.stop(id); await app.drain();
    const ok = await call(`/api/chats/${id}/git/commit`, { message: "Via HTTP", paths: ["a.txt"] });
    expect(ok.status).toBe(200);
    const res = (await ok.json()) as { sha: string; summary: string };
    expect(res.summary).toBe("Via HTTP");
    expect((await call(`/api/chats/${id}/git/undo`, { sha: res.sha })).status).toBe(200);
    expect((await call(`/api/chats/${id}/git/undo`, { sha: res.sha })).status).toBe(409); // already undone: HEAD is no longer that commit
  });
});
