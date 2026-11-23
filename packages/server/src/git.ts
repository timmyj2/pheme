import { execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { HttpError } from "./http-error.ts";

const TIMEOUT_MS = 15_000;
const MAX_OUTPUT = 2_000_000; // bytes of stdout we will read from one git call
export const MAX_DIFF_CHARS = 200_000;

/** Validate a folder a user typed: must be an absolute path to an existing directory. Returns the normalised path. */
export function checkProjectDir(dir: string): string {
  if (typeof dir !== "string" || !dir.trim()) throw new HttpError(400, "Enter a folder path.");
  if (dir.length > 1000 || dir.includes("\0")) throw new HttpError(400, "That is not a valid folder path.");
  if (!path.isAbsolute(dir)) throw new HttpError(400, "Use the full path to the folder (for example /Users/you/project or C:\\Users\\you\\project).");
  const resolved = path.resolve(dir);
  let st: fs.Stats;
  try {
    st = fs.statSync(resolved);
  } catch {
    throw new HttpError(400, `That folder does not exist: ${resolved}`);
  }
  if (!st.isDirectory()) throw new HttpError(400, `That is a file, not a folder: ${resolved}`);
  return resolved;
}

export interface GitResult {
  ok: boolean;
  stdout: string;
  stderr: string;
  /** True when we stopped reading because the output was too large. */
  truncated: boolean;
}

/**
 * Run `git` with a fixed argument list (never through a shell), a timeout and an output cap.
 * Prompts are disabled so a missing credential fails instead of hanging.
 */
const MAX_CONCURRENT_GIT = 6;
let activeGit = 0;
const gitWaiters: (() => void)[] = [];
/** Wait for one of a few slots, so a burst of requests cannot start dozens of git processes at once. */
async function gitSlot(): Promise<() => void> {
  if (activeGit >= MAX_CONCURRENT_GIT) await new Promise<void>((resolve) => gitWaiters.push(resolve));
  activeGit++;
  let done = false;
  return () => {
    if (done) return;
    done = true;
    activeGit--;
    gitWaiters.shift()?.();
  };
}

export async function runGit(cwd: string, args: string[], opts: { input?: string; allowFail?: boolean; timeoutMs?: number } = {}): Promise<GitResult> {
  const release = await gitSlot();
  try {
    return await runGitNow(cwd, args, opts);
  } finally {
    release();
  }
}

function runGitNow(cwd: string, args: string[], opts: { input?: string; allowFail?: boolean; timeoutMs?: number } = {}): Promise<GitResult> {
  return new Promise((resolve) => {
    const child = execFile(
      "git",
      // Literal pathspecs: a file called "*.txt" or ":(exclude)x" is just a name, never a pattern.
      ["--literal-pathspecs", ...args],
      {
        cwd,
        timeout: opts.timeoutMs ?? TIMEOUT_MS,
        maxBuffer: MAX_OUTPUT,
        windowsHide: true,
        encoding: "utf8",
        env: { ...process.env, GIT_TERMINAL_PROMPT: "0", GIT_OPTIONAL_LOCKS: "0", LC_ALL: "C", GIT_PAGER: "cat" },
      },
      (err, stdout, stderr) => {
        const e = err as (NodeJS.ErrnoException & { code?: string | number; killed?: boolean }) | null;
        const truncated = !!e && e.code === "ERR_CHILD_PROCESS_STDIO_MAXBUFFER";
        if (e && e.code === "ENOENT") return resolve({ ok: false, stdout: "", stderr: "git is not installed or not on PATH.", truncated: false });
        if (e && e.killed) return resolve({ ok: false, stdout: String(stdout ?? ""), stderr: "git took too long and was stopped.", truncated: false });
        resolve({ ok: !e || truncated, stdout: String(stdout ?? ""), stderr: String(stderr ?? "").trim(), truncated });
      },
    );
    if (opts.input !== undefined) child.stdin?.end(opts.input);
  });
}

export type FileState = "modified" | "added" | "deleted" | "renamed" | "copied" | "untracked" | "conflicted" | "typechange";

export interface ChangedFile {
  path: string;
  /** Original path for a rename or copy. */
  from?: string;
  /** State in the index (staged). Empty string when nothing is staged for this file. */
  staged: FileState | "";
  /** State in the working tree (unstaged). Empty string when the file is clean there. */
  unstaged: FileState | "";
  additions: number;
  deletions: number;
  binary: boolean;
  /** Looks like a secret (keys, .env, credentials). Never committed without an explicit confirmation. */
  risky?: boolean;
}

export interface GitStatus {
  repo: boolean;
  /** Why this is not usable, in plain language. */
  problem?: string;
  root?: string;
  branch?: string;
  detached?: boolean;
  upstream?: string;
  ahead?: number;
  behind?: number;
  hasCommits?: boolean;
  /** On main/master or a detached HEAD: a commit here needs a new branch first. */
  protectedBranch?: boolean;
  /** Subject line of the most recent commit (used to pre-fill a pull request title). */
  lastSubject?: string;
  files: ChangedFile[];
  /** True when more files changed than we list. */
  moreFiles?: number;
}

const MAX_FILES = 500;
const PROTECTED = new Set(["main", "master", "trunk"]);

const RISKY = [/(^|\/)\.env(\..*)?$/i, /\.(pem|key|p12|pfx|jks|keystore|ppk|kdbx)$/i, /(^|\/)id_(rsa|dsa|ecdsa|ed25519)(\.pub)?$/i, /(^|\/)(credentials|secrets?)(\.[a-z]+)?$/i, /(^|\/)\.(npmrc|netrc|pypirc|git-credentials)$/i, /service-?account.*\.json$/i];
/** Heuristic: file names that usually hold secrets. Exported for tests. */
export function looksSecret(p: string): boolean {
  if (/\.(example|sample|template|dist|pub)$/i.test(p)) return false; // templates and public keys are fine to commit
  return RISKY.some((r) => r.test(p));
}

const LETTER: Record<string, FileState> = { M: "modified", A: "added", D: "deleted", R: "renamed", C: "copied", T: "typechange", U: "conflicted" };
const state = (c: string): FileState | "" => (c === "." || c === " " ? "" : (LETTER[c] ?? "modified"));

/** Parse `git status --porcelain=v2 --branch -z`. Exported for tests. */
export function parseStatus(out: string): Omit<GitStatus, "repo"> {
  const res: Omit<GitStatus, "repo"> = { files: [] };
  const parts = out.split("\0");
  for (let i = 0; i < parts.length; i++) {
    const line = parts[i];
    if (!line) continue;
    if (line.startsWith("# branch.head ")) {
      const h = line.slice(14);
      res.detached = h === "(detached)";
      res.branch = res.detached ? undefined : h;
    } else if (line.startsWith("# branch.upstream ")) res.upstream = line.slice(18);
    else if (line.startsWith("# branch.ab ")) {
      const m = /\+(\d+) -(\d+)/.exec(line);
      if (m) { res.ahead = Number(m[1]); res.behind = Number(m[2]); }
    } else if (line.startsWith("# branch.oid ")) res.hasCommits = line.slice(13) !== "(initial)";
    else if (line.startsWith("1 ")) {
      // 1 XY sub mH mI mW hH hI path
      const f = line.split(" ");
      const xy = f[1];
      res.files.push({ path: f.slice(8).join(" "), staged: state(xy[0]), unstaged: state(xy[1]), additions: 0, deletions: 0, binary: false });
    } else if (line.startsWith("2 ")) {
      // 2 XY sub mH mI mW hH hI Xscore path \0 origPath
      const f = line.split(" ");
      const xy = f[1];
      res.files.push({ path: f.slice(9).join(" "), from: parts[++i], staged: state(xy[0]), unstaged: state(xy[1]), additions: 0, deletions: 0, binary: false });
    } else if (line.startsWith("u ")) {
      const f = line.split(" ");
      res.files.push({ path: f.slice(10).join(" "), staged: "conflicted", unstaged: "conflicted", additions: 0, deletions: 0, binary: false });
    } else if (line.startsWith("? ")) {
      res.files.push({ path: line.slice(2), staged: "", unstaged: "untracked", additions: 0, deletions: 0, binary: false });
    }
  }
  return res;
}

/** Parse `git diff --numstat -z` output into path -> counts. Exported for tests. */
export function parseNumstat(out: string): Map<string, { a: number; d: number; binary: boolean }> {
  const map = new Map<string, { a: number; d: number; binary: boolean }>();
  const parts = out.split("\0");
  for (let i = 0; i < parts.length; i++) {
    const m = /^(-|\d+)\t(-|\d+)\t(.*)$/.exec(parts[i]);
    if (!m) continue;
    let p = m[3];
    if (p === "") { i += 2; p = parts[i] ?? ""; } // rename: "\0old\0new"
    const binary = m[1] === "-";
    map.set(p, { a: binary ? 0 : Number(m[1]), d: binary ? 0 : Number(m[2]), binary });
  }
  return map;
}

const statusInflight = new Map<string, Promise<GitStatus>>();
/** Identical status requests that arrive while one is running share its answer (the panel polls; several tabs may ask at once). */
export function gitStatus(cwd: string): Promise<GitStatus> {
  const running = statusInflight.get(cwd);
  if (running) return running;
  const p = gitStatusNow(cwd).finally(() => statusInflight.delete(cwd));
  statusInflight.set(cwd, p);
  return p;
}

async function gitStatusNow(cwd: string): Promise<GitStatus> {
  // A folder that was deleted or moved (or came from a restored backup made elsewhere) must not look like "git is missing".
  if (!fs.existsSync(cwd)) return { repo: false, files: [], problem: `This folder no longer exists: ${cwd}. Choose a folder again.` };
  const top = await runGit(cwd, ["rev-parse", "--show-toplevel"]);
  if (!top.ok) {
    const missing = /not installed/.test(top.stderr);
    return { repo: false, files: [], problem: missing ? top.stderr : "This folder is not a Git repository. Run `git init` in it to start tracking changes." };
  }
  const root = top.stdout.trim();
  const st = await runGit(cwd, ["status", "--porcelain=v2", "--branch", "-z", "--untracked-files=all"]);
  if (!st.ok) return { repo: true, root, files: [], problem: st.stderr || "Could not read the repository status." };
  const parsed = parseStatus(st.stdout);
  // Line counts: staged + unstaged against HEAD when there is one, else against the empty tree.
  const base = parsed.hasCommits === false ? ["--cached"] : ["HEAD"];
  const num = await runGit(cwd, ["diff", ...base, "--numstat", "-z", "--no-color", "--no-ext-diff"]);
  const counts = num.ok ? parseNumstat(num.stdout) : new Map();
  let moreFiles = 0;
  if (parsed.files.length > MAX_FILES) { moreFiles = parsed.files.length - MAX_FILES; parsed.files.length = MAX_FILES; }
  for (const f of parsed.files) {
    const c = counts.get(f.path);
    if (c) { f.additions = c.a; f.deletions = c.d; f.binary = c.binary; }
    else if (f.unstaged === "untracked") {
      // Untracked files do not appear in `git diff`; count their lines directly (bounded).
      try {
        const full = path.join(root, f.path);
        const stt = fs.statSync(full);
        if (stt.isFile() && stt.size < 1_000_000) {
          const buf = fs.readFileSync(full);
          if (buf.includes(0)) f.binary = true;
          else f.additions = buf.length === 0 ? 0 : buf.toString("utf8").split("\n").length - (buf[buf.length - 1] === 10 ? 1 : 0);
        }
      } catch { /* unreadable: leave zero */ }
    }
  }
  for (const f of parsed.files) if (looksSecret(f.path)) f.risky = true;
  const lastSubject = parsed.hasCommits === false ? undefined : (await runGit(root, ["log", "-1", "--format=%s"])).stdout.trim().slice(0, 256) || undefined;
  const protectedBranch = parsed.detached === true || (!!parsed.branch && PROTECTED.has(parsed.branch));
  return { repo: true, root, ...parsed, protectedBranch, lastSubject, files: parsed.files, ...(moreFiles ? { moreFiles } : {}) };
}

export interface FileDiff {
  path: string;
  diff: string;
  binary: boolean;
  truncated: boolean;
}

/** Reject paths that could escape the repository. A leading "-" is fine: every call passes paths after `--` with literal pathspecs. */
export function safeRepoPath(p: string): string {
  if (typeof p !== "string" || !p || p.includes("\0") || p.length > 1000) throw new HttpError(400, "Bad file path.");
  if (path.isAbsolute(p) || p.split(/[\\/]/).includes("..")) throw new HttpError(400, "Bad file path.");
  return p;
}

/** Unified diff of one file against HEAD (staged and unstaged together). Untracked files are shown as all-added. */
export async function gitDiff(cwd: string, file: string): Promise<FileDiff> {
  const f = safeRepoPath(file);
  if (!fs.existsSync(cwd)) throw new HttpError(400, `This folder no longer exists: ${cwd}`);
  const root = (await runGit(cwd, ["rev-parse", "--show-toplevel"])).stdout.trim();
  if (!root) throw new HttpError(400, "This folder is not a Git repository.");
  const tracked = await runGit(root, ["ls-files", "--error-unmatch", "--", f]);
  const head = await runGit(root, ["rev-parse", "--verify", "-q", "HEAD"]);
  let r: GitResult;
  if (tracked.ok) r = await runGit(root, ["diff", head.ok ? "HEAD" : "--cached", "--no-color", "--no-ext-diff", "--", f]);
  else r = await runGit(root, ["diff", "--no-index", "--no-color", "--no-ext-diff", "--", process.platform === "win32" ? "NUL" : "/dev/null", f], { allowFail: true });
  // `--no-index` exits 1 when files differ; that is the normal case, so the text is what matters.
  const text = r.stdout;
  const binary = /^Binary files .* differ$/m.test(text) || /^GIT binary patch/m.test(text);
  const truncated = r.truncated || text.length > MAX_DIFF_CHARS;
  return { path: f, diff: binary ? "" : text.slice(0, MAX_DIFF_CHARS), binary, truncated };
}

// ---------------------------------------------------------------------------------------------------------------------
// Commit and undo
// ---------------------------------------------------------------------------------------------------------------------

export interface CommitRequest {
  message: string;
  /** Files to include (as listed by gitStatus). Everything else stays exactly as it is, unstaged. */
  paths: string[];
  /** Name for a new branch to commit on. Required on main/master or a detached HEAD. */
  branch?: string;
  /** Secret-looking files the user explicitly confirmed. */
  allowRisky?: string[];
}
export interface CommitResult {
  sha: string;
  short: string;
  branch: string;
  summary: string;
  files: number;
}

const COMMIT_TIMEOUT_MS = 90_000; // pre-commit hooks can be slow

export async function validBranchName(cwd: string, name: string): Promise<boolean> {
  if (!name || name.length > 200 || name.startsWith("-")) return false;
  return (await runGit(cwd, ["check-ref-format", "--branch", name])).ok;
}

/** A readable branch name from a commit message: "Fix login bug!" -> "fix-login-bug". */
export function branchFromMessage(message: string): string {
  const slug = message.split("\n")[0].toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40).replace(/-+$/g, "");
  return `pheme/${slug || "changes"}`;
}

