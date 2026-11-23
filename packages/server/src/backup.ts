import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { HttpError } from "./http-error.ts";

export const BACKUP_FORMAT = "pheme-backup";
export const BACKUP_VERSION = 1;
/** Largest data folder we will back up (uncompressed bytes). */
export const MAX_BACKUP_BYTES = 300_000_000;
const MAX_FILES = 50_000;
const MAX_PATH = 300;
const KEEP_AUTO_BACKUPS = 5;

/** Only these top-level names are ever backed up or restored. Anything else in an archive is refused. */
const TOP_LEVEL = new Set(["sessions", "skills", "agents", "memory", "settings.json", "usage.json", "jobs.json", "curator.json", "skill-usage.json", "agent-runs.json"]);

interface Entry { path: string; b64: string }
interface Archive { format: string; version: number; createdAt: number; appVersion?: string; files: Entry[] }

export interface BackupPreview {
  createdAt: number;
  appVersion?: string;
  files: number;
  chats: number;
  skills: number;
  agents: number;
  hasMemory: boolean;
  hasSettings: boolean;
  /** Files in the archive that do not exist here yet. */
  newFiles: number;
  /** Files that exist here and would be replaced if "overwrite" is chosen. */
  existingFiles: number;
  /** Chats in the archive that already exist here. */
  existingChats: number;
}

/** Validate one archive path. Returns the normalised relative path (forward slashes) or throws. Exported for tests. */
export function safeArchivePath(p: unknown): string {
  if (typeof p !== "string" || !p || p.length > MAX_PATH) throw new HttpError(400, "The backup contains an invalid file name.");
  if (/[\\\0:*?"<>|]/.test(p) || p.startsWith("/")) throw new HttpError(400, `The backup contains a file name that is not allowed: ${JSON.stringify(p.slice(0, 60))}`);
  const parts = p.split("/");
  for (const s of parts) {
    if (!s || s === "." || s === ".." || /[. ]$/.test(s)) throw new HttpError(400, `The backup contains a file name that is not allowed: ${JSON.stringify(p.slice(0, 60))}`);
    if ([...s].some((c) => c.charCodeAt(0) < 32)) throw new HttpError(400, "The backup contains an invalid file name.");
  }
  if (!TOP_LEVEL.has(parts[0])) throw new HttpError(400, `The backup contains something Pheme does not store: ${JSON.stringify(parts[0].slice(0, 40))}`);
  return parts.join("/");
}

function listFiles(root: string): string[] {
  const out: string[] = [];
  const walk = (dir: string, rel: string) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (!rel && !TOP_LEVEL.has(e.name)) continue; // lock file, backups folder, anything unknown
      if (e.isSymbolicLink()) continue; // never follow links out of the data folder
      if (e.isDirectory()) walk(path.join(dir, e.name), r);
      else if (e.isFile() && !e.name.endsWith(".tmp")) out.push(r);
    }
  };
  if (fs.existsSync(root)) walk(root, "");
  return out.sort();
}

/** Build a backup of the data folder as one gzip file. */
export function createBackup(dataDir: string, appVersion?: string, now = Date.now()): Buffer {
  const files = listFiles(dataDir);
  if (files.length > MAX_FILES) throw new HttpError(413, `There are too many files to back up here (${files.length}).`);
  let total = 0;
  const entries: Entry[] = [];
  for (const rel of files) {
    const buf = fs.readFileSync(path.join(dataDir, ...rel.split("/")));
    total += buf.length;
    if (total > MAX_BACKUP_BYTES) throw new HttpError(413, "Your data is too large to back up in one file (over 300 MB). Copy the data folder by hand instead.");
    entries.push({ path: rel, b64: buf.toString("base64") });
  }
  const archive: Archive = { format: BACKUP_FORMAT, version: BACKUP_VERSION, createdAt: now, appVersion, files: entries };
  return zlib.gzipSync(Buffer.from(JSON.stringify(archive)), { level: 6 });
}

export function backupFileName(now = Date.now()): string {
  const d = new Date(now);
  const p = (n: number) => String(n).padStart(2, "0");
  return `pheme-backup-${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}-${p(d.getUTCHours())}${p(d.getUTCMinutes())}.pheme-backup`;
}

