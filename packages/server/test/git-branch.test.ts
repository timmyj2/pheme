import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { gitBranches, gitStashApply, gitStashDrop, gitStashList, gitStashPush, gitSwitch } from "../src/gitbranch.ts";

const saved: Record<string, string | undefined> = {};
const cfgDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "pheme-gb-")));
const dirs: string[] = [];
beforeAll(() => {
  fs.writeFileSync(path.join(cfgDir, "gitconfig"), "[user]\n\tname = T\n\temail = t@example.com\n[commit]\n\tgpgsign = false\n[init]\n\tdefaultBranch = main\n");
  for (const k of ["GIT_CONFIG_GLOBAL", "GIT_CONFIG_NOSYSTEM"]) saved[k] = process.env[k];
  process.env.GIT_CONFIG_GLOBAL = path.join(cfgDir, "gitconfig");
  process.env.GIT_CONFIG_NOSYSTEM = "1";
});
afterAll(() => {
  for (const [k, v] of Object.entries(saved)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
  fs.rmSync(cfgDir, { recursive: true, force: true });
});
afterEach(() => { for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true }); });

const git = (cwd: string, ...a: string[]) => execFileSync("git", a, { cwd, encoding: "utf8", env: process.env }).trim();
const w = (d: string, f: string, c: string) => { fs.mkdirSync(path.dirname(path.join(d, f)), { recursive: true }); fs.writeFileSync(path.join(d, f), c); };
const r = (d: string, f: string) => fs.readFileSync(path.join(d, f), "utf8");
function repo(): string {
  const d = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "pheme-gb-r-"))); dirs.push(d);
  git(d, "init", "-q", "-b", "main"); w(d, "a.txt", "base\n"); git(d, "add", "."); git(d, "commit", "-qm", "init");
  return d;
}
/** main and `other` disagree about a.txt, so an edit to a.txt on main cannot move to other. */
function diverged(): string {
  const d = repo();
  git(d, "switch", "-q", "-c", "other"); w(d, "a.txt", "other version\n"); git(d, "commit", "-qam", "other change"); git(d, "switch", "-q", "main");
  return d;
}

describe("gitBranches", () => {
  it("lists local branches, current first, with upstream-free info; detached HEAD has no current", async () => {
    const d = diverged();
    const b = await gitBranches(d);
    expect(b.current).toBe("main");
    expect(b.branches.map((x) => x.name)).toEqual(["main", "other"]);
    expect(b.branches[0]).toMatchObject({ current: true, subject: "init" });
    expect(b.branches[1].subject).toBe("other change");
    git(d, "checkout", "-q", "--detach");
    const dt = await gitBranches(d);
    expect(dt.detached).toBe(true);
    expect(dt.current).toBeUndefined();
    expect(dt.branches.some((x) => x.current)).toBe(false);
  });
  it("is a clear error outside a repository", async () => {
    await expect(gitBranches(os.tmpdir())).rejects.toMatchObject({ status: 409 });
  });
});