/** A first-guess commit message from the file list (no AI, no quota). Exported for tests. */
export function draftMessage(files: Pick<ChangedFile, "path" | "staged" | "unstaged">[]): string {
  if (!files.length) return "";
  const kind = (f: Pick<ChangedFile, "staged" | "unstaged">) => (f.unstaged === "untracked" || f.staged === "added" ? "added" : f.staged === "deleted" || f.unstaged === "deleted" ? "deleted" : f.staged === "renamed" ? "renamed" : "modified");
  const kinds = new Set(files.map(kind));
  const verb = kinds.size === 1 ? { added: "Add", deleted: "Remove", renamed: "Rename", modified: "Update" }[[...kinds][0] as "added"] : "Update";
  const names = files.map((f) => f.path.split("/").pop() ?? f.path);
  const shown = names.slice(0, 3).join(", ");
  return `${verb} ${shown}${names.length > 3 ? ` and ${names.length - 3} more` : ""}`;
}

const repoLocks = new Map<string, Promise<unknown>>();
/** Run git-changing operations on one repository one at a time. Two clicks, two tabs or two chats on the same repo queue up. */
async function withRepoLock<T>(cwd: string, fn: () => Promise<T>): Promise<T> {
  const key = (await runGit(cwd, ["rev-parse", "--show-toplevel"])).stdout.trim() || cwd;
  const before = repoLocks.get(key) ?? Promise.resolve();
  const mine = before.catch(() => {}).then(fn);
  const tail = mine.catch(() => {});
  repoLocks.set(key, tail);
  try {
    return await mine;
  } finally {
    if (repoLocks.get(key) === tail) repoLocks.delete(key);
  }
}

