import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { checkProjectDir, gitDiff, gitStatus, parseNumstat, parseStatus, safeRepoPath } from "../src/git.ts";
import { startServer, type RunningServer } from "../src/server.ts";
import { makeApp } from "./helpers.ts";

const dirs: string[] = [];
function tmp(): string {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "pheme-git-"));
  dirs.push(d);
  return fs.realpathSync(d);
}
const git = (cwd: string, ...a: string[]) => execFileSync("git", ["-c", "user.email=t@t", "-c", "user.name=T", "-c", "commit.gpgsign=false", ...a], { cwd, encoding: "utf8" });
function repo(withCommit = true): string {
  const d = tmp();
  git(d, "init", "-q", "-b", "main");
  if (withCommit) {
    fs.writeFileSync(path.join(d, "a.txt"), "one\ntwo\nthree\n");
    fs.writeFileSync(path.join(d, "b.txt"), "keep\n");
    git(d, "add", "."); git(d, "commit", "-q", "-m", "init");
  }
  return d;
}
let srv: RunningServer | undefined;
afterEach(async () => {
  await srv?.close();
  srv = undefined;
  for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
});

describe("checkProjectDir", () => {
  it("accepts an existing absolute folder and rejects everything else with a plain message", () => {
    const d = tmp();
    expect(checkProjectDir(d)).toBe(d);
    expect(() => checkProjectDir("")).toThrow(/Enter a folder/);
    expect(() => checkProjectDir("relative/dir")).toThrow(/full path/);
    expect(() => checkProjectDir(path.join(d, "nope"))).toThrow(/does not exist/);
    fs.writeFileSync(path.join(d, "f"), "x");
    expect(() => checkProjectDir(path.join(d, "f"))).toThrow(/file, not a folder/);
    expect(() => checkProjectDir("/tmp/a\0b")).toThrow();
    expect(() => checkProjectDir("x".repeat(2000))).toThrow();
  });
});

describe("parsers", () => {
  it("parses porcelain v2 including renames, untracked and conflicts, and names with spaces", () => {
    const out = ["# branch.oid abc", "# branch.head feat/x", "# branch.upstream origin/feat/x", "# branch.ab +2 -1",
      "1 .M N... 100644 100644 100644 h1 h2 dir/with space.txt", "1 A. N... 000000 100644 100644 h1 h2 new.txt",
      "2 R. N... 100644 100644 100644 h1 h2 R100 renamed.txt", "old.txt", "u UU N... 1 2 3 4 h1 h2 h3 conflict.txt", "? untracked.txt", ""].join("\0");
    const r = parseStatus(out);
    expect(r).toMatchObject({ branch: "feat/x", upstream: "origin/feat/x", ahead: 2, behind: 1, hasCommits: true });
    expect(r.files.map((f) => [f.path, f.staged, f.unstaged])).toEqual([
      ["dir/with space.txt", "", "modified"], ["new.txt", "added", ""], ["renamed.txt", "renamed", ""], ["conflict.txt", "conflicted", "conflicted"], ["untracked.txt", "", "untracked"]]);
    expect(r.files[2].from).toBe("old.txt");
  });
  it("marks a detached HEAD and an initial repo", () => {
    expect(parseStatus("# branch.oid (initial)\0# branch.head (detached)\0")).toMatchObject({ detached: true, hasCommits: false });
  });
  it("parses numstat, binary files and renames", () => {
    const m = parseNumstat("3\t1\ta.txt\0-\t-\timg.png\0" + "2\t0\t\0old.txt\0new.txt\0");
    expect(m.get("a.txt")).toEqual({ a: 3, d: 1, binary: false });
    expect(m.get("img.png")?.binary).toBe(true);
    expect(m.get("new.txt")).toEqual({ a: 2, d: 0, binary: false });
  });
  it("refuses paths that escape the repository", () => {
    for (const bad of ["../x", "a/../../x", "/etc/passwd", "", "a\0b"]) expect(() => safeRepoPath(bad)).toThrow();
    expect(safeRepoPath("src/a b.ts")).toBe("src/a b.ts");
    expect(safeRepoPath("-dash.txt")).toBe("-dash.txt"); // safe: always passed after `--`
  });
});

