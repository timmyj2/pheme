import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { compareUrl, gitCreatePr, gitPush, gitRemoteInfo, parseGithubRemote } from "../src/git.ts";
import { startServer, type RunningServer } from "../src/server.ts";
import { makeApp } from "./helpers.ts";

const posix = process.platform !== "win32";
const dirs: string[] = [];
const saved: Record<string, string | undefined> = {};
const cfgDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "pheme-pushcfg-")));
const binDir = path.join(cfgDir, "bin");
const ghLog = path.join(cfgDir, "gh.log");

/** A fake `gh`: answers the few commands Pheme uses, from files in its own folder, and logs each call. */
function installFakeGh(): void {
  fs.mkdirSync(binDir, { recursive: true });
  const script = `#!/bin/sh
echo "$@" >> "${ghLog}"
D="${cfgDir}"
case "$1 $2" in
  "--version "*) echo "gh version 9.9.9"; exit 0;;
  "auth status") [ -f "$D/gh-signedout" ] && { echo "You are not logged into any GitHub hosts" >&2; exit 1; }; exit 0;;
  "repo view") echo "main"; exit 0;;
  "pr list") cat "$D/gh-prlist.json" 2>/dev/null || echo "[]"; exit 0;;
  "pr create") cat > "$D/gh-body.txt"; [ -f "$D/gh-prfail" ] && { cat "$D/gh-prfail" >&2; exit 1; }; echo "https://github.com/o/r/pull/42"; exit 0;;
esac
echo "unexpected gh call: $@" >&2; exit 2
`;
  fs.writeFileSync(path.join(binDir, "gh"), script, { mode: 0o755 });
}

beforeAll(() => {
  fs.writeFileSync(path.join(cfgDir, "gitconfig"), "[user]\n\tname = Test\n\temail = t@example.com\n[commit]\n\tgpgsign = false\n[init]\n\tdefaultBranch = main\n");
  for (const k of ["GIT_CONFIG_GLOBAL", "GIT_CONFIG_NOSYSTEM", "PATH"]) saved[k] = process.env[k];
  process.env.GIT_CONFIG_GLOBAL = path.join(cfgDir, "gitconfig");
  process.env.GIT_CONFIG_NOSYSTEM = "1";
  if (posix) { installFakeGh(); process.env.PATH = `${binDir}${path.delimiter}${process.env.PATH}`; }
});
afterAll(() => {
  for (const [k, v] of Object.entries(saved)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
  fs.rmSync(cfgDir, { recursive: true, force: true });
});
let srv: RunningServer | undefined;
afterEach(async () => {
  await srv?.close(); srv = undefined;
  for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
  for (const f of ["gh-signedout", "gh-prlist.json", "gh-prfail", "gh.log", "gh-body.txt"]) fs.rmSync(path.join(cfgDir, f), { force: true });
});

const tmp = () => { const d = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "pheme-gp-"))); dirs.push(d); return d; };
const git = (cwd: string, ...a: string[]) => execFileSync("git", a, { cwd, encoding: "utf8", env: process.env }).trim();
/** A repo on a feature branch with one extra commit, and a local bare repo as its origin. */
function repoWithRemote(branch = "feat/x") {
  const bare = tmp(); git(bare, "init", "-q", "--bare", "-b", "main");
  const d = tmp(); git(d, "init", "-q", "-b", "main");
  fs.writeFileSync(path.join(d, "a.txt"), "1\n"); git(d, "add", "."); git(d, "commit", "-qm", "init");
  git(d, "remote", "add", "origin", bare); git(d, "push", "-q", "-u", "origin", "main");
  if (branch !== "main") { git(d, "switch", "-q", "-c", branch); fs.writeFileSync(path.join(d, "b.txt"), "2\n"); git(d, "add", "."); git(d, "commit", "-qm", "work"); }
  return { d, bare };
}
const ghCalls = () => (fs.existsSync(ghLog) ? fs.readFileSync(ghLog, "utf8").trim().split("\n") : []);