/** Turn git's lock-file complaint into something a person can act on. */
function lockMessage(why: string): string | null {
  return /index\.lock|Unable to create .*\.lock|another git process/i.test(why)
    ? "Another Git operation is running in this folder (another app, a second tab, or a crashed earlier one). Wait a moment and try again. If it keeps happening, close other Git tools and delete the file .git/index.lock."
    : null;
}

export function gitCommit(cwd: string, req: CommitRequest): Promise<CommitResult> {
  return withRepoLock(cwd, () => gitCommitNow(cwd, req));
}

async function gitCommitNow(cwd: string, req: CommitRequest): Promise<CommitResult> {
  const message = typeof req.message === "string" ? req.message.replace(/\r\n/g, "\n").trim() : "";
  if (!message) throw new HttpError(400, "Write a commit message first.");
  if (message.length > 10_000) throw new HttpError(400, "That commit message is too long (10,000 characters at most).");
  if (!Array.isArray(req.paths) || req.paths.length === 0) throw new HttpError(400, "Tick at least one file to commit.");
  if (req.paths.length > MAX_FILES) throw new HttpError(400, `Too many files at once (${MAX_FILES} at most).`);
  const status = await gitStatus(cwd);
  if (!status.repo || !status.root) throw new HttpError(400, status.problem ?? "This folder is not a Git repository.");
  const root = status.root;
  const byPath = new Map(status.files.map((f) => [f.path, f]));
  const chosen: ChangedFile[] = [];
  for (const p of new Set(req.paths)) {
    safeRepoPath(p);
    const f = byPath.get(p);
    if (!f) throw new HttpError(409, `"${p}" has no changes to commit any more. Refresh and try again.`);
    chosen.push(f);
  }
  if (chosen.some((f) => f.unstaged === "conflicted")) throw new HttpError(409, "Resolve the merge conflicts first, then commit.");
  const risky = chosen.filter((f) => f.risky && !(req.allowRisky ?? []).includes(f.path));
  if (risky.length) throw new HttpError(409, `These look like secrets and were not committed: ${risky.map((f) => f.path).join(", ")}. Untick them, or confirm you really want them in Git.`);

  // Everything below can fail half-way (a hook, a missing Git identity). Remember how things were so a failure leaves no trace.
  const indexSnapshot = (await runGit(root, ["write-tree"])).stdout.trim();
  const original = status.detached ? (await runGit(root, ["rev-parse", "HEAD"])).stdout.trim() : (status.branch ?? "");
  let createdBranch = "";
  const rollback = async () => {
    if (createdBranch) {
      await runGit(root, status.detached ? ["switch", "--detach", original] : ["switch", original]);
      await runGit(root, ["branch", "-D", createdBranch]);
      createdBranch = "";
    }
    if (indexSnapshot) await runGit(root, ["read-tree", indexSnapshot]); // the index exactly as it was; the working tree is untouched
  };

  // Where to commit: never straight onto main/master/detached HEAD.
  let branch = status.branch ?? "";
  if (status.protectedBranch) {
    const name = (req.branch ?? "").trim();
    if (!name) throw new HttpError(409, status.detached ? "HEAD is detached. Enter a branch name to commit on." : `You are on ${status.branch}. Enter a new branch name to commit on.`);
    if (!(await validBranchName(root, name))) throw new HttpError(400, `"${name}" is not a valid branch name (no spaces, no "..", no trailing dot).`);
    if ((await runGit(root, ["rev-parse", "--verify", "-q", `refs/heads/${name}`])).ok) throw new HttpError(409, `A branch called "${name}" already exists. Pick another name.`);
    // `switch -c` keeps the working tree and index as they are.
    const sw = await runGit(root, ["switch", "-c", name]);
    if (!sw.ok) throw new HttpError(409, sw.stderr || "Could not create the branch.");
    branch = name;
    createdBranch = name;
  } else if (req.branch?.trim() && req.branch.trim() !== branch) {
    throw new HttpError(400, "A new branch is only needed when you are on main or master.");
  }

  // Make the index contain exactly the chosen files: stage them, and unstage anything else that was staged.
  const wanted = new Set<string>();
  const toAdd = new Set<string>();
  for (const f of chosen) { wanted.add(f.path); toAdd.add(f.path); if (f.from) wanted.add(f.from); }
  const unstage = status.files.filter((f) => f.staged && !wanted.has(f.path)).flatMap((f) => (f.from ? [f.path, f.from] : [f.path]));
  if (unstage.length) {
    const r = await runGit(root, status.hasCommits ? ["reset", "-q", "HEAD", "--", ...unstage] : ["rm", "--cached", "-r", "-q", "--", ...unstage]);
    if (!r.ok) { await rollback(); throw new HttpError(lockMessage(r.stderr) ? 409 : 500, lockMessage(r.stderr) ?? (r.stderr || "Could not set aside the files you did not tick.")); }
  }
  const add = await runGit(root, ["add", "-A", "--", ...toAdd]);
  if (!add.ok) { await rollback(); throw new HttpError(lockMessage(add.stderr) ? 409 : 500, lockMessage(add.stderr) ?? (add.stderr || "Could not stage the files.")); }

  // Message on stdin: no quoting problems, no length limit from the command line.
  const c = await runGit(root, ["commit", "-q", "-F", "-"], { input: message + "\n", timeoutMs: COMMIT_TIMEOUT_MS });
  if (!c.ok) {
    await rollback();
    const why = (c.stderr || c.stdout).trim();
    const locked = lockMessage(why);
    if (locked) throw new HttpError(409, locked);
    if (/tell me who you are|Please tell me|empty ident|unable to auto-detect|useConfigOnly/i.test(why)) throw new HttpError(409, 'Git does not know who you are yet. In a terminal run:  git config --global user.name "Your Name"  and  git config --global user.email "you@example.com"  then try again.');
    if (/nothing (added )?to commit|no changes added/i.test(why)) throw new HttpError(409, "Nothing to commit: the chosen files have no changes.");
    throw new HttpError(409, why || "git commit failed.");
  }
  const sha = (await runGit(root, ["rev-parse", "HEAD"])).stdout.trim();
  const summary = (await runGit(root, ["log", "-1", "--format=%s"])).stdout.trim();
  return { sha, short: sha.slice(0, 7), branch, summary, files: chosen.length };
}