describe("gitStatus / gitDiff on a real repository", () => {
  it("reports a non-repo folder in plain language", async () => {
    const s = await gitStatus(tmp());
    expect(s.repo).toBe(false);
    expect(s.problem).toMatch(/not a Git repository/);
  });

  it("lists staged, unstaged and untracked changes with line counts", async () => {
    const d = repo();
    fs.writeFileSync(path.join(d, "a.txt"), "one\nTWO\nthree\nfour\n"); // +2 -1 unstaged
    fs.writeFileSync(path.join(d, "new.txt"), "x\ny\n"); // untracked, 2 lines
    fs.writeFileSync(path.join(d, "staged.txt"), "s\n");
    git(d, "add", "staged.txt");
    fs.mkdirSync(path.join(d, "sub dir"));
    fs.writeFileSync(path.join(d, "sub dir", "in side.txt"), "q\n");
    const s = await gitStatus(d);
    expect(s).toMatchObject({ repo: true, branch: "main", hasCommits: true });
    const by = Object.fromEntries(s.files.map((f) => [f.path, f]));
    expect(by["a.txt"]).toMatchObject({ unstaged: "modified", staged: "", additions: 2, deletions: 1 });
    expect(by["new.txt"]).toMatchObject({ unstaged: "untracked", additions: 2 });
    expect(by["staged.txt"]).toMatchObject({ staged: "added", additions: 1 });
    expect(by["sub dir/in side.txt"]).toBeTruthy();
  });

  it("works in a repo with no commits yet and from a subfolder", async () => {
    const d = repo(false);
    fs.writeFileSync(path.join(d, "first.txt"), "hello\n");
    git(d, "add", "first.txt");
    const s = await gitStatus(d);
    expect(s).toMatchObject({ repo: true, hasCommits: false });
    expect(s.files[0]).toMatchObject({ path: "first.txt", staged: "added", additions: 1 });
    fs.mkdirSync(path.join(d, "deep"));
    const root = (await gitStatus(path.join(d, "deep"))).root!;
    // Git prints the root with forward slashes (and long names on Windows); compare the real location.
    expect(fs.realpathSync.native(root).toLowerCase()).toBe(fs.realpathSync.native(d).toLowerCase());
  });

  it("shows a unified diff, an all-added diff for untracked files, and flags binary files", async () => {
    const d = repo();
    fs.writeFileSync(path.join(d, "a.txt"), "one\nTWO\nthree\n");
    fs.writeFileSync(path.join(d, "u.txt"), "fresh\n");
    fs.writeFileSync(path.join(d, "bin.dat"), Buffer.from([0, 1, 2, 0, 255]));
    const mod = await gitDiff(d, "a.txt");
    expect(mod.diff).toContain("-two");
    expect(mod.diff).toContain("+TWO");
    const untracked = await gitDiff(d, "u.txt");
    expect(untracked.diff).toContain("+fresh");
    expect(untracked.binary).toBe(false);
    const bin = await gitDiff(d, "bin.dat");
    expect(bin.binary).toBe(true);
    expect(bin.diff).toBe("");
    await expect(gitDiff(d, "../escape")).rejects.toThrow(/Bad file path/);
  });

  it("truncates a huge diff instead of sending it all", async () => {
    const d = repo();
    fs.writeFileSync(path.join(d, "big.txt"), "line of text\n".repeat(60_000));
    const r = await gitDiff(d, "big.txt");
    expect(r.truncated).toBe(true);
    expect(r.diff.length).toBeLessThanOrEqual(200_000);
  });

  it("does not run hooks or shell metacharacters from file names", async () => {
    const d = repo();
    fs.writeFileSync(path.join(d, "$(touch pwned).txt"), "x\n");
    const s = await gitStatus(d);
    expect(s.files.some((f) => f.path === "$(touch pwned).txt")).toBe(true);
    expect(fs.existsSync(path.join(d, "pwned"))).toBe(false);
    expect((await gitDiff(d, "$(touch pwned).txt")).diff).toContain("+x");
    expect(fs.existsSync(path.join(d, "pwned"))).toBe(false);
  });
});

