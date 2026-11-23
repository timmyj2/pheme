import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { gitPrDetail, normalizeChecks } from "../src/git.ts";

const posix = process.platform !== "win32";
const saved: Record<string, string | undefined> = {};
const cfgDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "pheme-prd-")));
const binDir = path.join(cfgDir, "bin");

beforeAll(() => {
  fs.writeFileSync(path.join(cfgDir, "gitconfig"), "[user]\n\tname = T\n\temail = t@example.com\n[commit]\n\tgpgsign = false\n[init]\n\tdefaultBranch = main\n");
  for (const k of ["GIT_CONFIG_GLOBAL", "GIT_CONFIG_NOSYSTEM", "PATH"]) saved[k] = process.env[k];
  process.env.GIT_CONFIG_GLOBAL = path.join(cfgDir, "gitconfig");
  process.env.GIT_CONFIG_NOSYSTEM = "1";
  if (posix) {
    fs.mkdirSync(binDir, { recursive: true });
    fs.writeFileSync(path.join(binDir, "gh"), `#!/bin/sh\nD="${cfgDir}"\ncase "$1 $2" in\n  "pr view") [ -f "$D/err" ] && { cat "$D/err" >&2; exit 1; }; cat "$D/view.json"; exit 0;;\nesac\nexit 2\n`, { mode: 0o755 });
    process.env.PATH = `${binDir}${path.delimiter}${process.env.PATH}`;
  }
});
afterAll(() => {
  for (const [k, v] of Object.entries(saved)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
  fs.rmSync(cfgDir, { recursive: true, force: true });
});

describe("normalizeChecks", () => {
  it("merges check runs and commit statuses, puts failures first, and keeps only safe links", () => {
    const { checks } = normalizeChecks([
      { name: "lint", status: "COMPLETED", conclusion: "SUCCESS", detailsUrl: "https://github.com/o/r/actions/runs/1", workflowName: "CI" },
      { name: "test (windows)", status: "COMPLETED", conclusion: "FAILURE", detailsUrl: "javascript:alert(1)", workflowName: "CI" },
      { name: "test (mac)", status: "IN_PROGRESS", conclusion: "", detailsUrl: "https://github.com/x" },
      { context: "ci/legacy", state: "SUCCESS", targetUrl: "https://ci.example.com/1" },
      { context: "ci/old", state: "PENDING", targetUrl: "data:text/html,hi" },
      { name: "docs", status: "COMPLETED", conclusion: "SKIPPED" },
      { name: "" }, null, 5, "x",
    ]);
    expect(checks.map((c) => `${c.state}:${c.name}`)).toEqual(["failing:test (windows)", "pending:ci/old", "pending:test (mac)", "passing:ci/legacy", "passing:lint", "skipped:docs"]);
    expect(checks.find((c) => c.name === "test (windows)")!.url).toBeUndefined();
    expect(checks.find((c) => c.name === "ci/old")!.url).toBeUndefined();
    expect(checks.find((c) => c.name === "lint")).toMatchObject({ workflow: "CI", url: "https://github.com/o/r/actions/runs/1" });
  });
  it("copes with nothing, junk, and a huge list (capped, with a count of the rest)", () => {
    expect(normalizeChecks(undefined)).toEqual({ checks: [], more: 0 });
    expect(normalizeChecks("x")).toEqual({ checks: [], more: 0 });
    const big = normalizeChecks(Array.from({ length: 150 }, (_, i) => ({ name: `c${i}`, status: "COMPLETED", conclusion: "SUCCESS" })));
    expect(big.checks).toHaveLength(60);
    expect(big.more).toBe(90);
  });
});

describe.runIf(posix)("gitPrDetail", () => {
  const dirs: string[] = [];
  const git = (cwd: string, ...a: string[]) => execFileSync("git", a, { cwd, encoding: "utf8", env: process.env }).trim();
  function repo(branch = "feat/x"): string {
    const d = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "pheme-prd-r-"))); dirs.push(d);
    git(d, "init", "-q", "-b", "main"); fs.writeFileSync(path.join(d, "a"), "1"); git(d, "add", "."); git(d, "commit", "-qm", "i");
    git(d, "switch", "-q", "-c", branch);
    return d;
  }
  const view = (o: object) => { fs.rmSync(path.join(cfgDir, "err"), { force: true }); fs.writeFileSync(path.join(cfgDir, "view.json"), JSON.stringify(o)); };
  afterAll(() => { for (const d of dirs) fs.rmSync(d, { recursive: true, force: true }); });

  it("reads state, review, mergeability, size and checks", async () => {
    view({ number: 7, url: "https://github.com/o/r/pull/7", title: "Add x", state: "OPEN", isDraft: false, reviewDecision: "APPROVED", mergeable: "MERGEABLE", mergeStateStatus: "CLEAN", baseRefName: "main", headRefName: "feat/x", additions: 10, deletions: 2, changedFiles: 3, statusCheckRollup: [{ name: "t", status: "COMPLETED", conclusion: "SUCCESS" }] });
    const pr = await gitPrDetail(repo());
    expect(pr).toMatchObject({ number: 7, state: "open", draft: false, review: "approved", mergeable: "mergeable", mergeState: "clean", base: "main", head: "feat/x", additions: 10, deletions: 2, changedFiles: 3, checksSummary: "passing" });
    expect(pr!.checks).toHaveLength(1);
  });
  it("reports merged and closed PRs, conflicts, and unknown values without crashing", async () => {
    view({ number: 8, url: "https://github.com/o/r/pull/8", title: "t", state: "MERGED", mergeable: "CONFLICTING", reviewDecision: "", additions: "x", changedFiles: -4 });
    const pr = await gitPrDetail(repo());
    expect(pr).toMatchObject({ state: "merged", mergeable: "conflicting", review: "none", additions: 0, changedFiles: 0, checks: [], checksSummary: "none" });
  });
  it("returns null when the branch has no PR, on main-less detached HEAD, outside a repo, and for an unsafe address", async () => {
    const d = repo();
    fs.writeFileSync(path.join(cfgDir, "err"), 'no pull requests found for branch "feat/x"');
    expect(await gitPrDetail(d)).toBeNull();
    view({ number: 1, url: "javascript:alert(1)", title: "t", state: "OPEN" });
    expect(await gitPrDetail(d)).toBeNull();
    fs.writeFileSync(path.join(cfgDir, "err"), "none of the git remotes configured for this repository point to a known GitHub host. To tell gh about a new GitHub host, please use `gh auth login`");
    expect(await gitPrDetail(d)).toBeNull(); // a repo with no GitHub remote just has no PR
    git(d, "checkout", "-q", "--detach");
    expect(await gitPrDetail(d)).toBeNull();
    expect(await gitPrDetail(os.tmpdir())).toBeNull();
  });
  it("turns other gh failures into a readable 502 and unreadable output into a clear message", async () => {
    const d = repo();
    fs.writeFileSync(path.join(cfgDir, "err"), "HTTP 502: Bad Gateway\nmore");
    await expect(gitPrDetail(d)).rejects.toMatchObject({ status: 502, message: "HTTP 502: Bad Gateway" });
    fs.rmSync(path.join(cfgDir, "err")); fs.writeFileSync(path.join(cfgDir, "view.json"), "not json");
    await expect(gitPrDetail(d)).rejects.toMatchObject({ status: 502 });
  });
});
