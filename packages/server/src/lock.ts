import fs from "node:fs";
import path from "node:path";

function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    // EPERM means the process exists but belongs to someone else.
    return (e as NodeJS.ErrnoException).code === "EPERM";
  }
}

/**
 * One Pheme per data folder: two would both run scheduled jobs and reviews and race on the same files.
 * Returns a release function, or throws with a friendly message if another live instance holds the lock.
 */
export function acquireLock(dataDir: string, pid = process.pid): () => void {
  fs.mkdirSync(dataDir, { recursive: true });
  const file = path.join(dataDir, "pheme.lock");
  try {
    const other = Number(fs.readFileSync(file, "utf8").trim());
    if (Number.isInteger(other) && other !== pid && alive(other)) {
      throw new Error(`Pheme is already running with this data folder (process ${other}). Use the window that is already open, or close it first.`);
    }
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "ENOENT" && (e as Error).message.startsWith("Pheme is already")) throw e;
  }
  fs.writeFileSync(file, String(pid));
  return () => {
    try {
      if (fs.readFileSync(file, "utf8").trim() === String(pid)) fs.rmSync(file, { force: true });
    } catch {
      /* already gone */
    }
  };
}

export function parsePort(value: string | undefined, fallback: number): number {
  if (value === undefined) return fallback;
  const n = value.trim() === "" ? NaN : Number(value);
  if (!Number.isInteger(n) || n < 0 || n > 65535) throw new Error(`--port must be a whole number from 0 to 65535 (got "${value}")`);
  return n;
}
