import { existsSync } from "node:fs";
import path from "node:path";
import { HttpError } from "./http-error.ts";
import { gitStatus, lockMessage, runGit, validBranchName, withRepoLock } from "./git.ts";

export interface BranchInfo {
  name: string;
  current: boolean;
  upstream?: string;
  sha: string;
  subject: string;
  /** Unix seconds of the last commit. */
  date: number;
}

export interface BranchList {
  current?: string;
  detached: boolean;
  branches: BranchInfo[];
  /** True when the repository has more branches than we list. */
  more: number;
}

export interface StashEntry {
  /** The stash's own commit id. Used to pick it, so a changed list can never make us act on the wrong one. */
  sha: string;
  message: string;
  date: number;
  /** Branch it was made on, when git recorded it. */
  branch?: string;
}

const MAX_BRANCHES = 200;
const MAX_STASHES = 50;

async function rootOf(cwd: string): Promise<string> {
  const st = await gitStatus(cwd);
  if (!st.repo || !st.root) throw new HttpError(409, st.problem ?? "This folder is not a Git repository.");
  return st.root;
}

export async function gitBranches(cwd: string): Promise<BranchList> {
  const st = await gitStatus(cwd);
  if (!st.repo || !st.root) throw new HttpError(409, st.problem ?? "This folder is not a Git repository.");
  const r = await runGit(st.root, ["for-each-ref", "--sort=-committerdate", "--format=%(refname:short)%09%(objectname:short)%09%(upstream:short)%09%(committerdate:unix)%09%(subject)", "refs/heads"]);
  const all: BranchInfo[] = [];
  for (const line of r.stdout.split("\n")) {
    if (!line) continue;
    const [name, sha, upstream, date, ...subj] = line.split("\t");
    if (!name) continue;
    all.push({ name, sha, upstream: upstream || undefined, date: Number(date) || 0, subject: subj.join("\t").slice(0, 200), current: !st.detached && name === st.branch });
  }
  // current branch first, then newest
  all.sort((a, b) => Number(b.current) - Number(a.current) || b.date - a.date);
  return { current: st.detached ? undefined : st.branch, detached: !!st.detached, branches: all.slice(0, MAX_BRANCHES), more: Math.max(0, all.length - MAX_BRANCHES) };
}

export interface SwitchRequest {
  name: string;
  /** Make a new branch from where you are now, and switch to it. */
  create?: boolean;
  /** Set unsaved changes aside (stash) first, so the switch cannot touch them. */
  stash?: boolean;
}

export interface SwitchResult { branch: string; created: boolean; stashed: boolean }

async function guardIdle(root: string): Promise<void> {
  const g = (await runGit(root, ["rev-parse", "--absolute-git-dir"])).stdout.trim();
  if (g) {
    for (const marker of ["MERGE_HEAD", "rebase-merge", "rebase-apply", "CHERRY_PICK_HEAD", "REVERT_HEAD"]) {
      if (existsSync(path.join(g, marker))) throw new HttpError(409, "A merge, rebase or cherry-pick is in progress in this folder. Finish or abort it in a terminal first.");
    }
  }
  const st = await gitStatus(root);
  if (st.files.some((f) => f.staged === "conflicted" || f.unstaged === "conflicted")) throw new HttpError(409, "Some files have merge conflicts. Resolve them first.");
}

export function gitSwitch(cwd: string, req: SwitchRequest): Promise<SwitchResult> {
  return withRepoLock(cwd, async () => {
    const root = await rootOf(cwd);
    const name = typeof req.name === "string" ? req.name.trim() : "";
    if (!(await validBranchName(root, name))) throw new HttpError(400, `"${name}" is not a valid branch name.`);
    await guardIdle(root);
    const st = await gitStatus(root);
    if (!st.hasCommits) throw new HttpError(409, "This repository has no commits yet, so there is nothing to branch from. Make a first commit.");
    const exists = (await runGit(root, ["show-ref", "--verify", "--quiet", `refs/heads/${name}`])).ok;
    if (req.create && exists) throw new HttpError(409, `A branch called "${name}" already exists. Pick another name, or switch to it.`);
    if (!req.create && !exists) throw new HttpError(404, `There is no branch called "${name}".`);
    if (!req.create && !st.detached && st.branch === name) throw new HttpError(409, `You are already on ${name}.`);

    // A new branch starts from here with your changes still in place: nothing to protect, nothing can conflict.
    if (req.create) {
      const r = await runGit(root, ["switch", "-c", name]);
      if (!r.ok) throw new HttpError(lockMessage(r.stderr) ? 409 : 500, lockMessage(r.stderr) ?? (r.stderr || "Could not create the branch."));
      return { branch: name, created: true, stashed: false };
    }

    let stashed = false;
    if (req.stash && st.files.length > 0) {
      const target = await runGit(root, ["stash", "push", "--include-untracked", "-m", `Pheme: set aside before switching to ${name}`], { literal: false });
      if (!target.ok) throw new HttpError(lockMessage(target.stderr) ? 409 : 500, lockMessage(target.stderr) ?? (target.stderr || "Could not set your changes aside."));
      stashed = !/No local changes/i.test(target.stdout);
    }
    const r = await runGit(root, ["switch", name]);
    if (!r.ok) {
      if (stashed) await runGit(root, ["stash", "pop", "--index"], { literal: false }); // put everything back exactly as it was
      const why = r.stderr;
      if (lockMessage(why)) throw new HttpError(409, lockMessage(why)!);
      if (/would be overwritten|local changes|untracked working tree files/i.test(why)) {
        throw new HttpError(409, `Your unsaved changes would be overwritten by ${name}. Set them aside (stash) and switch, or commit them first.`);
      }
      throw new HttpError(409, why.split("\n").slice(0, 3).join(" ").slice(0, 400) || "Could not switch branches.");
    }
    return { branch: name, created: false, stashed };
  });
}