describe("HTTP: project folder and git routes", () => {
  async function boot() {
    const ctx = makeApp();
    srv = await startServer({ app: ctx.app, fake: true, version: "t", token: "secret-token", assets: {} });
    const base = `http://127.0.0.1:${srv.port}`;
    const call = (p: string, init: RequestInit = {}) => fetch(base + p, { ...init, headers: { "x-pheme-token": "secret-token", "content-type": "application/json", ...(init.headers ?? {}) } });
    return { ...ctx, call };
  }

  it("sets, validates and clears a chat's project folder", async () => {
    const { call } = await boot();
    const d = repo();
    const chat = (await (await call("/api/chats", { method: "POST", body: "{}" })).json()) as { id: string };
    let r = await call(`/api/chats/${chat.id}`, { method: "PATCH", body: JSON.stringify({ projectDir: d }) });
    expect(r.status).toBe(200);
    expect(((await r.json()) as { projectDir: string }).projectDir).toBe(d);
    for (const bad of ["relative", path.join(d, "missing"), 5, ""]) {
      r = await call(`/api/chats/${chat.id}`, { method: "PATCH", body: JSON.stringify({ projectDir: bad }) });
      expect(r.status).toBe(400);
    }
    expect(((await (await call(`/api/chats/${chat.id}`)).json()) as { meta: { projectDir: string } }).meta.projectDir).toBe(d); // unchanged by the bad tries
    r = await call(`/api/chats/${chat.id}`, { method: "PATCH", body: JSON.stringify({ projectDir: null }) });
    expect(((await r.json()) as { projectDir?: string }).projectDir).toBeUndefined();
  });

  it("serves status and diff, and says so when there is no folder", async () => {
    const { call } = await boot();
    const d = repo();
    const chat = (await (await call("/api/chats", { method: "POST", body: "{}" })).json()) as { id: string };
    expect(await (await call(`/api/chats/${chat.id}/git`)).json()).toMatchObject({ repo: false, problem: expect.stringMatching(/Choose a project folder/) });
    await call(`/api/chats/${chat.id}`, { method: "PATCH", body: JSON.stringify({ projectDir: d }) });
    fs.writeFileSync(path.join(d, "a.txt"), "changed\n");
    const st = (await (await call(`/api/chats/${chat.id}/git`)).json()) as { files: { path: string }[] };
    expect(st.files.map((f) => f.path)).toContain("a.txt");
    const df = (await (await call(`/api/chats/${chat.id}/git/diff?path=a.txt`)).json()) as { diff: string };
    expect(df.diff).toContain("+changed");
    expect((await call(`/api/chats/${chat.id}/git/diff`)).status).toBe(400);
    expect((await call(`/api/chats/${chat.id}/git/diff?path=..%2F..%2Fetc%2Fpasswd`)).status).toBe(400);
    expect((await call(`/api/chats/nope/git`)).status).toBe(404);
  });
});

describe("project folder reaches the engine", () => {
  it("passes workingDirectory to new sessions, reopens in the new folder after a change, and blocks changes mid-turn", async () => {
    const { app, engine } = makeApp();
    const a = tmp(), b = tmp();
    const chat = app.store.create();
    await app.setProjectDir(chat.id, a);
    app.send(chat.id, "hi");
    await app.drain();
    expect(engine.sessions.at(-1)?.workingDirectory).toBe(a);
    await app.setProjectDir(chat.id, b);
    expect(engine.closed.length).toBeGreaterThan(0); // old session dropped
    app.send(chat.id, "again");
    await app.drain();
    expect(engine.sessions.at(-1)?.workingDirectory).toBe(b);
    // changing the folder while a turn is running is refused
    app.send(chat.id, "run ls"); // waits for approval, so the turn stays busy
    await expect(app.setProjectDir(chat.id, a)).rejects.toThrow(/Wait for the current reply/);
    app.stop(chat.id);
    await app.drain();
    await app.setProjectDir(chat.id, null);
    expect(app.store.get(chat.id)?.projectDir).toBeUndefined();
    await expect(app.setProjectDir("missing", a)).rejects.toThrow(/no such chat/);
    await expect(app.setProjectDir(chat.id, path.join(a, "nope"))).rejects.toThrow(/does not exist/);
  });
});