/**
 * Undo the last commit, keeping every change in the working tree and index (`reset --soft`).
 * Only allowed when HEAD is still the commit the caller made and it has not been pushed.
 */
export function gitUndo(cwd: string, sha: string): Promise<{ undone: string }> {
  return withRepoLock(cwd, () => gitUndoNow(cwd, sha));
}

async function gitUndoNow(cwd: string, sha: string): Promise<{ undone: string }> {
  if (!/^[0-9a-f]{7,64}$/i.test(sha ?? "")) throw new HttpError(400, "Bad commit id.");
  const root = (await runGit(cwd, ["rev-parse", "--show-toplevel"])).stdout.trim();
  if (!root) throw new HttpError(400, "This folder is not a Git repository.");
  const head = (await runGit(root, ["rev-parse", "HEAD"])).stdout.trim();
  if (!head.toLowerCase().startsWith(sha.toLowerCase())) throw new HttpError(409, "Something else has been committed since, so this undo is no longer safe. Use Git directly.");
  const parents = (await runGit(root, ["rev-list", "--parents", "-n", "1", "HEAD"])).stdout.trim().split(" ");
  if (parents.length < 2) throw new HttpError(409, "This is the first commit in the repository; there is nothing to go back to.");
  if (parents.length > 2) throw new HttpError(409, "This is a merge commit. Undo it with Git directly.");
  const remote = await runGit(root, ["branch", "-r", "--contains", "HEAD"]);
  if (remote.stdout.trim()) throw new HttpError(409, "This commit has already been pushed, so it cannot be undone from here.");
  const r = await runGit(root, ["reset", "--soft", "HEAD~1"]);
  if (!r.ok) throw new HttpError(lockMessage(r.stderr) ? 409 : 500, lockMessage(r.stderr) ?? (r.stderr || "Could not undo the commit."));
  return { undone: head.slice(0, 7) };
}