/** Decompress and validate an archive. Never writes anything. */
export function readBackup(data: Buffer): Archive {
  if (!data.length) throw new HttpError(400, "That file is empty.");
  let raw: Buffer;
  try {
    // The cap stops a tiny file that expands to gigabytes (a "zip bomb").
    raw = zlib.gunzipSync(data, { maxOutputLength: Math.ceil(MAX_BACKUP_BYTES * 1.4) + 1_000_000 });
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ERR_BUFFER_TOO_LARGE") throw new HttpError(413, "That backup is too large to restore here.");
    throw new HttpError(400, "That is not a Pheme backup file (it could not be opened).");
  }
  let a: Archive;
  try { a = JSON.parse(raw.toString("utf8")) as Archive; } catch { throw new HttpError(400, "That is not a Pheme backup file (its contents are damaged)."); }
  if (!a || a.format !== BACKUP_FORMAT) throw new HttpError(400, "That is not a Pheme backup file.");
  if (a.version !== BACKUP_VERSION) throw new HttpError(400, `This backup was made by a ${a.version > BACKUP_VERSION ? "newer" : "different"} version of Pheme (backup format ${String(a.version)}) and cannot be restored here.`);
  if (!Array.isArray(a.files)) throw new HttpError(400, "That backup is damaged (no file list).");
  if (a.files.length > MAX_FILES) throw new HttpError(400, "That backup has too many files.");
  const seen = new Set<string>();
  let total = 0;
  for (const f of a.files) {
    const p = safeArchivePath(f?.path);
    if (seen.has(p.toLowerCase())) throw new HttpError(400, `That backup lists the same file twice: ${p}`);
    seen.add(p.toLowerCase());
    if (typeof f.b64 !== "string" || /[^A-Za-z0-9+/=]/.test(f.b64)) throw new HttpError(400, `That backup is damaged (bad data for ${p}).`);
    total += Math.floor((f.b64.length * 3) / 4);
    if (total > MAX_BACKUP_BYTES) throw new HttpError(413, "That backup is too large to restore here.");
    f.path = p;
  }
  return a;
}

export function previewBackup(data: Buffer, dataDir: string): BackupPreview {
  const a = readBackup(data);
  const chats = new Set<string>();
  const skills = new Set<string>();
  const agents = new Set<string>();
  let existing = 0;
  const existingChats = new Set<string>();
  for (const f of a.files) {
    const parts = f.path.split("/");
    const here = fs.existsSync(path.join(dataDir, ...parts));
    if (here) existing++;
    if (parts[0] === "sessions" && parts[1]) {
      const id = parts[1].replace(/\.(jsonl|meta\.json)$/, "");
      chats.add(id);
      if (here) existingChats.add(id);
    }
    if (parts[0] === "skills" && parts[1] && parts[1] !== ".archive") skills.add(parts[1]);
    if (parts[0] === "agents" && parts[1] && parts[1] !== ".archive" && parts[1].endsWith(".md")) agents.add(parts[1]);
  }
  return {
    createdAt: a.createdAt,
    appVersion: a.appVersion,
    files: a.files.length,
    chats: chats.size,
    skills: skills.size,
    agents: agents.size,
    hasMemory: a.files.some((f) => f.path.startsWith("memory/")),
    hasSettings: a.files.some((f) => f.path === "settings.json"),
    newFiles: a.files.length - existing,
    existingFiles: existing,
    existingChats: existingChats.size,
  };
}

export interface RestoreResult { written: number; skipped: number; safetyBackup?: string }

/**
 * Restore an archive into the data folder. Files that already exist are kept unless `overwrite` is set.
 * Before writing, the current data is saved to `backups/` so a mistake can be undone.
 */
export function applyBackup(data: Buffer, dataDir: string, opts: { overwrite: boolean; appVersion?: string; now?: number }): RestoreResult {
  const a = readBackup(data); // validate everything first: nothing is written if any entry is bad
  let safetyBackup: string | undefined;
  const hasData = listFiles(dataDir).length > 0;
  if (hasData) {
    const dir = path.join(dataDir, "backups");
    fs.mkdirSync(dir, { recursive: true });
    safetyBackup = `before-restore-${backupFileName(opts.now)}`;
    fs.writeFileSync(path.join(dir, safetyBackup), createBackup(dataDir, opts.appVersion, opts.now));
    const old = fs.readdirSync(dir).filter((n) => n.startsWith("before-restore-")).sort();
    for (const n of old.slice(0, Math.max(0, old.length - KEEP_AUTO_BACKUPS))) fs.rmSync(path.join(dir, n), { force: true });
  }
  const root = path.resolve(dataDir);
  let written = 0, skipped = 0;
  for (const f of a.files) {
    const dest = path.resolve(root, ...f.path.split("/"));
    if (!dest.startsWith(root + path.sep)) throw new HttpError(400, "The backup contains a file that points outside the data folder."); // second line of defence
    if (fs.existsSync(dest) && !opts.overwrite) { skipped++; continue; }
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    const tmp = `${dest}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, Buffer.from(f.b64, "base64"));
    fs.renameSync(tmp, dest);
    written++;
  }
  return { written, skipped, safetyBackup };
}