describe("remote URL helpers", () => {
  it("parses https, ssh and scp-style GitHub remotes and rejects the rest", () => {
    for (const u of ["https://github.com/o/r.git", "https://github.com/o/r", "https://user@github.com/o/r.git", "git@github.com:o/r.git", "ssh://git@github.com/o/r.git", "https://github.com/o/r/"]) expect(parseGithubRemote(u), u).toEqual({ host: "github.com", owner: "o", repo: "r" });
    expect(parseGithubRemote("https://ghe.corp.example/team/proj.git")).toMatchObject({ host: "ghe.corp.example", owner: "team", repo: "proj" });
    for (const u of ["", "/local/path/repo.git", "C:\\repos\\x", "not a url"]) expect(parseGithubRemote(u), u).toBeNull();
  });
  it("builds a safe compare link and escapes odd branch names", () => {
    expect(compareUrl("git@github.com:o/r.git", "main", "feat/x")).toBe("https://github.com/o/r/compare/main...feat/x?expand=1");
    expect(compareUrl("https://github.com/o/r", "main", "a b#c?d")).toBe("https://github.com/o/r/compare/main...a%20b%23c%3Fd?expand=1");
    expect(compareUrl("/local/bare", "main", "x")).toBeNull();
  });
});

describe("gitPush", () => {
  it("pushes the current branch with an upstream and reports it", async () => {
    const { d, bare } = repoWithRemote();
    const r = await gitPush(d);
    expect(r).toMatchObject({ branch: "feat/x", remote: "origin" });
    expect(git(bare, "branch", "--list", "feat/x")).toContain("feat/x");
    expect(git(d, "rev-parse", "--abbrev-ref", "feat/x@{upstream}")).toBe("origin/feat/x");
    expect((await gitRemoteInfo(d)).ahead).toBe(0);
  });

  it("refuses main/master, a detached HEAD, no commits, no remote — with plain messages", async () => {
    const { d } = repoWithRemote("main");
    await expect(gitPush(d)).rejects.toThrow(/will not push main directly/);
    git(d, "switch", "-q", "-c", "master-ish"); git(d, "checkout", "-q", "--detach");
    await expect(gitPush(d)).rejects.toThrow(/detached/);
    const noRemote = tmp(); git(noRemote, "init", "-q", "-b", "feat"); fs.writeFileSync(path.join(noRemote, "x"), "1"); git(noRemote, "add", "."); git(noRemote, "commit", "-qm", "c");
    await expect(gitPush(noRemote)).rejects.toThrow(/no remote/);
    const empty = tmp(); git(empty, "init", "-q", "-b", "feat");
    await expect(gitPush(empty)).rejects.toThrow(/nothing to push/);
  });

  it("never force-pushes: a diverged branch is rejected with advice, and the remote is untouched", async () => {
    const { d, bare } = repoWithRemote();
    await gitPush(d);
    const other = tmp(); git(other, "clone", "-q", bare, "."); git(other, "switch", "-q", "feat/x");
    fs.writeFileSync(path.join(other, "c.txt"), "theirs\n"); git(other, "add", "."); git(other, "commit", "-qm", "theirs"); git(other, "push", "-q");
    const theirs = git(bare, "rev-parse", "feat/x");
    fs.writeFileSync(path.join(d, "d.txt"), "mine\n"); git(d, "add", "."); git(d, "commit", "-qm", "mine");
    await expect(gitPush(d)).rejects.toThrow(/never force-pushes/);
    expect(git(bare, "rev-parse", "feat/x")).toBe(theirs);
  });

  it("explains an unreachable or missing remote", async () => {
    const { d } = repoWithRemote();
    git(d, "remote", "set-url", "origin", path.join(os.tmpdir(), "definitely-not-here-xyz.git"));
    await expect(gitPush(d)).rejects.toThrow(/does not exist or you do not have access|Could not reach/);
  });

  it("handles branch names with odd characters", async () => {
    const { d, bare } = repoWithRemote("feat/ünï-cødé_1.2");
    await gitPush(d);
    expect(git(bare, "branch", "--list")).toContain("feat/ünï-cødé_1.2");
  });
});