export async function gitStashList(cwd: string): Promise<{ stashes: StashEntry[]; more: number }> {
  const root = await rootOf(cwd);
  const r = await runGit(root, ["stash", "list", "--format=%H%x09%ct%x09%gs"]);
  const all: StashEntry[] = [];
  for (const line of r.stdout.split("\n")) {
    if (!line) continue;
    const [sha, ct, ...rest] = line.split("\t");
    const subject = rest.join("\t");
    // git writes "On <branch>: <message>" or "WIP on <branch>: <sha> <subject>"
    const m = /^(?:WIP on|On) ([^:]+): (.*)$/.exec(subject);
    all.push({ sha, date: Number(ct) || 0, message: (m ? m[2] : subject).slice(0, 200), branch: m?.[1] });
  }
  return { stashes: all.slice(0, MAX_STASHES), more: Math.max(0, all.length - MAX_STASHES) };
}

export function gitStashPush(cwd: string, req: { message?: string; includeUntracked?: boolean }): Promise<{ stashed: true }> {
  return withRepoLock(cwd, async () => {
    const root = await rootOf(cwd);
    await guardIdle(root);
    const st = await gitStatus(root);
    if (!st.hasCommits) throw new HttpError(409, "This repository has no commits yet, so changes cannot be set aside.");
    if (st.files.length === 0) throw new HttpError(409, "There are no changes to set aside.");
    const msg = (typeof req.message === "string" ? req.message : "").replace(/[\r\n]+/g, " ").trim().slice(0, 200);
    const args = ["stash", "push", ...(req.includeUntracked === false ? [] : ["--include-untracked"]), "-m", msg || "Set aside with Pheme"];
    const r = await runGit(root, args, { literal: false });
    if (!r.ok || /No local changes/i.test(r.stdout)) throw new HttpError(409, lockMessage(r.stderr) ?? (/No local changes/i.test(r.stdout) ? "There are no changes to set aside." : r.stderr || "Could not set the changes aside."));
    return { stashed: true };
  });
}

async function indexOfStash(root: string, sha: string): Promise<number> {
  if (!/^[0-9a-f]{40}$/i.test(sha)) throw new HttpError(400, "That is not a stash.");
  const r = await runGit(root, ["stash", "list", "--format=%H"]);
  const i = r.stdout.split("\n").filter(Boolean).indexOf(sha.toLowerCase());
  if (i < 0) throw new HttpError(404, "That stash no longer exists. The list may have changed in another window.");
  return i;
}

/** Bring a stash back. By default the stash is removed once it applied cleanly; with conflicts it is kept. */
export function gitStashApply(cwd: string, sha: string, drop: boolean): Promise<{ applied: true; dropped: boolean }> {
  return withRepoLock(cwd, async () => {
    const root = await rootOf(cwd);
    await guardIdle(root);
    const idx = await indexOfStash(root, sha);
    const r = await runGit(root, ["stash", "apply", "--index", `stash@{${idx}}`], { literal: false });
    if (!r.ok) {
      const why = r.stderr + r.stdout;
      if (lockMessage(why)) throw new HttpError(409, lockMessage(why)!);
      if (/would be overwritten|Your local changes/i.test(why)) throw new HttpError(409, "Your current changes overlap with this stash. Commit or set aside your current changes first. Nothing was changed.");
      if (/CONFLICT|conflict/i.test(why)) throw new HttpError(409, "The stash came back with merge conflicts. The conflicting files are marked in the Changes list. The stash itself was kept, so nothing is lost.");
      throw new HttpError(409, why.split("\n").slice(0, 3).join(" ").slice(0, 400) || "Could not restore the stash.");
    }
    let dropped = false;
    if (drop) {
      const again = await indexOfStash(root, sha).catch(() => -1);
      if (again >= 0) dropped = (await runGit(root, ["stash", "drop", `stash@{${again}}`])).ok;
    }
    return { applied: true, dropped };
  });
}

export function gitStashDrop(cwd: string, sha: string): Promise<{ dropped: true }> {
  return withRepoLock(cwd, async () => {
    const root = await rootOf(cwd);
    const idx = await indexOfStash(root, sha);
    const r = await runGit(root, ["stash", "drop", `stash@{${idx}}`]);
    if (!r.ok) throw new HttpError(500, r.stderr || "Could not delete the stash.");
    return { dropped: true };
  });
}