// ---------------------------------------------------------------------------------------------------------------------
// Push and pull requests
// ---------------------------------------------------------------------------------------------------------------------

const GH_TIMEOUT_MS = 45_000;
const PUSH_TIMEOUT_MS = 90_000;

/** Run the GitHub CLI with a fixed argument list. Never prompts. */
export function runGh(cwd: string, args: string[], opts: { input?: string; timeoutMs?: number } = {}): Promise<GitResult> {
  return new Promise((resolve) => {
    const child = execFile(
      "gh",
      args,
      { cwd, timeout: opts.timeoutMs ?? GH_TIMEOUT_MS, maxBuffer: MAX_OUTPUT, windowsHide: true, encoding: "utf8", env: { ...process.env, GH_PROMPT_DISABLED: "1", NO_COLOR: "1", GH_NO_UPDATE_NOTIFIER: "1", GH_SPINNER_DISABLED: "1" } },
      (err, stdout, stderr) => {
        const e = err as (NodeJS.ErrnoException & { killed?: boolean }) | null;
        if (e && e.code === "ENOENT") return resolve({ ok: false, stdout: "", stderr: "gh is not installed", truncated: false });
        if (e && e.killed) return resolve({ ok: false, stdout: String(stdout ?? ""), stderr: "GitHub took too long to answer.", truncated: false });
        resolve({ ok: !e, stdout: String(stdout ?? ""), stderr: String(stderr ?? "").trim(), truncated: false });
      },
    );
    if (opts.input !== undefined) child.stdin?.end(opts.input);
  });
}