describe.runIf(posix)("gitRemoteInfo and gitCreatePr (fake gh)", () => {
  function ghRepo() {
    const r = repoWithRemote();
    git(r.d, "remote", "set-url", "origin", "https://github.com/o/r.git");
    git(r.d, "remote", "set-url", "--push", "origin", r.bare); // fetches look like GitHub, pushes go to the local bare repo
    return r;
  }

  it("reports github, gh state, default base and a compare link", async () => {
    const { d } = ghRepo();
    const i = await gitRemoteInfo(d);
    expect(i).toMatchObject({ github: true, ghInstalled: true, ghSignedIn: true, branch: "feat/x", defaultBase: "main", remote: "origin" });
    expect(i.compareUrl).toBe("https://github.com/o/r/compare/main...feat/x?expand=1");
    expect(i.pr).toBeUndefined();
    expect(i.problem).toBeUndefined();
  });

  it("summarises an open PR and its checks", async () => {
    const { d } = ghRepo();
    const mk = (rollup: unknown[]) => fs.writeFileSync(path.join(cfgDir, "gh-prlist.json"), JSON.stringify([{ number: 7, url: "https://github.com/o/r/pull/7", title: "T", state: "OPEN", isDraft: false, statusCheckRollup: rollup }]));
    mk([{ status: "COMPLETED", conclusion: "SUCCESS" }, { status: "COMPLETED", conclusion: "SUCCESS" }]);
    expect((await gitRemoteInfo(d)).pr).toMatchObject({ number: 7, checks: "passing" });
    mk([{ status: "COMPLETED", conclusion: "SUCCESS" }, { status: "IN_PROGRESS", conclusion: "" }]);
    expect((await gitRemoteInfo(d)).pr?.checks).toBe("pending");
    mk([{ status: "COMPLETED", conclusion: "FAILURE" }, { status: "IN_PROGRESS" }]);
    expect((await gitRemoteInfo(d)).pr?.checks).toBe("failing");
    mk([]);
    expect((await gitRemoteInfo(d)).pr?.checks).toBe("none");
    fs.writeFileSync(path.join(cfgDir, "gh-prlist.json"), "not json at all");
    expect((await gitRemoteInfo(d)).pr).toBeUndefined(); // garbage from gh must not crash anything
  });

  it("says when gh is signed out, and when the remote is not GitHub", async () => {
    const { d } = ghRepo();
    fs.writeFileSync(path.join(cfgDir, "gh-signedout"), "1");
    expect(await gitRemoteInfo(d)).toMatchObject({ ghInstalled: true, ghSignedIn: false });
    git(d, "remote", "set-url", "origin", "https://gitlab.com/o/r.git");
    expect(await gitRemoteInfo(d)).toMatchObject({ github: false, ghSignedIn: false });
  });

  it("creates a PR: pushed branch, title and body passed safely, link returned", async () => {
    const { d } = ghRepo();
    await gitPush(d);
    const body = 'Body with "quotes", $(touch /tmp/pr-pwned) and `ticks`\n\n- list';
    const r = await gitCreatePr(d, { title: 'Fix "it" $(x)', body, draft: true });
    expect(r).toEqual({ url: "https://github.com/o/r/pull/42", number: 42 });
    expect(fs.readFileSync(path.join(cfgDir, "gh-body.txt"), "utf8")).toBe(body);
    const call = ghCalls().find((l) => l.startsWith("pr create"))!;
    expect(call).toContain("--draft");
    expect(call).toContain('--title Fix "it" $(x)');
    expect(call).toContain("--base main --head feat/x");
    expect(fs.existsSync("/tmp/pr-pwned")).toBe(false);
  });

  it("refuses a PR before pushing, with unpushed commits, with an empty/huge title, when one is open, when gh is signed out", async () => {
    const { d } = ghRepo();
    await expect(gitCreatePr(d, { title: "T" })).rejects.toThrow(/Push the branch first/);
    await gitPush(d);
    fs.writeFileSync(path.join(d, "n.txt"), "1\n"); git(d, "add", "."); git(d, "commit", "-qm", "later");
    await expect(gitCreatePr(d, { title: "T" })).rejects.toThrow(/1 commit is not pushed yet/);
    await gitPush(d);
    await expect(gitCreatePr(d, { title: "  " })).rejects.toThrow(/Write a title/);
    await expect(gitCreatePr(d, { title: "x".repeat(257) })).rejects.toThrow(/too long/);
    await expect(gitCreatePr(d, { title: "T", base: "bad name" })).rejects.toThrow(/not a valid branch name/);
    await expect(gitCreatePr(d, { title: "T", base: "feat/x" })).rejects.toThrow(/cannot be the same/);
    fs.writeFileSync(path.join(cfgDir, "gh-prlist.json"), JSON.stringify([{ number: 7, url: "https://github.com/o/r/pull/7", title: "T", state: "OPEN", isDraft: false, statusCheckRollup: [] }]));
    await expect(gitCreatePr(d, { title: "T" })).rejects.toThrow(/already open.*pull\/7/);
    fs.rmSync(path.join(cfgDir, "gh-prlist.json"));
    fs.writeFileSync(path.join(cfgDir, "gh-signedout"), "1");
    await expect(gitCreatePr(d, { title: "T" })).rejects.toThrow(/not signed in/);
  });

  it("turns gh failures into short readable messages and never trusts a missing URL", async () => {
    const { d } = ghRepo();
    await gitPush(d);
    fs.writeFileSync(path.join(cfgDir, "gh-prfail"), "pull request create failed: GraphQL: No commits between main and feat/x (createPullRequest)\n");
    await expect(gitCreatePr(d, { title: "T" })).rejects.toThrow(/nothing to propose/);
    fs.writeFileSync(path.join(cfgDir, "gh-prfail"), "HTTP 502: Bad Gateway\n");
    await expect(gitCreatePr(d, { title: "T" })).rejects.toThrow(/502/);
  });

  it("works over HTTP: remote info, push, PR, and is refused while a reply runs", async () => {
    const ctx = makeApp();
    srv = await startServer({ app: ctx.app, fake: true, version: "t", token: "secret-token", assets: {} });
    const call = (p: string, body?: unknown) => fetch(`http://127.0.0.1:${srv!.port}${p}`, { method: body === undefined ? "GET" : "POST", headers: { "x-pheme-token": "secret-token", "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
    const chat = ctx.app.store.create();
    expect((await call(`/api/chats/${chat.id}/git/push`, {})).status).toBe(400); // no folder yet
    const { d } = ghRepo();
    await ctx.app.setProjectDir(chat.id, d);
    expect(((await (await call(`/api/chats/${chat.id}/git/remote`)).json()) as { github: boolean }).github).toBe(true);
    ctx.app.send(chat.id, "run ls");
    expect((await call(`/api/chats/${chat.id}/git/push`, {})).status).toBe(409);
    ctx.app.stop(chat.id); await ctx.app.drain();
    expect((await call(`/api/chats/${chat.id}/git/push`, {})).status).toBe(200);
    const pr = await call(`/api/chats/${chat.id}/git/pr`, { title: "Via HTTP", body: "b" });
    expect(pr.status).toBe(200);
    expect(((await pr.json()) as { url: string }).url).toMatch(/pull\/42/);
    expect((await call(`/api/chats/${chat.id}/git/pr`, { body: "no title" })).status).toBe(400);
  });
});
