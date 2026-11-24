import fs from "node:fs";
import path from "node:path";
import { HttpError } from "./http-error.ts";

/** How many names one folder listing will return. The rest are counted, not sent. */
export const MAX_DIR_ENTRIES = 300;

export interface DirEntry {
  name: string;
  dir: boolean;
}

export interface DirList {
  /** Folder name shown in the panel header. Not a full path. */
  label: string;
  /** Path under the root, using `/`. Empty at the root. */
  path: string;
  /** Path of the parent folder, or null at the root. */
  parent: string | null;
  entries: DirEntry[];
  /** Names that did not fit in `entries`. */
  more: number;
}

/**
 * List one folder under `root`. `rel` is a relative path (`a/b`). A symlink or `..`
 * that would leave the root is refused. Names only: file contents are never read.
 */
export function listDir(root: string, rel = ""): DirList {
  if (typeof rel !== "string" || rel.includes("\0") || rel.length > 1000) throw new HttpError(400, "That is not a valid folder path.");
  let base: string;
  try { base = fs.realpathSync(root); } catch { throw new HttpError(400, "That folder does not exist."); }
  const target = path.resolve(base, rel.split("/").join(path.sep));
  let real: string;
  try { real = fs.realpathSync(target); } catch { throw new HttpError(400, "That folder does not exist."); }
  const fromRoot = path.relative(base, real);
  if (fromRoot.startsWith(`..${path.sep}`) || fromRoot === ".." || path.isAbsolute(fromRoot)) {
    throw new HttpError(400, "That folder is outside the one this panel can show.");
  }
  let st: fs.Stats;
  try { st = fs.statSync(real); } catch { throw new HttpError(400, "That folder does not exist."); }
  if (!st.isDirectory()) throw new HttpError(400, "That is a file, not a folder.");
  let names: fs.Dirent[];
  try { names = fs.readdirSync(real, { withFileTypes: true }); } catch { throw new HttpError(403, "Pheme cannot read that folder."); }
  const shown = fromRoot === "" ? "" : fromRoot.split(path.sep).join("/");
  const entries = names
    .filter((d) => d.name !== "." && d.name !== ".." && !d.name.includes("\0"))
    .map((d) => ({ name: d.name, dir: d.isDirectory() }))
    .sort((a, b) => Number(b.dir) - Number(a.dir) || a.name.localeCompare(b.name));
  const parent = shown === "" ? null : shown.includes("/") ? shown.slice(0, shown.lastIndexOf("/")) : "";
  return {
    label: path.basename(real) || real,
    path: shown,
    parent,
    entries: entries.slice(0, MAX_DIR_ENTRIES),
    more: Math.max(0, entries.length - MAX_DIR_ENTRIES),
  };
}