/** Parse a GitHub remote URL (https, ssh or scp-style) into owner and repo. Returns null for other hosts. Exported for tests. */
export function parseGithubRemote(url: string): { host: string; owner: string; repo: string } | null {
  const u = url.trim();
  const m = /^(?:https?:\/\/(?:[^@/]+@)?|ssh:\/\/(?:[^@/]+@)?|git@)([^/:]+)[/:](?:\d+\/)?([^/]+)\/([^/]+?)(?:\.git)?\/?$/.exec(u);
  if (!m) return null;
  return { host: m[1].toLowerCase(), owner: m[2], repo: m[3] };
}

/** Link that opens GitHub's "create pull request" page for a branch; used when the GitHub CLI is not available. */
export function compareUrl(remoteUrl: string, base: string, branch: string): string | null {
  const r = parseGithubRemote(remoteUrl);
  if (!r) return null;
  const enc = (x: string) => x.split("/").map(encodeURIComponent).join("/");
  return `https://${r.host}/${encodeURIComponent(r.owner)}/${encodeURIComponent(r.repo)}/compare/${enc(base)}...${enc(branch)}?expand=1`;
}

export interface PrInfo {
  number: number;
  url: string;
  title: string;
  state: string;
  draft: boolean;
  /** "passing" | "failing" | "pending" | "none" */
  checks: "passing" | "failing" | "pending" | "none";
}