describe("gitSwitch", () => {
  it("creates a branch from here and keeps uncommitted work (staged, unstaged and untracked)", async () => {
    const d = repo(); w(d, "a.txt", "edited\n"); w(d, "new.txt", "n\n"); w(d, "s.txt", "s\n"); git(d, "add", "s.txt");
    expect(await gitSwitch(d, { name: "feat/x", create: true })).toEqual({ branch: "feat/x", created: true, stashed: false });
    expect(git(d, "rev-parse", "--abbrev-ref", "HEAD")).toBe("feat/x");
    expect(r(d, "a.txt")).toBe("edited\n"); expect(r(d, "new.txt")).toBe("n\n");
    expect(git(d, "status", "--porcelain").split("\n").sort()).toEqual(["?? new.txt", "A  s.txt", "M a.txt"]); // (the helper trims the leading space of ' M')
  });
  it("refuses bad names, existing names, unknown branches, the branch you are on, and a repo with no commits", async () => {
    const d = repo();
    for (const bad of ["", "-x", "a b", "a..b", "x".repeat(300), "--help", "a~1", "@{u}", "a\u0000b", "a\u0007b", "a\nb", "a\u007fb"]) await expect(gitSwitch(d, { name: bad, create: true }), bad).rejects.toMatchObject({ status: 400 });
    await expect(gitSwitch(d, { name: "main", create: true })).rejects.toMatchObject({ status: 409 });
    await expect(gitSwitch(d, { name: "nope" })).rejects.toMatchObject({ status: 404 });
    await expect(gitSwitch(d, { name: "main" })).rejects.toMatchObject({ status: 409, message: /already on main/ });
    const empty = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "pheme-gb-e-"))); dirs.push(empty); git(empty, "init", "-q", "-b", "main");
    await expect(gitSwitch(empty, { name: "x", create: true })).rejects.toMatchObject({ status: 409, message: /no commits/ });
  });
  it("switching with harmless changes carries them along, as git does", async () => {
    const d = diverged(); w(d, "other-file.txt", "keep me\n");
    await gitSwitch(d, { name: "other" });
    expect(git(d, "rev-parse", "--abbrev-ref", "HEAD")).toBe("other");
    expect(r(d, "other-file.txt")).toBe("keep me\n");
  });
  it("when your changes would be overwritten: plain 409, nothing changes", async () => {
    const d = diverged(); w(d, "a.txt", "my precious edit\n");
    await expect(gitSwitch(d, { name: "other" })).rejects.toMatchObject({ status: 409, message: /would be overwritten.*stash/ });
    expect(git(d, "rev-parse", "--abbrev-ref", "HEAD")).toBe("main");
    expect(r(d, "a.txt")).toBe("my precious edit\n");
  });
  it("with stash: sets changes aside, switches, and the stash holds the work", async () => {
    const d = diverged(); w(d, "a.txt", "my precious edit\n"); w(d, "u.txt", "untracked\n");
    expect(await gitSwitch(d, { name: "other", stash: true })).toMatchObject({ branch: "other", stashed: true });
    expect(r(d, "a.txt")).toBe("other version\n");
    expect(fs.existsSync(path.join(d, "u.txt"))).toBe(false);
    const { stashes } = await gitStashList(d);
    expect(stashes).toHaveLength(1);
    expect(stashes[0].message).toMatch(/set aside before switching to other/);
    expect(stashes[0].branch).toBe("main");
    await gitSwitch(d, { name: "main" });
    await gitStashApply(d, stashes[0].sha, true);
    expect(r(d, "a.txt")).toBe("my precious edit\n"); expect(r(d, "u.txt")).toBe("untracked\n");
    expect((await gitStashList(d)).stashes).toHaveLength(0);
  });
  it("if the switch fails after stashing, the work is put back exactly", async () => {
    const d = repo(); w(d, "a.txt", "edit\n"); w(d, "u.txt", "u\n"); git(d, "add", "a.txt");
    // a branch whose ref exists but cannot be checked out cleanly is hard to fake portably; a name git accepts but that is not a branch is refused first
    await expect(gitSwitch(d, { name: "ghost", stash: true })).rejects.toMatchObject({ status: 404 });
    expect(git(d, "status", "--porcelain").split("\n").sort()).toEqual(["?? u.txt", "M  a.txt"]);
    expect((await gitStashList(d)).stashes).toHaveLength(0);
  });
  it("refuses during a merge with conflicts", async () => {
    const d = diverged(); w(d, "a.txt", "main side\n"); git(d, "commit", "-qam", "main change");
    try { git(d, "merge", "other"); } catch { /* conflict expected */ }
    await expect(gitSwitch(d, { name: "other" })).rejects.toMatchObject({ status: 409, message: /merge, rebase or cherry-pick is in progress/ });
    await expect(gitStashPush(d, {})).rejects.toMatchObject({ status: 409 });
  });
  it("two switches at once are serialized and neither corrupts the repo", async () => {
    const d = repo();
    const res = await Promise.allSettled([gitSwitch(d, { name: "a", create: true }), gitSwitch(d, { name: "b", create: true })]);
    expect(res.every((x) => x.status === "fulfilled")).toBe(true);
    expect(git(d, "branch", "--list").split("\n").map((l) => l.replace("*", "").trim()).sort()).toEqual(["a", "b", "main"]);
    git(d, "fsck", "--no-progress");
  });
});