export interface RemoteInfo {
  /** Name of the remote we push to (origin when it exists). */
  remote?: string;
  url?: string;
  github: boolean;
  ghInstalled: boolean;
  ghSignedIn: boolean;
  branch?: string;
  upstream?: string;
  ahead: number;
  behind: number;
  defaultBase?: string;
  pr?: PrInfo;
  compareUrl?: string;
  /** Plain-language reason push or PR is not possible right now. */
  problem?: string;
}

function summariseChecks(rollup: unknown): PrInfo["checks"] {
  if (!Array.isArray(rollup) || rollup.length === 0) return "none";
  let pending = false;
  for (const c of rollup as { status?: string; conclusion?: string; state?: string }[]) {
    const concl = (c.conclusion ?? c.state ?? "").toUpperCase();
    if (["FAILURE", "ERROR", "TIMED_OUT", "CANCELLED", "ACTION_REQUIRED", "STARTUP_FAILURE"].includes(concl)) return "failing";
    if ((c.status && c.status.toUpperCase() !== "COMPLETED") || concl === "PENDING" || concl === "") pending = true;
  }
  return pending ? "pending" : "passing";
}

export async function gitRemoteInfo(cwd: string): Promise<RemoteInfo> {
  const st = await gitStatus(cwd);
  const info: RemoteInfo = { github: false, ghInstalled: false, ghSignedIn: false, ahead: st.ahead ?? 0, behind: st.behind ?? 0, branch: st.branch, upstream: st.upstream };
  if (!st.repo || !st.root) return { ...info, problem: st.problem ?? "This folder is not a Git repository." };
  const remotes = (await runGit(st.root, ["remote"])).stdout.split("\n").map((x) => x.trim()).filter(Boolean);
  if (!remotes.length) return { ...info, problem: "This repository has no remote yet. Add one with:  git remote add origin <url>" };
  info.remote = remotes.includes("origin") ? "origin" : remotes[0];
  info.url = (await runGit(st.root, ["remote", "get-url", info.remote])).stdout.trim();
  info.github = !!parseGithubRemote(info.url) && parseGithubRemote(info.url)!.host.includes("github");
  const ver = await runGh(st.root, ["--version"]);
  info.ghInstalled = ver.ok;
  if (info.ghInstalled && info.github) {
    const host = parseGithubRemote(info.url)!.host;
    info.ghSignedIn = (await runGh(st.root, ["auth", "status", "--hostname", host])).ok;
    if (info.ghSignedIn) {
      const def = await runGh(st.root, ["repo", "view", "--json", "defaultBranchRef", "--jq", ".defaultBranchRef.name"]);
      if (def.ok && def.stdout.trim()) info.defaultBase = def.stdout.trim();
      if (st.branch && !st.protectedBranch) {
        const pr = await runGh(st.root, ["pr", "list", "--head", st.branch, "--state", "open", "--json", "number,url,title,state,isDraft,statusCheckRollup", "--limit", "1"]);
        if (pr.ok) {
          try {
            const [first] = JSON.parse(pr.stdout || "[]") as { number: number; url: string; title: string; state: string; isDraft: boolean; statusCheckRollup: unknown }[];
            if (first) info.pr = { number: first.number, url: first.url, title: first.title, state: first.state, draft: first.isDraft, checks: summariseChecks(first.statusCheckRollup) };
          } catch { /* unreadable answer: show no PR */ }
        }
      }
    }
  }
  const base = info.defaultBase ?? (await runGit(st.root, ["symbolic-ref", "--short", "-q", `refs/remotes/${info.remote}/HEAD`])).stdout.trim().replace(`${info.remote}/`, "") ?? "main";
  info.defaultBase = base || "main";
  if (st.branch && info.url) info.compareUrl = compareUrl(info.url, info.defaultBase, st.branch) ?? undefined;
  if (st.detached) info.problem = "HEAD is detached. Switch to a branch first.";
  else if (st.protectedBranch) info.problem = `You are on ${st.branch}. Commit to a new branch, then push that.`;
  return info;
}

/** Push the current branch to its remote with an upstream. Never forces; refuses main/master/trunk and a detached HEAD. */
export function gitPush(cwd: string): Promise<{ branch: string; remote: string; output: string }> {
  return withRepoLock(cwd, () => gitPushNow(cwd));
}