describe("stash", () => {
  it("sets changes aside (including untracked), lists them, and says so when there is nothing", async () => {
    const d = repo();
    await expect(gitStashPush(d, {})).rejects.toMatchObject({ status: 409, message: /no changes/ });
    w(d, "a.txt", "x\n"); w(d, "n.txt", "n\n");
    await gitStashPush(d, { message: "line1\nline2 with $(touch /tmp/pwned) `x`" });
    expect(git(d, "status", "--porcelain")).toBe("");
    const s = (await gitStashList(d)).stashes;
    expect(s[0].message).toBe("line1 line2 with $(touch /tmp/pwned) `x`");
    expect(fs.existsSync("/tmp/pwned")).toBe(false);
  });
  it("can leave untracked files in place", async () => {
    const d = repo(); w(d, "a.txt", "x\n"); w(d, "n.txt", "n\n");
    await gitStashPush(d, { includeUntracked: false });
    expect(git(d, "status", "--porcelain")).toBe("?? n.txt");
  });
  it("picks stashes by id, so a changed list cannot hit the wrong one; unknown or malformed ids are refused", async () => {
    const d = repo();
    w(d, "a.txt", "one\n"); await gitStashPush(d, { message: "first" });
    w(d, "a.txt", "two\n"); await gitStashPush(d, { message: "second" });
    const [second, first] = (await gitStashList(d)).stashes;
    expect([second.message, first.message]).toEqual(["second", "first"]);
    await gitStashApply(d, first.sha, true); // apply the OLDER one, by id
    expect(r(d, "a.txt")).toBe("one\n");
    expect((await gitStashList(d)).stashes.map((x) => x.message)).toEqual(["second"]);
    await expect(gitStashApply(d, first.sha, true)).rejects.toMatchObject({ status: 404 }); // already gone
    for (const bad of ["", "abc", "stash@{0}", "--all", "z".repeat(40)]) await expect(gitStashDrop(d, bad), bad).rejects.toMatchObject({ status: bad.length === 40 ? 400 : 400 });
  });
  it("restoring onto overlapping changes is refused and changes nothing", async () => {
    const d = repo(); w(d, "a.txt", "stashed\n"); await gitStashPush(d, {});
    w(d, "a.txt", "different now\n");
    const [s] = (await gitStashList(d)).stashes;
    await expect(gitStashApply(d, s.sha, true)).rejects.toMatchObject({ status: 409 });
    expect(r(d, "a.txt")).toBe("different now\n");
    expect((await gitStashList(d)).stashes).toHaveLength(1);
  });
  it("a restore that conflicts keeps the stash so nothing is lost", async () => {
    const d = repo(); w(d, "a.txt", "stashed\n"); await gitStashPush(d, {});
    w(d, "a.txt", "committed elsewhere\n"); git(d, "commit", "-qam", "moved on");
    const [s] = (await gitStashList(d)).stashes;
    await expect(gitStashApply(d, s.sha, true)).rejects.toMatchObject({ status: 409, message: /conflict/i });
    expect((await gitStashList(d)).stashes).toHaveLength(1);
  });
  it("deletes only the chosen stash", async () => {
    const d = repo();
    w(d, "a.txt", "1\n"); await gitStashPush(d, { message: "keep" }); w(d, "a.txt", "2\n"); await gitStashPush(d, { message: "delete" });
    const [del] = (await gitStashList(d)).stashes;
    await gitStashDrop(d, del.sha);
    expect((await gitStashList(d)).stashes.map((x) => x.message)).toEqual(["keep"]);
  });
});