async function gitPushNow(cwd: string): Promise<{ branch: string; remote: string; output: string }> {
  const st = await gitStatus(cwd);
  if (!st.repo || !st.root) throw new HttpError(400, st.problem ?? "This folder is not a Git repository.");
  if (st.detached || !st.branch) throw new HttpError(409, "HEAD is detached. Switch to a branch first.");
  if (st.protectedBranch) throw new HttpError(409, `Pheme will not push ${st.branch} directly. Commit to a new branch and push that.`);
  if (!st.hasCommits) throw new HttpError(409, "There is nothing to push yet. Make a commit first.");
  const remotes = (await runGit(st.root, ["remote"])).stdout.split("\n").map((x) => x.trim()).filter(Boolean);
  if (!remotes.length) throw new HttpError(409, "This repository has no remote. Add one with:  git remote add origin <url>");
  const remote = remotes.includes("origin") ? "origin" : remotes[0];
  if (!(await validBranchName(st.root, st.branch))) throw new HttpError(400, "That branch name cannot be pushed.");
  // No --force of any kind. `--` is not valid before refspecs here, so the branch name was checked above (it cannot start with "-").
  const r = await runGit(st.root, ["push", "--set-upstream", remote, `refs/heads/${st.branch}:refs/heads/${st.branch}`], { timeoutMs: PUSH_TIMEOUT_MS });
  if (!r.ok) {
    const why = r.stderr || r.stdout;
    if (/non-fast-forward|fetch first|rejected/i.test(why)) throw new HttpError(409, "GitHub already has different commits on this branch. Pull or rebase in a terminal, then push again. Pheme never force-pushes.");
    if (/could not read Username|Authentication failed|Permission denied|403|terminal prompts disabled|invalid credentials/i.test(why)) throw new HttpError(409, "Git could not sign in to GitHub. Run `gh auth login` (or sign in with your usual Git credentials) in a terminal, then try again.");
    if (/Could not resolve host|unable to access|Connection (timed out|refused)|Network is unreachable/i.test(why)) throw new HttpError(409, "Could not reach GitHub. Check your internet connection and try again.");
    if (/repository not found|does not exist|does not appear to be a git repository|correct access rights/i.test(why)) throw new HttpError(409, "GitHub says that repository does not exist or you do not have access to it.");
    throw new HttpError(409, why.split("\n").slice(-3).join(" ").slice(0, 400) || "git push failed.");
  }
  return { branch: st.branch, remote, output: (r.stderr || r.stdout).slice(0, 2000) };
}

export interface PrRequest { title: string; body?: string; base?: string; draft?: boolean }

/** Open a pull request for the current branch with the GitHub CLI. The branch must already be pushed. */
export async function gitCreatePr(cwd: string, req: PrRequest): Promise<{ url: string; number?: number }> {
  const title = typeof req.title === "string" ? req.title.trim() : "";
  if (!title) throw new HttpError(400, "Write a title for the pull request.");
  if (title.length > 256) throw new HttpError(400, "That title is too long (256 characters at most).");
  const body = typeof req.body === "string" ? req.body : "";
  if (body.length > 60_000) throw new HttpError(400, "That description is too long.");
  const info = await gitRemoteInfo(cwd);
  if (info.problem) throw new HttpError(409, info.problem);
  if (!info.github) throw new HttpError(409, "Pull requests need a GitHub remote.");
  if (!info.ghInstalled) throw new HttpError(409, "The GitHub CLI (gh) is not installed." + (info.compareUrl ? " Open the link to create the pull request in your browser." : ""));
  if (!info.ghSignedIn) throw new HttpError(409, "The GitHub CLI is not signed in. Run `gh auth login` in a terminal, then try again.");
  if (info.pr) throw new HttpError(409, `A pull request is already open for this branch: ${info.pr.url}`);
  if (!info.upstream) throw new HttpError(409, "Push the branch first, then open the pull request.");
  if (info.ahead > 0) throw new HttpError(409, `${info.ahead} commit${info.ahead === 1 ? " is" : "s are"} not pushed yet. Push first so the pull request includes them.`);
  const base = (req.base ?? "").trim() || info.defaultBase || "main";
  if (!(await validBranchName(cwd, base))) throw new HttpError(400, `"${base}" is not a valid branch name.`);
  if (base === info.branch) throw new HttpError(400, "The base branch cannot be the same as this branch.");
  const args = ["pr", "create", "--title", title, "--body-file", "-", "--base", base, "--head", info.branch!];
  if (req.draft) args.push("--draft");
  const r = await runGh(cwd, args, { input: body, timeoutMs: 60_000 });
  if (!r.ok) {
    const why = r.stderr || r.stdout;
    if (/already exists/i.test(why)) throw new HttpError(409, why.split("\n")[0]);
    if (/No commits between|no commits/i.test(why)) throw new HttpError(409, `This branch has no commits that ${base} does not already have, so there is nothing to propose.`);
    throw new HttpError(409, why.split("\n").slice(0, 3).join(" ").slice(0, 400) || "Could not create the pull request.");
  }
  const url = r.stdout.trim().split("\n").filter((l) => /^https?:\/\//.test(l)).pop() ?? "";
  if (!url) throw new HttpError(500, "The pull request may have been created, but GitHub did not return its address. Check GitHub.");
  const num = /\/pull\/(\d+)/.exec(url)?.[1];
  return { url, number: num ? Number(num) : undefined };
}
